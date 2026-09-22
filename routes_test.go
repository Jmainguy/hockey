package main

import (
	"encoding/json"
	"encoding/xml"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublicRoutesAndMetadata(t *testing.T) {
	router := newRouter()
	for _, path := range []string{"/", "/scores", "/standings", "/team/car", "/player/8478427", "/game/2026010024", "/team-schedule/car", "/coach?team=car", "/trivia?team=car", "/playoff-series/20252026/A"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("%s failed: %d", path, w.Code)
		}
		html := w.Body.String()
		if strings.Contains(html, "cdn.tailwindcss.com") || !strings.Contains(html, `rel="canonical"`) {
			t.Fatalf("%s runtime CSS or missing metadata", path)
		}
		start := strings.Index(html, `<script type="application/ld+json">`) + len(`<script type="application/ld+json">`)
		end := strings.Index(html[start:], "</script>") + start
		if !json.Valid([]byte(html[start:end])) {
			t.Fatal("invalid structured data", path)
		}
	}
	for _, path := range []string{"/missing", "/team/nope", "/player/abc", "/game/abc", "/api/team/nope"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 404 {
			t.Fatalf("%s should be 404; got %d", path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/sitemap.xml", nil))
	var data struct {
		URLs []struct {
			Loc string `xml:"loc"`
		} `xml:"url"`
	}
	if xml.Unmarshal(w.Body.Bytes(), &data) != nil || len(data.URLs) != 67 {
		t.Fatal("invalid/incomplete sitemap")
	}
	for _, path := range []string{"/robots.txt", "/llms.txt", "/healthz", "/static/utilities.css", "/static/design.css", "/static/site.js"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 {
			t.Fatal("missing route", path)
		}
	}
}
