package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestRedisSharesSnapshotsAndDeduplicatesReplicas(t *testing.T) {
	db := miniredis.RunT(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		time.Sleep(30 * time.Millisecond)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	a, b := testClient(), testClient()
	a.redis = redis.NewClient(&redis.Options{Addr: db.Addr()})
	b.redis = redis.NewClient(&redis.Options{Addr: db.Addr()})
	defer func() { _ = a.redis.Close() }()
	defer func() { _ = b.redis.Close() }()
	var wg sync.WaitGroup
	for _, c := range []*upstreamClient{a, b} {
		wg.Add(1)
		go func(c *upstreamClient) {
			defer wg.Done()
			if _, err := c.get(context.Background(), server.URL); err != nil {
				t.Error(err)
			}
		}(c)
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("replicas fetched %d times", calls.Load())
	}
	restarted := testClient()
	restarted.redis = a.redis
	if e, err := restarted.get(context.Background(), server.URL); err != nil || string(e.Data) != `{"ok":true}` {
		t.Fatal("snapshot missing after restart", err)
	}
	if calls.Load() != 1 {
		t.Fatal("restart missed shared cache")
	}
}
func TestRedisCooldownAppliesAcrossReplicas(t *testing.T) {
	db := miniredis.RunT(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "90")
		w.WriteHeader(429)
	}))
	defer server.Close()
	a, b := testClient(), testClient()
	a.redis = redis.NewClient(&redis.Options{Addr: db.Addr()})
	b.redis = redis.NewClient(&redis.Options{Addr: db.Addr()})
	defer func() { _ = a.redis.Close() }()
	defer func() { _ = b.redis.Close() }()
	_, _ = a.get(context.Background(), server.URL+"/first")
	_, _ = b.get(context.Background(), server.URL+"/second")
	if calls.Load() != 1 {
		t.Fatalf("cooldown not shared: %d", calls.Load())
	}
}
func TestRedisLeaseCannotBeDeletedByPreviousOwner(t *testing.T) {
	db := miniredis.RunT(t)
	c := testClient()
	c.redis = redis.NewClient(&redis.Options{Addr: db.Addr()})
	defer func() { _ = c.redis.Close() }()
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(started); <-release; _, _ = w.Write([]byte(`{}`)) }))
	defer server.Close()
	done := make(chan struct{})
	go func() { _, _ = c.get(context.Background(), server.URL); close(done) }()
	<-started
	key := redisKey(server.URL) + ":lock"
	if err := db.Set(key, "new-owner"); err != nil {
		t.Fatal(err)
	}
	close(release)
	<-done
	if owner, _ := db.Get(key); owner != "new-owner" {
		t.Fatal("previous fetch deleted new owner's lease")
	}
}
func TestEmptyRefreshDoesNotDestroyLastStandings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"standings":[]}`)) }))
	defer server.Close()
	c := testClient()
	url := server.URL + "/standings/now"
	c.save(url, []byte(`{"standings":[{"date":"2026-04-17"}]}`), -time.Second)
	_, _ = c.get(context.Background(), url)
	waitFetches(t, c)
	e, ok := c.cached(url)
	if !ok || !hasNonEmptyStandingsJSON(e.Data) {
		t.Fatal("empty refresh discarded useful snapshot")
	}
}
