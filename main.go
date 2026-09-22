package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

//go:embed static templates
var embeddedFiles embed.FS

func newRouter() *mux.Router {
	router := mux.NewRouter()

	// Static files - serve from embedded FS
	staticFS, err := fs.Sub(embeddedFiles, "static")
	if err != nil {
		log.Fatal(err)
	}
	var assetFS http.FileSystem = http.FS(staticFS)
	if dir := os.Getenv("FRONTEND_DIST_DIR"); dir != "" {
		assetFS = http.Dir(dir)
	}
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(assetFS)))

	// Routes
	router.HandleFunc("/", handleIndex).Methods("GET")
	router.HandleFunc("/standings", handleStandings).Methods("GET")
	router.HandleFunc("/scores", handleScores).Methods("GET")
	router.HandleFunc("/team/{teamId}", handleTeam).Methods("GET")
	router.HandleFunc("/team-schedule/{teamId}", handleTeamSchedule).Methods("GET")
	router.HandleFunc("/trivia", handleTrivia).Methods("GET")
	router.HandleFunc("/coach", handleCoach).Methods("GET")
	router.HandleFunc("/player/{playerId}", handlePlayer).Methods("GET")
	router.HandleFunc("/game/{gameId}", handleGamePage).Methods("GET")
	router.HandleFunc("/playoff-series/{seasonId:[0-9]{8}}/{seriesLetter:[a-zA-Z]}", handlePlayoffSeriesPage).Methods("GET")
	router.HandleFunc("/api/teams", handleAPITeams).Methods("GET")
	router.HandleFunc("/api/standings-seasons", handleStandingsSeasons).Methods("GET")
	router.HandleFunc("/api/standings", handleAPIStandings).Methods("GET")
	router.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }).Methods("GET")
	router.HandleFunc("/api/playoff-bracket", handleAPIPlayoffBracket).Methods("GET")
	router.HandleFunc("/api/schedule/playoff-series/{seasonId:[0-9]{8}}/{seriesLetter:[a-zA-Z]}", handleAPIPlayoffSeriesSchedule).Methods("GET")
	router.HandleFunc("/api/team/{teamId}", handleAPITeamDetails).Methods("GET")
	router.HandleFunc("/api/roster-seasons/{teamId}", handleRosterSeasons).Methods("GET")
	router.HandleFunc("/api/roster/{teamId}", handleAPIRoster).Methods("GET")
	router.HandleFunc("/api/prospects/{teamAbbrev}", handleAPIProspects).Methods("GET")
	router.HandleFunc("/api/player/{playerId}", handleAPIPlayer).Methods("GET")
	router.HandleFunc("/api/player-bio/{playerId}", handleAPIPlayerBio).Methods("GET")
	router.HandleFunc("/api/schedule/{date}", handleAPISchedule).Methods("GET")
	router.HandleFunc("/api/team-schedule/{teamId}", handleAPITeamSchedule).Methods("GET")
	router.HandleFunc("/api/gamecenter/{gameId}/landing", handleAPIGameLanding).Methods("GET")
	router.HandleFunc("/api/team-news/{teamId}", handleAPITeamNews).Methods("GET")
	router.HandleFunc("/api/team-transactions/{teamId}", handleAPITeamTransactions).Methods("GET")
	router.HandleFunc("/api/videos/{gameId}", handleAPIVideos).Methods("GET")

	registerDiscoveryRoutes(router)
	router.Use(responseHeaders)
	return router
}
func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: newRouter(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, WriteTimeout: 20 * time.Second}
	log.Printf("Hockey listening on http://localhost:%s", port)
	log.Fatal(server.ListenAndServe())
}

func serveEmbeddedFile(w http.ResponseWriter, r *http.Request, filename string) {
	content, err := embeddedFiles.ReadFile(filepath.Join("templates", filename))
	if dir := os.Getenv("TEMPLATES_DIR"); dir != "" {
		content, err = os.ReadFile(filepath.Join(dir, filename))
	}
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	content = addPageMetadata(content, r)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(content); err != nil {
		log.Printf("Error writing response: %v", err)
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "index.html")
}

func handleStandings(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "standings.html")
}

func handleScores(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "scores.html")
}

func handleTeam(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]
	// If teamId is numeric, try to map to abbreviation and redirect to abbrev-based URL
	if teamID != "" {
		if id, err := strconv.Atoi(teamID); err == nil {
			if abbr, ok := teamIDToAbbr[id]; ok && abbr != "" {
				http.Redirect(w, r, fmt.Sprintf("/team/%s", strings.ToLower(abbr)), http.StatusFound)
				return
			}
		}
	}
	serveEmbeddedFile(w, r, "team.html")
}

func handleGamePage(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "game.html")
}

func handlePlayoffSeriesPage(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "playoff-series.html")
}

func handleTrivia(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "trivia.html")
}

func handleCoach(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "coach.html")
}

func handlePlayer(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "player.html")
}

func handleTeamSchedule(w http.ResponseWriter, r *http.Request) {
	serveEmbeddedFile(w, r, "team-schedule.html")
}

func handleAPITeams(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = catalogResponse().WriteJSON(w)
}
func handleAPIStandings(w http.ResponseWriter, r *http.Request) {
	url := BaseURL + "/standings/now"
	if season := r.URL.Query().Get("season"); season != "" {
		seasons, err := standingsSeasons(r.Context())
		if err != nil {
			dataUnavailable(w)
			return
		}
		found := false
		for _, item := range seasons.Seasons {
			if strconv.Itoa(item.ID) == season {
				if r.URL.Query().Get("phase") == "preseason" {
					teams, err := getPreseason(r.Context(), item.ID, item.Start, item.End)
					if err != nil {
						dataUnavailable(w)
						return
					}
					writeDataHeaders(w, cacheEntry{UpdatedAt: teams.UpdatedAt, FreshUntil: time.Now().Add(time.Minute)})
					if teams.Stale {
						w.Header().Set("X-Data-Stale", "true")
					}
					w.Header().Set("Content-Type", "application/json")
					_ = teams.WriteJSON(w)
					return
				}
				if item.Start > seasons.CurrentDate {
					w.Header().Set("Content-Type", "application/json")
					_ = (&TeamsResponse{Season: item.ID, RegularSeasonStart: item.Start, Teams: []Team{}}).WriteJSON(w)
					return
				}
				date := item.End
				if seasons.CurrentDate < date {
					date = seasons.CurrentDate
				}
				url = BaseURL + "/standings/" + date
				found = true
				break
			}
		}
		if !found {
			http.Error(w, "Unknown season", http.StatusBadRequest)
			return
		}
	}
	e, err := upstream.get(r.Context(), url)
	if err != nil {
		dataUnavailable(w)
		return
	}
	teams, err := parseStandings(e.Data)
	if err != nil {
		dataUnavailable(w)
		return
	}
	teams.UpdatedAt = e.UpdatedAt
	teams.Stale = time.Now().After(e.FreshUntil)
	writeDataHeaders(w, e)
	w.Header().Set("Content-Type", "application/json")
	_ = teams.WriteJSON(w)
}

func handleAPIPlayoffBracket(w http.ResponseWriter, r *http.Request) {
	season := r.URL.Query().Get("season")
	if season == "" {
		season = fmt.Sprint(currentSeasonID())
	}
	start, err := strconv.Atoi(season[:min(4, len(season))])
	if err != nil || len(season) != 8 || season != fmt.Sprintf("%d%d", start, start+1) || start < 1917 || start > time.Now().Year() {
		http.Error(w, "Invalid season", 400)
		return
	}
	e, err := upstream.get(r.Context(), fmt.Sprintf("%s/playoff-bracket/%d", BaseURL, start+1))
	if err != nil {
		dataUnavailable(w)
		return
	}
	var payload map[string]interface{}
	if json.Unmarshal(e.Data, &payload) != nil {
		dataUnavailable(w)
		return
	}
	payload["seasonId"] = season
	writeDataHeaders(w, e)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func handleAPIPlayoffSeriesSchedule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	data, err := GetPlayoffSeriesScheduleJSON(vars["seasonId"], vars["seriesLetter"])
	if err != nil {
		if strings.Contains(err.Error(), "404") {
			http.Error(w, "series not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing playoff series schedule JSON: %v", err)
	}
}

func handleAPITeamDetails(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]

	team, err := GetTeamDetails(teamID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := team.WriteJSON(w); err != nil {
		log.Printf("Error writing team JSON: %v", err)
	}
}

func handleAPIRoster(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]

	roster, err := GetRoster(r.Context(), teamID, r.URL.Query().Get("season"))
	if err != nil {
		dataUnavailable(w)
		return
	}

	w.Header().Set("X-Data-Updated", roster.UpdatedAt.UTC().Format(time.RFC3339))
	if roster.Stale {
		w.Header().Set("X-Data-Stale", "true")
	}
	w.Header().Set("Content-Type", "application/json")
	if err := roster.WriteJSON(w); err != nil {
		log.Printf("Error writing roster JSON: %v", err)
	}
}

func handleAPIProspects(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamAbbrev := vars["teamAbbrev"]

	data, err := GetProspects(teamAbbrev)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing prospects response: %v", err)
	}
}

func handleAPIPlayer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerID := vars["playerId"]

	entry, err := upstream.get(r.Context(), fmt.Sprintf("%s/player/%s/landing", BaseURL, playerID))
	if err != nil {
		dataUnavailable(w)
		return
	}
	writeDataHeaders(w, entry)
	data := []byte(entry.Data)

	// Parse the JSON to enrich with team abbreviations
	var playerData map[string]interface{}
	if err := json.Unmarshal(data, &playerData); err != nil {
		// If parsing fails, just return raw data
		w.Header().Set("Content-Type", "application/json")
		if _, werr := w.Write(data); werr != nil {
			log.Printf("Error writing response: %v", werr)
		}
		return
	}

	// Enrich seasonTotals with team abbreviations
	if seasonTotals, ok := playerData["seasonTotals"].([]interface{}); ok {
		for _, seasonEntry := range seasonTotals {
			if season, ok := seasonEntry.(map[string]interface{}); ok {
				// Try to get team name and map to abbreviation
				if teamNameObj, ok := season["teamName"].(map[string]interface{}); ok {
					if teamName, ok := teamNameObj["default"].(string); ok {
						if abbrev, exists := teamNameToAbbr[teamName]; exists {
							season["teamAbbrev"] = abbrev
						}
					}
				}
				// Fallback: try teamId if available
				if teamIDFloat, ok := season["teamId"].(float64); ok {
					teamID := int(teamIDFloat)
					if abbrev, exists := teamIDToAbbr[teamID]; exists {
						season["teamAbbrev"] = abbrev
					}
				}
			}
		}
	}

	// Return enriched data
	enrichedData, err := json.Marshal(playerData)
	if err != nil {
		// If marshaling fails, return original data
		w.Header().Set("Content-Type", "application/json")
		if _, werr := w.Write(data); werr != nil {
			log.Printf("Error writing response: %v", werr)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(enrichedData); err != nil {
		log.Printf("Error writing enriched data: %v", err)
	}

}

func handleAPIPlayerBio(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerID := vars["playerId"]

	// Construct biography API URL
	url := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/players?tags.slug=playerid-%s", playerID)
	cacheKey := fmt.Sprintf("player-bio:%s", playerID)

	body, err := fetchURLContext(r.Context(), url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for player bio %s, trying Redis", playerID)
			cachedData, cacheErr := getCachedRaw(cacheKey)
			if cacheErr == nil {
				log.Printf("Found cached player bio for %s in Redis", playerID)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached player bio response: %v", writeErr)
				}
				return
			}
			log.Printf("No cached player bio for %s in Redis: %v", playerID, cacheErr)
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() {
		if err := body.Close(); err != nil {
			log.Printf("Error closing response body: %v", err)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing bio data: %v", err)
		return
	}

	// Cache the successful response in Redis
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache player bio for %s: %v", playerID, setErr)
	}
}

func handleAPISchedule(w http.ResponseWriter, r *http.Request) {
	date := mux.Vars(r)["date"]
	if _, err := time.Parse("2006-01-02", date); err != nil {
		http.Error(w, "Invalid date", http.StatusBadRequest)
		return
	}
	entry, err := upstream.get(r.Context(), BaseURL+"/schedule/"+date)
	if err != nil {
		dataUnavailable(w)
		return
	}
	writeDataHeaders(w, entry)
	_, _ = w.Write(entry.Data)
}

func handleAPIGameLanding(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameID := vars["gameId"]

	entry, err := upstream.get(r.Context(), fmt.Sprintf("%s/gamecenter/%s/landing", BaseURL, gameID))
	if err != nil {
		dataUnavailable(w)
		return
	}
	writeDataHeaders(w, entry)
	rawData := []byte(entry.Data)
	landing := &GameLanding{}
	if json.Unmarshal(rawData, landing) != nil {
		landing = nil
	}

	// Unmarshal to a generic map so we can add fields
	var payload map[string]interface{}
	if err := json.Unmarshal(rawData, &payload); err != nil {
		// If unmarshal fails, return raw data
		w.Header().Set("Content-Type", "application/json")
		if _, werr := w.Write(rawData); werr != nil {
			log.Printf("Error writing landing data: %v", werr)
		}
		return
	}

	// If the teams in this landing are non‑NHL (Olympic/international), attach
	// the available team info (name, logo, place, id, abbrev) so the frontend
	// can render branding even when we don't have an NHL roster for them.
	for _, side := range []string{"homeTeam", "awayTeam"} {
		if tRaw, ok := payload[side]; ok {
			if tMap, ok := tRaw.(map[string]interface{}); ok {
				abbrev := ""
				if a, ok := tMap["abbrev"].(string); ok {
					abbrev = a
				}
				if _, known := abbrevToTeamID[abbrev]; !known {
					info := make(map[string]interface{})
					// Copy common fields if present
					fields := []string{"id", "abbrev", "logo", "darkLogo", "placeName", "placeNameWithPreposition", "awaySplitSquad", "homeSplitSquad"}
					for _, f := range fields {
						if v, ok := tMap[f]; ok {
							info[f] = v
						}
					}
					// Extract a human-friendly name from commonName.default when available
					if cn, ok := tMap["commonName"].(map[string]interface{}); ok {
						if d, ok := cn["default"].(string); ok {
							info["name"] = d
						}
						info["commonName"] = cn
					} else if s, ok := tMap["commonName"].(string); ok {
						info["name"] = s
					}
					info["international"] = true
					// Attach as sideInfo (e.g., homeTeamInfo) for the frontend to consume
					payload[side+"Info"] = info
				}
			}
		}
	}

	// Attach discreteClips and clockText
	clips := ExtractDiscreteClips(landing)
	// Always attach as an array (possibly empty) so client doesn't get null
	payload["discreteClips"] = clips
	payload["clockText"] = ClockText(landing)

	enriched, err := json.Marshal(payload)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if _, werr := w.Write(rawData); werr != nil {
			log.Printf("Error writing landing data: %v", werr)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(enriched); err != nil {
		log.Printf("Error writing landing data: %v", err)
	}
}

func handleAPITeamSchedule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]

	// Get team abbreviation from ID
	teamDetails, err := GetTeamDetails(teamID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(teamDetails.Teams) == 0 {
		http.Error(w, "Team not found", http.StatusNotFound)
		return
	}

	teamAbbrev := teamDetails.Teams[0].Abbreviation

	// Get season parameter from query string (optional)
	season := r.URL.Query().Get("season")
	var url string
	var cacheKey string
	if season != "" {
		// Fetch specific season (e.g., "20232024")
		url = fmt.Sprintf("%s/club-schedule-season/%s/%s", BaseURL, teamAbbrev, season)
		cacheKey = fmt.Sprintf("team-schedule:%s:%s", teamAbbrev, season)
	} else {
		// Fetch current season
		url = fmt.Sprintf("%s/club-schedule-season/%s/now", BaseURL, teamAbbrev)
		cacheKey = fmt.Sprintf("team-schedule:%s:now", teamAbbrev)
	}

	body, err := fetchURLContext(r.Context(), url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for team schedule %s, trying Redis", cacheKey)
			cachedData, cacheErr := getCachedRaw(cacheKey)
			if cacheErr == nil {
				log.Printf("Found cached team schedule for %s in Redis", cacheKey)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached team schedule response: %v", writeErr)
				}
				return
			}
			log.Printf("No cached team schedule for %s in Redis: %v", cacheKey, cacheErr)
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() {
		if err := body.Close(); err != nil {
			log.Printf("Error closing response body: %v", err)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	// Try to unmarshal and enrich the team schedule payload so the frontend always
	// has `logo`/`darkLogo` present for each team. If enrichment fails, fall
	// back to returning the raw upstream data.
	var payload map[string]interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write(data); err != nil {
			log.Printf("Error writing team schedule data: %v", err)
			return
		}
	} else {
		// Iterate games and enrich homeTeam/awayTeam
		if gamesRaw, ok := payload["games"].([]interface{}); ok {
			for _, g := range gamesRaw {
				gameMap, ok := g.(map[string]interface{})
				if !ok {
					continue
				}
				for _, side := range []string{"homeTeam", "awayTeam"} {
					if tRaw, present := gameMap[side]; present {
						if tMap, ok := tRaw.(map[string]interface{}); ok {
							// Extract abbrev (may be string or object)
							abbr := "TBD"
							if a, ok := tMap["abbrev"].(string); ok && a != "" {
								abbr = a
							} else if aObj, ok := tMap["abbrev"].(map[string]interface{}); ok {
								if d, ok := aObj["default"].(string); ok && d != "" {
									abbr = d
								}
							}

							// Extract numeric id when possible
							var idNum float64
							if idf, ok := tMap["id"].(float64); ok {
								idNum = idf
							} else if ids, ok := tMap["id"].(string); ok {
								if v, err := strconv.ParseFloat(ids, 64); err == nil {
									idNum = v
								}
							}

							// Determine prefix: use 'ntl' for non-NHL/high ids
							prefix := "nhl"
							if idNum > 1000 {
								prefix = "ntl"
							}

							// Only set logo fields if missing
							if _, ok := tMap["logo"]; !ok || tMap["logo"] == nil || tMap["logo"] == "" {
								tMap["logo"] = fmt.Sprintf("https://assets.nhle.com/logos/%s/svg/%s_light.svg", prefix, abbr)
							}
							if _, ok := tMap["darkLogo"]; !ok || tMap["darkLogo"] == nil || tMap["darkLogo"] == "" {
								tMap["darkLogo"] = fmt.Sprintf("https://assets.nhle.com/logos/%s/svg/%s_dark.svg", prefix, abbr)
							}
							// write back just in case
							gameMap[side] = tMap
						}
					}
				}
			}
		}

		enriched, err := json.Marshal(payload)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			if _, err := w.Write(data); err != nil {
				log.Printf("Error writing team schedule data: %v", err)
				return
			}
		} else {
			w.Header().Set("Content-Type", "application/json")
			if _, err := w.Write(enriched); err != nil {
				log.Printf("Error writing enriched team schedule data: %v", err)
				return
			}

			// Cache the enriched payload
			if setErr := setCachedRaw(cacheKey, enriched, time.Hour); setErr != nil {
				log.Printf("Failed to cache team schedule for %s: %v", cacheKey, setErr)
			}
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing team schedule data: %v", err)
		return
	}

	// Cache the successful response in Redis
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache team schedule for %s: %v", cacheKey, setErr)
	}
}

// Proxy video search for a given gameID from forge-dapi
func handleAPIVideos(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameID := vars["gameId"]
	if gameID == "" {
		http.Error(w, "missing gameId", http.StatusBadRequest)
		return
	}

	// Build forge-dapi URL (limit 100)
	url := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-US/videos?$limit=100&tags.slug=gameid-%s", gameID)
	cacheKey := fmt.Sprintf("videos:%s", gameID)

	body, err := fetchURLContext(r.Context(), url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for videos %s, trying Redis", gameID)
			cachedData, cacheErr := getCachedRaw(cacheKey)
			if cacheErr == nil {
				log.Printf("Found cached videos for %s in Redis", gameID)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached videos response: %v", writeErr)
				}
				return
			}
			log.Printf("No cached videos for %s in Redis: %v", gameID, cacheErr)
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() {
		if err := body.Close(); err != nil {
			log.Printf("Error closing response body: %v", err)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	// Return raw forge response to the client
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing videos response: %v", err)
		return
	}

	// Cache the successful response in Redis
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache videos for %s: %v", gameID, setErr)
	}
}
