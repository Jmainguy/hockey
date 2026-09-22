package main

import (
	"context"
	"github.com/gorilla/mux"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func writeDataHeaders(w http.ResponseWriter, e cacheEntry) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Data-Updated", e.UpdatedAt.UTC().Format(time.RFC3339))
	if time.Now().After(e.FreshUntil) {
		w.Header().Set("X-Data-Stale", "true")
	}
}
func dataUnavailable(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", "60")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`{"error":"Hockey data is temporarily unavailable. Please try again shortly."}`))
}
func responseHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		if teamID := vars["teamId"]; teamID != "" {
			abbr := strings.ToUpper(teamID)
			if id, err := strconv.Atoi(teamID); err == nil {
				abbr = teamIDToAbbr[id]
			}
			if _, err := catalogTeamDetails(abbr); err != nil {
				http.NotFound(w, r)
				return
			}
		}
		for _, key := range []string{"playerId", "gameId"} {
			if id := vars[key]; id != "" {
				if _, err := strconv.ParseUint(id, 10, 64); err != nil || len(id) > 10 {
					http.NotFound(w, r)
					return
				}
			}
		}
		if team := vars["teamAbbrev"]; team != "" {
			if _, err := catalogTeamDetails(team); err != nil {
				http.NotFound(w, r)
				return
			}
		}
		if season := r.URL.Query().Get("season"); season != "" && season != "now" {
			if _, err := strconv.ParseUint(season, 10, 64); err != nil || len(season) != 8 {
				http.Error(w, "Invalid season", 400)
				return
			}
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
			defer cancel()
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}
