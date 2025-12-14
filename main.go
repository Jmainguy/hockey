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

	// Construct NHL API URL
	url := fmt.Sprintf("%s/prospects/%s", BaseURL, teamAbbrev)

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

	w.Header().Set("Content-Type", "application/json")
	if _, err := io.Copy(w, body); err != nil {
		log.Printf("Error copying prospects response: %v", err)
	}
}

func handleAPIPlayer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerId := vars["playerId"]

	// Construct NHL API URL
	url := fmt.Sprintf("%s/player/%s/landing", BaseURL, playerId)

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
}

func handleAPIPlayerBio(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	playerId := vars["playerId"]

	// Construct biography API URL
	url := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/players?tags.slug=playerid-%s", playerId)

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

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing bio data: %v", err)
	}
}

func handleAPISchedule(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	date := vars["date"]

	// Construct NHL API URL for schedule
	url := fmt.Sprintf("%s/schedule/%s", BaseURL, date)

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

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing schedule data: %v", err)
	}
}

func handleAPIGameLanding(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gameId := vars["gameId"]

	// Construct NHL API URL for game landing
	// Use typed fetcher so we can enrich the payload reliably
	landing, err := GetGameLanding(gameId)
	if err != nil {
		// Fallback to proxying raw data if typed fetch fails
		url := fmt.Sprintf("%s/gamecenter/%s/landing", BaseURL, gameId)
		body, berr := fetchURL(url)
		if berr != nil {
			http.Error(w, berr.Error(), http.StatusBadGateway)
			return
		}
		defer func() {
			if err := body.Close(); err != nil {
				log.Printf("Error closing response body: %v", err)
			}
		}()
		data, rerr := io.ReadAll(body)
		if rerr != nil {
			http.Error(w, rerr.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if _, werr := w.Write(data); werr != nil {
			log.Printf("Error writing landing data: %v", werr)
		}
		return
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
	if season != "" {
		// Fetch specific season (e.g., "20232024")
		url = fmt.Sprintf("%s/club-schedule-season/%s/%s", BaseURL, teamAbbrev, season)
	} else {
		// Fetch current season
		url = fmt.Sprintf("%s/club-schedule-season/%s/now", BaseURL, teamAbbrev)
	}

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

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing team schedule data: %v", err)
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

	data, err := io.ReadAll(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	// Return raw forge response to the client
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(data); err != nil {
		log.Printf("Error writing videos response: %v", err)
	}
}
