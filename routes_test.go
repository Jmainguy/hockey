package main

import (
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPlayerMediaRoutes(t *testing.T) {
	oldBase, oldUpstream := forgeBaseURL, upstream
	defer func() { forgeBaseURL, upstream = oldBase, oldUpstream }()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tag := r.URL.Query().Get("tags.slug"); tag != "playerid-8478402" && tag != "teamid-22" {
			t.Errorf("wrong player tag: %s", r.URL.RawQuery)
		}
		if r.URL.Path == "/photos" && (r.URL.Query().Get("$limit") != "24" || r.URL.Query().Get("$skip") != "24") {
			t.Errorf("wrong photo page: %s", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"items":[],"pagination":{}}`))
	}))
	defer server.Close()
	forgeBaseURL, upstream = server.URL, testClient()
	for _, path := range []string{"/api/player-media/8478402/videos", "/api/player-media/8478402/photos?skip=24"} {
		w := httptest.NewRecorder()
		newRouter().ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || !json.Valid(w.Body.Bytes()) || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("media route %s: %d %s", path, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	newRouter().ServeHTTP(w, httptest.NewRequest("GET", "/api/team-media/edm/videos", nil))
	if w.Code != 200 || !json.Valid(w.Body.Bytes()) {
		t.Fatalf("team media route: %d %s", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/player-media/8478402/photos?skip=-1", "/api/player-media/8478402/photos?skip=1", "/api/player-media/abc/videos", "/api/player-media/8478402/articles"} {
		w := httptest.NewRecorder()
		newRouter().ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code < 400 {
			t.Fatalf("invalid media route accepted: %s", path)
		}
	}
}

func TestPlayerPhotoDownload(t *testing.T) {
	oldBase := playerImageBaseURL
	defer func() { playerImageBaseURL = oldBase }()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/t_ratio4_3-size40/prd/photo123" {
			t.Errorf("wrong image path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte("photo bytes"))
	}))
	defer server.Close()
	playerImageBaseURL = server.URL
	w := httptest.NewRecorder()
	newRouter().ServeHTTP(w, httptest.NewRequest("GET", "/api/player-photo/photo123?size=40", nil))
	if w.Code != 200 || w.Body.String() != "photo bytes" || !strings.Contains(w.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("photo download failed: %d %s", w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/player-photo/photo123?size=100", "/api/player-photo/photo-123?size=40"} {
		w := httptest.NewRecorder()
		newRouter().ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code < 400 {
			t.Fatalf("invalid photo accepted: %s", path)
		}
	}
}

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
