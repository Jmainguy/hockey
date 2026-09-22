package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func testClient() *upstreamClient {
	c := newUpstreamClient()
	c.limiter = rate.NewLimiter(rate.Inf, 1)
	return c
}
func waitFetches(t *testing.T, c *upstreamClient) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		n := len(c.calls)
		c.mu.Unlock()
		if n == 0 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("fetch did not finish")
}
func TestConcurrentMissesShareOneFetch(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		time.Sleep(20 * time.Millisecond)
		_, _ = w.Write([]byte(`{"gameWeek":[]}`))
	}))
	defer server.Close()
	c := testClient()
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e, err := c.get(context.Background(), server.URL+"/schedule/today")
			if err != nil || len(e.Data) == 0 {
				t.Errorf("fetch failed: %v", err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("got %d upstream requests, want 1", calls.Load())
	}
}
func TestStaleSnapshotReturnsImmediatelyAndRecovers(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		_, _ = w.Write([]byte(`{"value":"new"}`))
	}))
	defer server.Close()
	c := testClient()
	old := c.save(server.URL, []byte(`{"value":"old"}`), -time.Second)
	begin := time.Now()
	got, err := c.get(context.Background(), server.URL)
	if err != nil || string(got.Data) != string(old.Data) || time.Since(begin) > 100*time.Millisecond {
		t.Fatal("stale cache did not return promptly")
	}
	<-started
	close(release)
	waitFetches(t, c)
	got, err = c.get(context.Background(), server.URL)
	if err != nil || string(got.Data) != `{"value":"new"}` {
		t.Fatalf("did not refresh: %s %v", got.Data, err)
	}
}
func Test429CooldownProtectsOtherResources(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "120")
		w.WriteHeader(429)
	}))
	defer server.Close()
	c := testClient()
	start := time.Now()
	if _, err := c.get(context.Background(), server.URL+"/one"); err == nil {
		t.Fatal("expected 429 error")
	}
	if _, err := c.get(context.Background(), server.URL+"/two"); err == nil {
		t.Fatal("expected cooldown")
	}
	if calls.Load() != 1 || time.Since(start) > time.Second {
		t.Fatal("throttling retried or blocked")
	}
	c.mu.Lock()
	remaining := time.Until(c.cooldown)
	c.mu.Unlock()
	if remaining < 119*time.Second {
		t.Fatal("Retry-After was not honored")
	}
}
func TestStaleSurvives429AndInvalidJSON(t *testing.T) {
	for _, status := range []int{429, 200} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte("not JSON"))
			}))
			defer server.Close()
			c := testClient()
			c.save(server.URL, []byte(`{"saved":true}`), -time.Second)
			_, _ = c.get(context.Background(), server.URL)
			waitFetches(t, c)
			e, err := c.get(context.Background(), server.URL)
			if err != nil || string(e.Data) != `{"saved":true}` {
				t.Fatal("lost saved snapshot")
			}
		})
	}
}
func TestCancelStopsWaitingWithoutBreakingOtherReaders(t *testing.T) {
	start := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(start); <-release; _, _ = w.Write([]byte(`{}`)) }))
	defer server.Close()
	c := testClient()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error)
	go func() { _, err := c.get(ctx, server.URL); done <- err }()
	<-start
	cancel()
	select {
	case err := <-done:
		if err != context.Canceled {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled wait stuck")
	}
	close(release)
	waitFetches(t, c)
	if _, err := c.get(context.Background(), server.URL); err != nil {
		t.Fatal(err)
	}
}
func TestResourceTTLs(t *testing.T) {
	live := []byte(`{"gameWeek":[{"games":[{"gameState":"LIVE"}]}]}`)
	if !scheduleHasLiveGame(live) || resourceTTL("/schedule/now", live) != 20*time.Second {
		t.Fatal("live schedule schema not recognized")
	}
	if resourceTTL("/roster/CAR/now", []byte(`{}`)) <= 0 {
		t.Fatal("roster never expires")
	}
	if resourceTTL("/gamecenter/1/landing", []byte(`{"gameState":"OFF"}`)) != 24*time.Hour {
		t.Fatal("final game refreshes too frequently")
	}
}
func TestHandlersUseCacheAndDirectorySurvivesOutage(t *testing.T) {
	oldClient, oldBase := upstream, BaseURL
	defer func() { upstream = oldClient; BaseURL = oldBase }()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch r.URL.Path {
		case "/gamecenter/1/landing":
			_, _ = w.Write([]byte(`{"id":1,"gameState":"OFF","homeTeam":{},"awayTeam":{}}`))
		case "/schedule/2026-09-22":
			_, _ = w.Write([]byte(`{"gameWeek":[]}`))
		default:
			w.WriteHeader(429)
		}
	}))
	defer server.Close()
	upstream = testClient()
	BaseURL = server.URL
	router := newRouter()
	for _, path := range []string{"/api/gamecenter/1/landing", "/api/gamecenter/1/landing", "/api/schedule/2026-09-22", "/api/schedule/2026-09-22"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("game/schedule duplicate fetches: %d", calls.Load())
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/api/standings", nil))
	if w.Code != 503 {
		t.Fatal("expected unavailable standings")
	}
	before := calls.Load()
	for _, path := range []string{"/api/teams", "/api/team/car"} {
		w = httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatal("directory depends on upstream")
		}
	}
	if calls.Load() != before {
		t.Fatal("directory made an upstream request")
	}
	var teams TeamsResponse
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/api/teams", nil))
	_ = json.Unmarshal(w.Body.Bytes(), &teams)
	if len(teams.Teams) != 32 || teams.StandingsAvailable {
		t.Fatal("incorrect fallback catalog")
	}
}
func TestEmptyStandingsAreCachedWithoutHistoricalScan(t *testing.T) {
	oldClient, oldBase := upstream, BaseURL
	defer func() { upstream = oldClient; BaseURL = oldBase }()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/standings/now" {
			t.Error("unexpected historical scan", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"standings":[]}`))
	}))
	defer server.Close()
	upstream = testClient()
	BaseURL = server.URL
	for i := 0; i < 3; i++ {
		teams, err := GetAllTeams()
		if err != nil || teams.StandingsAvailable || len(teams.Teams) != 32 {
			t.Fatal("bad empty season fallback")
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("empty response was not cached: %d", calls.Load())
	}
}
func TestRosterUsesBulkStatsAndPreservesZero(t *testing.T) {
	oldClient, oldBase := upstream, BaseURL
	defer func() { upstream = oldClient; BaseURL = oldBase }()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path == "/club-stats/CAR/now" {
			_, _ = w.Write([]byte(`{"season":"20252026","skaters":[{"playerId":1,"gamesPlayed":10,"goals":0,"plusMinus":0}]}`))
		} else {
			_, _ = w.Write([]byte(`{"forwards":[{"id":1,"firstName":{"default":"Test"},"lastName":{"default":"Player"}},{"id":2}],"defensemen":[],"goalies":[]}`))
		}
	}))
	defer server.Close()
	upstream = testClient()
	BaseURL = server.URL
	roster, err := GetRoster(context.Background(), "car")
	if err != nil {
		t.Fatal(err)
	}
	if len(roster.Players) != 2 || roster.Season != 20252026 || roster.Players[0].Stats == nil || roster.Players[1].Stats != nil {
		t.Fatalf("invalid roster %+v", roster)
	}
	if calls.Load() != 2 {
		t.Fatalf("roster fanout: %d", calls.Load())
	}
	b, _ := json.Marshal(roster.Players[0].Stats)
	var raw map[string]any
	_ = json.Unmarshal(b, &raw)
	if raw["plusMinus"] != float64(0) {
		t.Fatal("zero +/- vanished")
	}
}

func TestRosterSelectedSeasonUsesMatchingRosterAndStats(t *testing.T) {
	old, base := upstream, BaseURL
	defer func() { upstream = old; BaseURL = base }()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/roster/bos/20232024":
			_, _ = w.Write([]byte(`{"forwards":[{"id":1}],"defensemen":[],"goalies":[]}`))
		case "/club-stats/BOS/20232024/2":
			_, _ = w.Write([]byte(`{"season":"20232024","skaters":[{"playerId":1,"gamesPlayed":82,"points":67}]}`))
		default:
			t.Errorf("wrong season resource: %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	upstream = testClient()
	BaseURL = server.URL
	roster, err := GetRoster(context.Background(), "bos", "20232024")
	if err != nil {
		t.Fatal(err)
	}
	if roster.Season != 20232024 || len(roster.Players) != 1 || roster.Players[0].Stats == nil || roster.Players[0].Stats.Points != 67 {
		t.Fatalf("wrong historical stats %+v", roster)
	}
}
