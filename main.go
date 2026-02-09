package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

//go:embed static templates
var embeddedFiles embed.FS

func main() {
	router := mux.NewRouter()

	// Static files - serve from embedded FS
	staticFS, err := fs.Sub(embeddedFiles, "static")
	if err != nil {
		log.Fatal(err)
	}
	router.PathPrefix("/static/").Handler(
		http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))),
	)

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
	router.HandleFunc("/api/teams", handleAPITeams).Methods("GET")
	router.HandleFunc("/api/team/{teamId}", handleAPITeamDetails).Methods("GET")
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

	port := "8080"
	fmt.Printf("Server starting on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}

func serveEmbeddedFile(w http.ResponseWriter, r *http.Request, filename string) {
	content, err := embeddedFiles.ReadFile(filepath.Join("templates", filename))
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
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
	teamId := vars["teamId"]
	// If teamId is numeric, try to map to abbreviation and redirect to abbrev-based URL
	if teamId != "" {
		if id, err := strconv.Atoi(teamId); err == nil {
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
	teams, err := GetAllTeams()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := teams.WriteJSON(w); err != nil {
		log.Printf("Error writing teams JSON: %v", err)
	}
}

func handleAPITeamDetails(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamId := vars["teamId"]

	team, err := GetTeamDetails(teamId)
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
	teamId := vars["teamId"]

	roster, err := GetRoster(teamId)
	if err != nil {
		// Distinguish not found vs upstream failure
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "unknown team id") || strings.Contains(err.Error(), "status 404") || strings.Contains(err.Error(), "upstream status 404") {
			status = http.StatusNotFound
		}
		http.Error(w, err.Error(), status)
		return
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
	playerId := vars["playerId"]

	// Construct NHL API URL
	url := fmt.Sprintf("%s/player/%s/landing", BaseURL, playerId)
	cacheKey := fmt.Sprintf("player:%s", playerId)

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for player %s, trying Redis", playerId)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached player for %s in Redis", playerId)
				// Parse the JSON to enrich with team abbreviations
				var playerData map[string]interface{}
				if err := json.Unmarshal(cachedData, &playerData); err != nil {
					// If parsing fails, just return raw data
					w.Header().Set("Content-Type", "application/json")
					if _, werr := w.Write(cachedData); werr != nil {
						log.Printf("Error writing cached response: %v", werr)
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
							if teamIdFloat, ok := season["teamId"].(float64); ok {
								teamId := int(teamIdFloat)
								if abbrev, exists := teamIDToAbbr[teamId]; exists {
									season["teamAbbrev"] = abbrev
								}
							}
						}
					}
				}

				// Return enriched cached data
				enrichedData, err := json.Marshal(playerData)
				if err != nil {
					// If marshaling fails, return original cached data
					w.Header().Set("Content-Type", "application/json")
					if _, werr := w.Write(cachedData); werr != nil {
						log.Printf("Error writing cached response: %v", werr)
					}
					return
				}

				w.Header().Set("Content-Type", "application/json")
				if _, err := w.Write(enrichedData); err != nil {
					log.Printf("Error writing enriched cached data: %v", err)
				}
				return
			} else {
				log.Printf("No cached player for %s in Redis: %v", playerId, cacheErr)
			}
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
				if teamIdFloat, ok := season["teamId"].(float64); ok {
					teamId := int(teamIdFloat)
					if abbrev, exists := teamIDToAbbr[teamId]; exists {
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

	// Cache the successful response in Redis (use enriched data)
	if setErr := setCachedRaw(cacheKey, enrichedData, time.Hour); setErr != nil {
		log.Printf("Failed to cache player for %s: %v", playerId, setErr)
	}
}

func handleAPIPlayerBio(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerId := vars["playerId"]

	// Construct biography API URL
	url := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/players?tags.slug=playerid-%s", playerId)
	cacheKey := fmt.Sprintf("player-bio:%s", playerId)

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for player bio %s, trying Redis", playerId)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached player bio for %s in Redis", playerId)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached player bio response: %v", writeErr)
				}
				return
			} else {
				log.Printf("No cached player bio for %s in Redis: %v", playerId, cacheErr)
			}
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
		log.Printf("Failed to cache player bio for %s: %v", playerId, setErr)
	}
}

func handleAPISchedule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	date := vars["date"]

	// Construct NHL API URL for schedule
	url := fmt.Sprintf("%s/schedule/%s", BaseURL, date)
	cacheKey := fmt.Sprintf("schedule:%s", date)

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for schedule %s, trying Redis", date)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached schedule for %s in Redis", date)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached schedule response: %v", writeErr)
				}
				return
			} else {
				log.Printf("No cached schedule for %s in Redis: %v", date, cacheErr)
			}
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
		log.Printf("Error writing schedule data: %v", err)
		return
	}

	// Cache the successful response in Redis
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache schedule for %s: %v", date, setErr)
	}
}

func handleAPIGameLanding(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	// Construct NHL API URL for game landing
	// Use typed fetcher so we can enrich the payload reliably
	landing, err := GetGameLanding(gameId)
	if err != nil {
		// Typed fetch failed (likely due to non-standard payload for international games).
		// Continue and fetch the raw payload below so we can still enrich it for the
		// frontend (attach team branding, empty discreteClips/clockText when unavailable).
		log.Printf("Typed GetGameLanding failed for %s: %v — will enrich raw payload instead", gameId, err)
		landing = nil
	}

	// Read raw landing again to preserve original payload structure while enriching
	url := fmt.Sprintf("%s/gamecenter/%s/landing", BaseURL, gameId)
	body, err := fetchURL(url)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() {
		if err := body.Close(); err != nil {
			log.Printf("Error closing response body: %v", err)
		}
	}()
	rawData, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
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
	teamId := vars["teamId"]

	// Get team abbreviation from ID
	teamDetails, err := GetTeamDetails(teamId)
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

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for team schedule %s, trying Redis", cacheKey)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached team schedule for %s in Redis", cacheKey)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached team schedule response: %v", writeErr)
				}
				return
			} else {
				log.Printf("No cached team schedule for %s in Redis: %v", cacheKey, cacheErr)
			}
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
		log.Printf("Error writing team schedule data: %v", err)
		return
	}

	// Cache the successful response in Redis
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache team schedule for %s: %v", cacheKey, setErr)
	}
}

// Proxy video search for a given gameId from forge-dapi
func handleAPIVideos(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]
	if gameId == "" {
		http.Error(w, "missing gameId", http.StatusBadRequest)
		return
	}

	// Build forge-dapi URL (limit 100)
	url := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-US/videos?$limit=100&tags.slug=gameid-%s", gameId)
	cacheKey := fmt.Sprintf("videos:%s", gameId)

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for videos %s, trying Redis", gameId)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached videos for %s in Redis", gameId)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					log.Printf("Error writing cached videos response: %v", writeErr)
				}
				return
			} else {
				log.Printf("No cached videos for %s in Redis: %v", gameId, cacheErr)
			}
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
		log.Printf("Failed to cache videos for %s: %v", gameId, setErr)
	}
}
