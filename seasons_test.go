package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHistoricalSeasonRouting(t *testing.T) {
	old, base := upstream, BaseURL
	defer func() { upstream = old; BaseURL = base }()
	var dates []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		dates = append(dates, r.URL.Path)
		switch r.URL.Path {
		case "/standings-season":
			_, _ = w.Write([]byte(`{"currentDate":"2026-04-17","seasons":[{"id":20242025,"standingsEnd":"2025-04-17","standingsStart":"2024-10-01"},{"id":20262027,"standingsEnd":"2027-04-17","standingsStart":"2026-10-01"}]}`))
		case "/standings/2025-04-17":
			_, _ = w.Write([]byte(`{"standings":[{"seasonId":20242025,"teamName":{"default":"Florida Panthers"},"teamAbbrev":{"default":"FLA"},"points":98}]}`))
		case "/playoff-bracket/2025":
			_, _ = w.Write([]byte(`{"series":[{"playoffRound":4,"winningTeamId":13}]}`))
		default:
			t.Errorf("unexpected fetch %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	upstream = testClient()
	BaseURL = srv.URL
	router := newRouter()
	for _, path := range []string{"/api/standings?season=20242025", "/api/playoff-bracket?season=20242025"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || !strings.Contains(w.Body.String(), "20242025") {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body.String())
		}
	}
	for _, path := range []string{"/api/standings?season=20232024", "/api/playoff-bracket?season=20242026"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 400 {
			t.Fatalf("bad season accepted: %d", w.Code)
		}
	}
	if len(dates) != 3 {
		t.Fatalf("unexpected upstream calls %v", dates)
	}
}
