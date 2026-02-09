package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	redisClient *redis.Client
	redisCtx    = context.Background()
)

func init() {
	if redisAddr := os.Getenv("REDIS_ADDR"); redisAddr != "" {
		redisClient = redis.NewClient(&redis.Options{
			Addr: redisAddr,
		})
		log.Printf("Redis client initialized with address: %s", redisAddr)

		// Start the cache warmer in the background
		startCacheWarmer()
	} else {
		log.Println("REDIS_ADDR not set, Redis caching disabled")
	}
}

func getCachedRaw(key string) ([]byte, error) {
	if redisClient == nil {
		return nil, fmt.Errorf("redis not available")
	}
	val, err := redisClient.Get(redisCtx, key).Result()
	if err != nil {
		return nil, err
	}
	return []byte(val), nil
}

func setCachedRaw(key string, data []byte, ttl time.Duration) error {
	if redisClient == nil {
		return fmt.Errorf("redis not available")
	}
	return redisClient.Set(redisCtx, key, string(data), ttl).Err()
}

// startCacheWarmer starts a background goroutine that keeps the cache populated
func startCacheWarmer() {
	if redisClient == nil {
		log.Println("Redis not available, skipping cache warmer")
		return
	}

	go func() {
		log.Println("Starting cache warmer")
		for {
			warmCache()
			// Wait 10 minutes before next full cache check
			time.Sleep(10 * time.Minute)
		}
	}()
}

// warmCache checks and populates missing cache entries
func warmCache() {
	// Try to acquire a lock to prevent multiple instances from working simultaneously
	lockKey := "cache-warmer-lock"
	lockValue := fmt.Sprintf("%d", time.Now().Unix())

	// Try to set lock with 15 minute expiration (increased from 5 to handle long operations)
	set, err := redisClient.SetNX(redisCtx, lockKey, lockValue, 15*time.Minute).Result()
	if err != nil || !set {
		log.Println("Another instance is already warming cache, skipping")
		return
	}
	defer redisClient.Del(redisCtx, lockKey) // Release lock when done

	log.Println("Cache warmer acquired lock, starting cache population")

	// Start a goroutine to renew the lock every 2 minutes
	lockRenewalDone := make(chan bool)
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				// Renew lock by extending TTL
				if err := redisClient.Expire(redisCtx, lockKey, 15*time.Minute).Err(); err != nil {
					log.Printf("Failed to renew cache warmer lock: %v", err)
					return
				}
				log.Println("Cache warmer lock renewed")
			case <-lockRenewalDone:
				return
			}
		}
	}()
	defer close(lockRenewalDone) // Stop the renewal goroutine when done

	// First, ensure standings are cached
	standingsDate := getStandingsDate()
	standingsKey := fmt.Sprintf("standings:%s", standingsDate)

	if _, err := getCachedRaw(standingsKey); err != nil {
		log.Printf("Standings not cached, fetching...")
		fetchAndCacheWithBackoff(standingsKey, func() ([]byte, error) {
			teams, err := GetAllTeams()
			if err != nil {
				return nil, err
			}
			return json.Marshal(teams)
		})
	}

	// Get all teams to know what to cache
	teams, err := GetAllTeams()
	if err != nil {
		log.Printf("Failed to get teams for cache warming: %v", err)
		return
	}

	seasonID := currentSeasonID()

	// For each team, check and cache missing data
	for _, team := range teams.Teams {
		teamAbbrev := strings.ToUpper(team.Abbrev)

		// Check team details
		detailsKey := fmt.Sprintf("teamdetails:%s", teamAbbrev)
		if _, err := getCachedRaw(detailsKey); err != nil {
			log.Printf("Team details not cached for %s, fetching...", teamAbbrev)
			fetchAndCacheWithBackoff(detailsKey, func() ([]byte, error) {
				details, err := GetTeamDetails(teamAbbrev)
				if err != nil {
					return nil, err
				}
				return json.Marshal(details)
			})
		}

		// Check roster
		rosterKey := fmt.Sprintf("roster:%s-%s", teamAbbrev, seasonID)
		if _, err := getCachedRaw(rosterKey); err != nil {
			log.Printf("Roster not cached for %s, fetching...", teamAbbrev)
			fetchAndCacheWithBackoff(rosterKey, func() ([]byte, error) {
				roster, err := GetRoster(teamAbbrev)
				if err != nil {
					return nil, err
				}
				return json.Marshal(roster)
			})
		}

		// Check prospects
		prospectsKey := fmt.Sprintf("prospects:%s", teamAbbrev)
		if _, err := getCachedRaw(prospectsKey); err != nil {
			log.Printf("Prospects not cached for %s, fetching...", teamAbbrev)
			if _, err := GetProspects(teamAbbrev); err != nil {
				log.Printf("Failed to cache prospects for %s: %v", teamAbbrev, err)
			}
		}

		// Check team news
		newsKey := fmt.Sprintf("team-news:%d", team.ID)
		if _, err := getCachedRaw(newsKey); err != nil {
			log.Printf("Team news not cached for %s, fetching...", teamAbbrev)
			fetchAndCacheWithBackoff(newsKey, func() ([]byte, error) {
				// Simulate the news fetching logic
				apiUrl := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%d&$limit=10", team.ID)
				resp, err := http.Get(apiUrl)
				if err != nil {
					return nil, err
				}
				defer func() {
					if cerr := resp.Body.Close(); cerr != nil {
						log.Printf("Error closing response body: %v", cerr)
					}
				}()

				if resp.StatusCode != http.StatusOK {
					return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
				}

				return io.ReadAll(resp.Body)
			})
		}

		// Check team transactions
		transactionsKey := fmt.Sprintf("team-transactions:%d", team.ID)
		if _, err := getCachedRaw(transactionsKey); err != nil {
			log.Printf("Team transactions not cached for %s, fetching...", teamAbbrev)
			fetchAndCacheWithBackoff(transactionsKey, func() ([]byte, error) {
				// Simulate the transactions fetching logic (simplified)
				apiUrl := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%d&tags.slug=transactions&$limit=30&$skip=0", team.ID)
				resp, err := http.Get(apiUrl)
				if err != nil {
					return nil, err
				}
				defer func() {
					if cerr := resp.Body.Close(); cerr != nil {
						log.Printf("Error closing response body: %v", cerr)
					}
				}()

				if resp.StatusCode != http.StatusOK {
					return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
				}

				return io.ReadAll(resp.Body)
			})
		}

		// Wait 5 seconds between teams to be respectful to the API
		time.Sleep(5 * time.Second)
	}

	log.Println("Cache warming cycle completed")
}

// fetchAndCacheWithBackoff fetches data with exponential backoff on 429 errors
func fetchAndCacheWithBackoff(cacheKey string, fetchFunc func() ([]byte, error)) {
	backoffDelays := []time.Duration{30 * time.Second, 1 * time.Minute, 2 * time.Minute, 5 * time.Minute}

	for attempt, delay := range append([]time.Duration{0}, backoffDelays...) {
		if delay > 0 {
			log.Printf("Backing off for %v before retrying %s", delay, cacheKey)
			time.Sleep(delay)
		}

		data, err := fetchFunc()
		if err != nil {
			if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
				if attempt < len(backoffDelays) {
					log.Printf("429 error for %s, attempt %d, will retry", cacheKey, attempt+1)
					continue
				} else {
					log.Printf("429 error for %s, max retries exceeded, giving up", cacheKey)
					return
				}
			} else {
				log.Printf("Non-429 error for %s: %v", cacheKey, err)
				return
			}
		}

		// Success! Cache the data
		if err := setCachedRaw(cacheKey, data, time.Hour); err != nil {
			log.Printf("Failed to cache %s: %v", cacheKey, err)
		} else {
			log.Printf("Successfully cached %s", cacheKey)
		}
		return
	}
}

const (
	BaseURL = "https://api-web.nhle.com/v1"
)

// GameLanding represents a typed view of the /gamecenter/{id}/landing JSON we fetch
type GameLanding struct {
	ID                int64  `json:"id"`
	GameDate          string `json:"gameDate"`
	GameState         string `json:"gameState"`
	GameScheduleState string `json:"gameScheduleState"`
	ShootoutInUse     bool   `json:"shootoutInUse"`
	Clock             struct {
		InIntermission   bool   `json:"inIntermission"`
		Running          bool   `json:"running"`
		SecondsRemaining int64  `json:"secondsRemaining"`
		TimeRemaining    string `json:"timeRemaining"`
	} `json:"clock"`
	PeriodDescriptor struct {
		Number     int    `json:"number"`
		PeriodType string `json:"periodType"`
	} `json:"periodDescriptor"`
	HomeTeam struct {
		ID     int64 `json:"id"`
		Abbrev struct {
			Default string `json:"default"`
		} `json:"abbrev"`
		Score int64 `json:"score"`
		Sog   int64 `json:"sog"`
	} `json:"homeTeam"`
	AwayTeam struct {
		ID     int64 `json:"id"`
		Abbrev struct {
			Default string `json:"default"`
		} `json:"abbrev"`
		Score int64 `json:"score"`
		Sog   int64 `json:"sog"`
	} `json:"awayTeam"`
	Summary struct {
		Scoring []struct {
			PeriodDescriptor struct {
				Number     int    `json:"number"`
				PeriodType string `json:"periodType"`
			} `json:"periodDescriptor"`
			Goals []struct {
				DiscreteClip            int64  `json:"discreteClip"`
				DiscreteClipFr          int64  `json:"discreteClipFr"`
				HighlightClipSharingURL string `json:"highlightClipSharingUrl"`
			} `json:"goals"`
		} `json:"scoring"`
		Shootout []struct {
			DiscreteClip   int64 `json:"discreteClip"`
			DiscreteClipFr int64 `json:"discreteClipFr"`
		} `json:"shootout"`
	} `json:"summary"`
}

// GetGameLanding fetches and decodes the game landing JSON into a typed struct
func GetGameLanding(gameId string) (*GameLanding, error) {
	url := fmt.Sprintf("%s/gamecenter/%s/landing", BaseURL, gameId)
	body, err := fetchURL(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch game landing: %w", err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading landing response: %w", err)
	}

	var landing GameLanding
	if err := json.Unmarshal(data, &landing); err != nil {
		return nil, fmt.Errorf("parsing landing response: %w", err)
	}

	return &landing, nil
}

// ExtractDiscreteClips returns all discreteClip IDs found in goals and shootout sections
func ExtractDiscreteClips(landing *GameLanding) []int64 {
	var clips []int64
	if landing == nil {
		return clips
	}
	// First prefer any goal that appears inside a scoring period with periodType == "SO" (final shootout goal)
	for _, sc := range landing.Summary.Scoring {
		if strings.EqualFold(sc.PeriodDescriptor.PeriodType, "SO") {
			for _, g := range sc.Goals {
				if g.DiscreteClip != 0 {
					clips = append(clips, g.DiscreteClip)
				}
				if g.DiscreteClipFr != 0 {
					clips = append(clips, g.DiscreteClipFr)
				}
			}
			if len(clips) > 0 {
				return clips
			}
		}
	}

	// Otherwise collect all goal discreteClips
	for _, sc := range landing.Summary.Scoring {
		for _, g := range sc.Goals {
			if g.DiscreteClip != 0 {
				clips = append(clips, g.DiscreteClip)
			}
			if g.DiscreteClipFr != 0 {
				clips = append(clips, g.DiscreteClipFr)
			}
		}
	}

	// And include any shootout entries as a fallback
	for _, s := range landing.Summary.Shootout {
		if s.DiscreteClip != 0 {
			clips = append(clips, s.DiscreteClip)
		}
		if s.DiscreteClipFr != 0 {
			clips = append(clips, s.DiscreteClipFr)
		}
	}
	return clips
}

// ClockText returns a human-friendly clock string for display when game is live or in intermission
func ClockText(landing *GameLanding) string {
	if landing == nil {
		return ""
	}
	// If running, show remaining time and period
	if landing.Clock.Running {
		period := landing.PeriodDescriptor.Number
		tr := landing.Clock.TimeRemaining
		if tr == "" {
			tr = landing.Clock.TimeRemaining
		}
		return fmt.Sprintf("%s — Period %d", tr, period)
	}
	if landing.Clock.InIntermission {
		return "Intermission"
	}
	// Not running and not intermission — show period descriptor state
	if landing.GameState != "FINAL" && landing.GameState != "FINAL_OVERTIME" && landing.GameState != "FINAL_SHOOTOUT" {
		// Game not finished but clock not running — show period number
		if landing.PeriodDescriptor.Number > 0 {
			return fmt.Sprintf("Period %d", landing.PeriodDescriptor.Number)
		}
	}
	return ""
}

var (
	httpClient = &http.Client{
		Timeout: 10 * time.Second,
	}
	// Map team IDs to official NHL API 3-letter abbreviations
	teamIDToAbbr = map[int]string{
		1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT",
		6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
		12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH",
		16: "CHI", 17: "DET", 18: "NSH", 19: "STL",
		20: "CGY", 21: "COL", 22: "EDM", 23: "VAN",
		24: "ANA", 25: "DAL", 26: "LAK", 28: "SJS",
		29: "CBJ", 30: "MIN", 31: "VGK", 32: "SEA", 33: "UTA",
		52: "WPG",
	}

	// Map team names to abbreviations for enriching player season data
	teamNameToAbbr = map[string]string{
		"Anaheim Ducks": "ANA", "Arizona Coyotes": "ARI", "Boston Bruins": "BOS",
		"Buffalo Sabres": "BUF", "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR",
		"Chicago Blackhawks": "CHI", "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ",
		"Dallas Stars": "DAL", "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM",
		"Florida Panthers": "FLA", "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN",
		"Montréal Canadiens": "MTL", "Montreal Canadiens": "MTL", "Nashville Predators": "NSH",
		"New Jersey Devils": "NJD", "New York Islanders": "NYI", "New York Rangers": "NYR",
		"Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI", "Pittsburgh Penguins": "PIT",
		"San Jose Sharks": "SJS", "Seattle Kraken": "SEA", "St. Louis Blues": "STL",
		"Tampa Bay Lightning": "TBL", "Toronto Maple Leafs": "TOR", "Utah Hockey Club": "UTA",
		"Utah Mammoth": "UTA", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
		"Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
	}
)

// Map team abbreviations to their IDs (reverse of teamIDToAbbr)
var abbrevToTeamID map[string]int

// Initialize maps and cache
func init() {
	abbrevToTeamID = make(map[string]int)
	for id, abbrev := range teamIDToAbbr {
		abbrevToTeamID[abbrev] = id
	}
}

// currentSeasonID returns the active NHL season ID like 20252026.
// Season rolls over on September 1: months Sep-Dec belong to currentYear-nextYear.
func currentSeasonID() string {
	now := time.Now().UTC()
	year := now.Year()
	var startYear, endYear int
	if now.Month() >= time.September { // new season starts in September
		startYear = year
		endYear = year + 1
	} else {
		startYear = year - 1
		endYear = year
	}
	return fmt.Sprintf("%d%d", startYear, endYear)
}

// getStandingsDate returns today's date in YYYY-MM-DD format
func getStandingsDate() string {
	return time.Now().Format("2006-01-02")
}

// GetAllTeams fetches all NHL teams from standings
func GetAllTeams() (*TeamsResponse, error) {
	standingsDate := getStandingsDate()
	cacheKey := fmt.Sprintf("standings:%s", standingsDate)

	// Use date-based standings endpoint (e.g., /standings/2025-11-23)
	url := fmt.Sprintf("%s/standings/%s", BaseURL, standingsDate)

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for standings %s, trying Redis", standingsDate)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached standings for %s in Redis", standingsDate)
				var response TeamsResponse
				var jsonErr error
				if jsonErr = json.Unmarshal(cachedData, &response); jsonErr == nil {
					return &response, nil
				}
				log.Printf("Failed to unmarshal cached standings: %v", jsonErr)
			} else {
				log.Printf("No cached standings for %s in Redis: %v", standingsDate, cacheErr)
			}
		}
		return nil, fmt.Errorf("failed to fetch standings for team lookup: %w", err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading standings response: %w", err)
	}

	// Parse standings response - note different structure from old API
	var standingsResp struct {
		Standings []struct {
			TeamAbbrev struct {
				Default string `json:"default"`
			} `json:"teamAbbrev"`
			TeamName struct {
				Default string `json:"default"`
			} `json:"teamName"`
			ConferenceName   string  `json:"conferenceName"`
			DivisionName     string  `json:"divisionName"`
			Wins             int     `json:"wins"`
			Losses           int     `json:"losses"`
			OtLosses         int     `json:"otLosses"`
			Points           int     `json:"points"`
			GamesPlayed      int     `json:"gamesPlayed"`
			GoalFor          int     `json:"goalFor"`
			GoalAgainst      int     `json:"goalAgainst"`
			GoalDifferential int     `json:"goalDifferential"`
			L10Wins          int     `json:"l10Wins"`
			L10Losses        int     `json:"l10Losses"`
			L10OtLosses      int     `json:"l10OtLosses"`
			StreakCode       string  `json:"streakCode"`
			StreakCount      int     `json:"streakCount"`
			WinPctg          float64 `json:"winPctg"`
			RecordSummary    struct {
				LastTen string `json:"lastTen"`
				Streak  string `json:"streak"`
			} `json:"recordSummary"`
		} `json:"standings"`
	}

	if err := json.Unmarshal(data, &standingsResp); err != nil {
		return nil, fmt.Errorf("parsing standings response: %w", err)
	}

	var teams []Team
	for _, standing := range standingsResp.Standings {
		abbrev := standing.TeamAbbrev.Default
		teamID := 0
		if id, ok := abbrevToTeamID[abbrev]; ok {
			teamID = id
		}
		gd := standing.GoalDifferential
		if gd == 0 {
			gd = standing.GoalFor - standing.GoalAgainst
		}
		lastTen := ""
		if standing.L10Wins != 0 || standing.L10Losses != 0 || standing.L10OtLosses != 0 {
			lastTen = fmt.Sprintf("%d-%d-%d", standing.L10Wins, standing.L10Losses, standing.L10OtLosses)
		} else if standing.RecordSummary.LastTen != "" {
			lastTen = standing.RecordSummary.LastTen
		}
		streak := ""
		if standing.StreakCode != "" && standing.StreakCount != 0 {
			streak = fmt.Sprintf("%s%d", strings.ToUpper(standing.StreakCode), standing.StreakCount)
		} else if standing.RecordSummary.Streak != "" {
			streak = standing.RecordSummary.Streak
		}
		teams = append(teams, Team{
			ID:         teamID,
			Name:       standing.TeamName.Default,
			Abbrev:     abbrev,
			Link:       fmt.Sprintf("/api/v1/teams/%d", teamID),
			Conference: standing.ConferenceName,
			Division:   standing.DivisionName,
			Record: struct {
				Wins           int `json:"wins"`
				Losses         int `json:"losses"`
				OvertimeLosses int `json:"overtimeLosses"`
				Points         int `json:"points"`
			}{
				Wins:           standing.Wins,
				Losses:         standing.Losses,
				OvertimeLosses: standing.OtLosses,
				Points:         standing.Points,
			},
			GamesPlayed:  standing.GamesPlayed,
			GoalsFor:     standing.GoalFor,
			GoalsAgainst: standing.GoalAgainst,
			GoalDiff:     gd,
			LastTen:      lastTen,
			Streak:       streak,
			WinPct:       standing.WinPctg,
		})
	}

	response := &TeamsResponse{Teams: teams}

	// Cache the successful response in Redis
	if cacheData, jsonErr := json.Marshal(response); jsonErr == nil {
		if setErr := setCachedRaw(cacheKey, cacheData, time.Hour); setErr != nil {
			log.Printf("Failed to cache standings for %s: %v", standingsDate, setErr)
		}
	}

	return response, nil
}

// GetTeamDetails fetches team details including record and stats
func GetTeamDetails(teamId string) (*TeamDetailsResponse, error) {
	// Try upstream first
	cacheKey := fmt.Sprintf("teamdetails:%s", strings.ToUpper(teamId))

	// Convert team ID to abbreviation
	var teamAbbr string
	teamIDInt := -1
	// If teamId is numeric, use that id
	if _, err := fmt.Sscanf(teamId, "%d", &teamIDInt); err != nil {
		// Not numeric: treat as abbreviation (e.g., "wpg")
		teamAbbr = strings.ToUpper(teamId)
		if id, ok := abbrevToTeamID[teamAbbr]; ok {
			teamIDInt = id
		} else {
			// Leave teamIDInt as -1 to indicate we don't have a numeric id;
			// we'll rely on the provided abbreviation when searching standings below.
			teamIDInt = -1
		}
	}

	// If we resolved a numeric ID, derive the canonical abbreviation from it
	if teamIDInt != -1 {
		if abbr, ok := teamIDToAbbr[teamIDInt]; ok {
			teamAbbr = abbr
		} else {
			return nil, fmt.Errorf("unknown team id: %s", teamId)
		}
	}

	// Fetch standings data using date-based endpoint
	url := fmt.Sprintf("%s/standings/%s", BaseURL, getStandingsDate())

	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for team details %s, trying Redis", teamId)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached team details for %s in Redis", teamId)
				var response TeamDetailsResponse
				var jsonErr error
				if jsonErr = json.Unmarshal(cachedData, &response); jsonErr == nil {
					return &response, nil
				}
				log.Printf("Failed to unmarshal cached team details: %v", jsonErr)
			} else {
				log.Printf("No cached team details for %s in Redis: %v", teamId, cacheErr)
			}
		}
		return nil, fmt.Errorf("failed to fetch standings: %w", err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading standings response: %w", err)
	}

	var standingsResp struct {
		Standings []struct {
			TeamAbbrev struct {
				Default string `json:"default"`
			} `json:"teamAbbrev"`
			TeamName struct {
				Default string `json:"default"`
			} `json:"teamName"`
			TeamCommonName struct {
				Default string `json:"default"`
			} `json:"teamCommonName"`
			DivisionName     string  `json:"divisionName"`
			ConferenceName   string  `json:"conferenceName"`
			Wins             int     `json:"wins"`
			Losses           int     `json:"losses"`
			OtLosses         int     `json:"otLosses"`
			GamesPlayed      int     `json:"gamesPlayed"`
			Points           int     `json:"points"`
			GoalFor          int     `json:"goalFor"`
			GoalAgainst      int     `json:"goalAgainst"`
			GoalDifferential int     `json:"goalDifferential"`
			L10Wins          int     `json:"l10Wins"`
			L10Losses        int     `json:"l10Losses"`
			L10OtLosses      int     `json:"l10OtLosses"`
			StreakCode       string  `json:"streakCode"`
			StreakCount      int     `json:"streakCount"`
			WinPctg          float64 `json:"winPctg"`
			RecordSummary    struct {
				LastTen string `json:"lastTen"`
				Streak  string `json:"streak"`
			} `json:"recordSummary"`
		} `json:"standings"`
	}

	if err := json.Unmarshal(data, &standingsResp); err != nil {
		return nil, fmt.Errorf("parsing standings response: %w", err)
	}

	// Find the team in standings and build complete details
	team := TeamDetails{
		ID:           teamIDInt,
		Abbreviation: teamAbbr,
	}

	for _, standing := range standingsResp.Standings {
		if standing.TeamAbbrev.Default == teamAbbr || strings.EqualFold(standing.TeamAbbrev.Default, strings.ToUpper(teamId)) {
			// Build complete team details from standings
			// Populate numeric ID from standings where possible
			if id, ok := abbrevToTeamID[standing.TeamAbbrev.Default]; ok {
				team.ID = id
			}
			team.Name = standing.TeamName.Default
			team.TeamName = standing.TeamCommonName.Default
			team.LocationName = standing.TeamName.Default
			team.Division.Name = standing.DivisionName
			team.Conference.Name = standing.ConferenceName
			// Compute diff and extras
			gd := standing.GoalDifferential
			if gd == 0 {
				gd = standing.GoalFor - standing.GoalAgainst
			}
			lastTen := ""
			if standing.L10Wins != 0 || standing.L10Losses != 0 || standing.L10OtLosses != 0 {
				lastTen = fmt.Sprintf("%d-%d-%d", standing.L10Wins, standing.L10Losses, standing.L10OtLosses)
			}
			streak := ""
			if standing.StreakCode != "" && standing.StreakCount != 0 {
				streak = fmt.Sprintf("%s%d", strings.ToUpper(standing.StreakCode), standing.StreakCount)
			}

			team.Record = []struct {
				Type           string `json:"type"`
				Wins           int    `json:"wins"`
				Losses         int    `json:"losses"`
				OvertimeLosses int    `json:"overtimeLosses"`
				GamesPlayed    int    `json:"gamesPlayed"`
				Points         int    `json:"points"`
			}{
				{
					Type:           "season",
					Wins:           standing.Wins,
					Losses:         standing.Losses,
					OvertimeLosses: standing.OtLosses,
					GamesPlayed:    standing.GamesPlayed,
					Points:         standing.Points,
				},
			}
			// Attach the extra fields to TeamDetails struct if present via heuristics
			team.Stats = []interface{}{map[string]interface{}{
				"gamesPlayed":  standing.GamesPlayed,
				"goalsFor":     standing.GoalFor,
				"goalsAgainst": standing.GoalAgainst,
				"goalDiff":     gd,
				"lastTen":      lastTen,
				"streak":       streak,
				"winPct":       standing.WinPctg,
			}}
			break
		}
	}

	// For international teams not in standings, set basic info
	if team.Name == "" {
		// Check if it's an international team
		if _, ok := abbrevToTeamID[teamAbbr]; !ok {
			// International team
			switch strings.ToUpper(teamAbbr) {
			case "USA":
				team.Name = "United States"
				team.TeamName = "United States"
				team.LocationName = "United States"
			case "CAN":
				team.Name = "Canada"
				team.TeamName = "Canada"
				team.LocationName = "Canada"
			case "FIN":
				team.Name = "Finland"
				team.TeamName = "Finland"
				team.LocationName = "Finland"
			case "SWE":
				team.Name = "Sweden"
				team.TeamName = "Sweden"
				team.LocationName = "Sweden"
			case "CZE":
				team.Name = "Czechia"
				team.TeamName = "Czechia"
				team.LocationName = "Czechia"
			case "GER":
				team.Name = "Germany"
				team.TeamName = "Germany"
				team.LocationName = "Germany"
			case "SVK":
				team.Name = "Slovakia"
				team.TeamName = "Slovakia"
				team.LocationName = "Slovakia"
			case "SUI":
				team.Name = "Switzerland"
				team.TeamName = "Switzerland"
				team.LocationName = "Switzerland"
			case "FRA":
				team.Name = "France"
				team.TeamName = "France"
				team.LocationName = "France"
			case "ITA":
				team.Name = "Italy"
				team.TeamName = "Italy"
				team.LocationName = "Italy"
			case "LAT":
				team.Name = "Latvia"
				team.TeamName = "Latvia"
				team.LocationName = "Latvia"
			case "DEN":
				team.Name = "Denmark"
				team.TeamName = "Denmark"
				team.LocationName = "Denmark"
			default:
				team.Name = teamAbbr
				team.TeamName = teamAbbr
				team.LocationName = teamAbbr
			}
		}
	}

	// Set logos: prefer ntl for international teams
	prefix := "nhl"
	if team.ID > 1000 || (team.Name != "" && team.ID == -1) {
		prefix = "ntl"
	}
	team.Logo = fmt.Sprintf("https://assets.nhle.com/logos/%s/svg/%s_light.svg", prefix, team.Abbreviation)
	team.DarkLogo = fmt.Sprintf("https://assets.nhle.com/logos/%s/svg/%s_dark.svg", prefix, team.Abbreviation)

	// Determine a wordmark URL (prefer overrides for known exceptions)
	overrides := map[string]string{
		"WSH": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/capitals/logos/wsh-wordmark-sept25_ee1aiv",
		"VGK": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/goldenknights/logos/vgk-wordmark-new",
		"BOS": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/bruins/logos/BOS-Wordmark-128x44-Dark_iezh8v",
		"DET": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/redwings/logos/det_wordmark_100_1_wtlln0",
		"TOR": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/mapleleafs/logos/tor-wordmark",
		"UTA": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/utah/logos/uta-158x40",
		"CBJ": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/bluejackets/logos/cbj-wordmark-nationwide4",
		"CGY": "https://media.d3.nhle.com/image/private/t_q-best/prd/assets/flames/logos/cgy_wordmark_resized_jx4bam",
	}

	wordmark := ""
	if override, ok := overrides[team.Abbreviation]; ok {
		if resp, err := httpClient.Head(override); err == nil && resp.StatusCode == 200 {
			wordmark = override
		}
	}
	if wordmark == "" {
		parts := strings.Split(strings.ToLower(team.Name), " ")
		org := parts[len(parts)-1]
		heuristic := fmt.Sprintf("https://media.d3.nhle.com/image/private/t_q-best/prd/assets/%s/logos/%s-wordmark", org, strings.ToLower(team.Abbreviation))
		if resp, err := httpClient.Head(heuristic); err == nil && resp.StatusCode == 200 {
			wordmark = heuristic
		}
	}
	team.WordmarkURL = wordmark

	response := &TeamDetailsResponse{Teams: []TeamDetails{team}}

	// Cache the successful response in Redis
	if cacheData, jsonErr := json.Marshal(response); jsonErr == nil {
		if setErr := setCachedRaw(cacheKey, cacheData, time.Hour); setErr != nil {
			log.Printf("Failed to cache team details for %s: %v", teamId, setErr)
		}
	}

	return response, nil
}

// GetProspects fetches team prospects and caches individual player data
func GetProspects(teamAbbrev string) ([]byte, error) {
	cacheKey := fmt.Sprintf("prospects:%s", strings.ToUpper(teamAbbrev))

	// Try to get from cache first
	if cachedData, err := getCachedRaw(cacheKey); err == nil {
		log.Printf("Found cached prospects for %s", teamAbbrev)
		return cachedData, nil
	}

	// Fetch from API
	url := fmt.Sprintf("%s/prospects/%s", BaseURL, teamAbbrev)
	body, err := fetchURL(url)
	if err != nil {
		// Check if it's a 429, and if so, try Redis
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for prospects %s, trying Redis", teamAbbrev)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached prospects for %s in Redis", teamAbbrev)
				return cachedData, nil
			}
		}
		return nil, fmt.Errorf("failed to fetch prospects: %w", err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading prospects response: %w", err)
	}

	// Parse prospects response to cache individual players using RosterPlayer
	var prospectsResp struct {
		Forwards   []RosterPlayer `json:"forwards"`
		Defensemen []RosterPlayer `json:"defensemen"`
		Goalies    []RosterPlayer `json:"goalies"`
	}

	if err := json.Unmarshal(data, &prospectsResp); err == nil {
		// Cache individual prospect player data
		allProspectIDs := []int{}
		for _, p := range prospectsResp.Forwards {
			if p.ID > 0 {
				allProspectIDs = append(allProspectIDs, p.ID)
			}
		}
		for _, p := range prospectsResp.Defensemen {
			if p.ID > 0 {
				allProspectIDs = append(allProspectIDs, p.ID)
			}
		}
		for _, p := range prospectsResp.Goalies {
			if p.ID > 0 {
				allProspectIDs = append(allProspectIDs, p.ID)
			}
		}

		// Cache individual players (but don't fail if this errors)
		for _, playerID := range allProspectIDs {
			// Check if already cached
			cacheKey := fmt.Sprintf("player:%d", playerID)
			if _, err := getCachedRaw(cacheKey); err != nil {
				// Not cached, try to fetch
				playerData := PlayerInfo{ID: playerID}
				if err := fetchPlayerData(playerID, &playerData); err != nil {
					log.Printf("Failed to fetch prospect player %d: %v", playerID, err)
				} else {
					log.Printf("Cached prospect player %d", playerID)
				}
			}
		}
	} else {
		log.Printf("Failed to parse prospects response for caching: %v", err)
	}

	// Cache the prospects response
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache prospects for %s: %v", teamAbbrev, setErr)
	}

	return data, nil
}

// parsePlayerFromRawJSON extracts PlayerInfo fields from the full player landing JSON
func parsePlayerFromRawJSON(rawJSON []byte, basePlayer PlayerInfo) (PlayerInfo, error) {
	var playerResp struct {
		PlayerID      int    `json:"playerId"`
		Headshot      string `json:"headshot"`
		HeroImage     string `json:"heroImage"`
		ShootsCatches string `json:"shootsCatches"`
		BirthCity     struct {
			Default string `json:"default"`
		} `json:"birthCity"`
		BirthStateProvince struct {
			Default string `json:"default"`
		} `json:"birthStateProvince"`
		BirthCountry  string `json:"birthCountry"`
		FeaturedStats struct {
			RegularSeason struct {
				SubSeason struct {
					Games           int     `json:"gamesPlayed"`
					Goals           int     `json:"goals"`
					Assists         int     `json:"assists"`
					Points          int     `json:"points"`
					PlusMinus       int     `json:"plusMinus"`
					PIM             int     `json:"pim"`
					Shots           int     `json:"shots"`
					SavePctg        float64 `json:"savePctg"`
					GoalsAgainstAvg float64 `json:"goalsAgainstAvg"`
					Wins            int     `json:"wins"`
					Losses          int     `json:"losses"`
				} `json:"subSeason"`
			} `json:"regularSeason"`
		} `json:"featuredStats"`
	}

	if err := json.Unmarshal(rawJSON, &playerResp); err != nil {
		return basePlayer, err
	}

	// Start with base player data (from roster) and enrich with API data
	player := basePlayer
	player.ID = playerResp.PlayerID
	if player.ID == 0 {
		player.ID = basePlayer.ID
	}

	player.Photo = playerResp.Headshot
	player.ActionShot = playerResp.HeroImage
	player.ShootsCatches = playerResp.ShootsCatches

	// Set birth place
	birthParts := []string{}
	if playerResp.BirthCity.Default != "" {
		birthParts = append(birthParts, playerResp.BirthCity.Default)
	}
	if playerResp.BirthStateProvince.Default != "" {
		birthParts = append(birthParts, playerResp.BirthStateProvince.Default)
	}
	if playerResp.BirthCountry != "" {
		birthParts = append(birthParts, playerResp.BirthCountry)
	}
	if len(birthParts) > 0 {
		player.BirthPlace = strings.Join(birthParts, ", ")
	}

	// Set stats based on position
	subSeason := playerResp.FeaturedStats.RegularSeason.SubSeason

	if player.Position == "G" {
		// Goalie stats
		player.Stats = &PlayerStats{
			Games:          subSeason.Games,
			Wins:           subSeason.Wins,
			Losses:         subSeason.Losses,
			GAA:            subSeason.GoalsAgainstAvg,
			SavePercentage: subSeason.SavePctg,
		}
	} else {
		// Skater stats
		player.Stats = &PlayerStats{
			Games:     subSeason.Games,
			Goals:     subSeason.Goals,
			Assists:   subSeason.Assists,
			Points:    subSeason.Points,
			PlusMinus: subSeason.PlusMinus,
			PIM:       subSeason.PIM,
			Shots:     subSeason.Shots,
		}
	}

	return player, nil
}

// getOrFetchPlayer retrieves player from cache or fetches with retries
func getOrFetchPlayer(playerID int, basePlayer PlayerInfo) PlayerInfo {
	// Try to get raw JSON from cache first and parse it
	cacheKey := fmt.Sprintf("player:%d", playerID)
	if cachedData, err := getCachedRaw(cacheKey); err == nil {
		log.Printf("Found cached raw player data for %d", playerID)
		// Parse the cached raw JSON into PlayerInfo
		parsedPlayer, parseErr := parsePlayerFromRawJSON(cachedData, basePlayer)
		if parseErr == nil {
			return parsedPlayer
		}
		log.Printf("Failed to parse cached player data for %d: %v", playerID, parseErr)
	}

	// Not in cache, need to fetch
	playerData := basePlayer

	// Retry with exponential backoff
	backoffDelays := []time.Duration{0, 30 * time.Second, 1 * time.Minute, 2 * time.Minute}
	for attempt, delay := range backoffDelays {
		if delay > 0 {
			log.Printf("Backing off for %v before retrying player %d", delay, playerID)
			time.Sleep(delay)
		}

		if err := fetchPlayerData(playerID, &playerData); err != nil {
			if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "Too Many Requests") {
				if attempt < len(backoffDelays)-1 {
					log.Printf("429 error for player %d, attempt %d, will retry", playerID, attempt+1)
					continue
				} else {
					log.Printf("429 error for player %d, max retries exceeded, using base data", playerID)
					break
				}
			} else {
				log.Printf("Non-429 error for player %d: %v, using base data", playerID, err)
				break
			}
		} else {
			// Success! Player data is already cached in fetchPlayerData
			log.Printf("Successfully fetched and cached player %d", playerID)
			break
		}
	}

	return playerData
}

// GetRoster fetches team roster with player stats
func GetRoster(teamId string) (*RosterResponse, error) {
	// Convert team ID or abbreviation into the canonical abbreviation we use
	var teamAbbr string
	teamIDInt := -1
	// If numeric ID provided, resolve to canonical abbreviation
	if _, err := fmt.Sscanf(teamId, "%d", &teamIDInt); err == nil {
		if abbr, ok := teamIDToAbbr[teamIDInt]; ok {
			teamAbbr = abbr
		} else {
			// Unknown numeric ID (likely an international/Olympic team). Fall back to
			// treating the provided identifier as an abbreviation so the non-NHL
			// fallback below can return an empty roster instead of an error.
			log.Printf("Unknown numeric team id %s — falling back to treat as abbrev", teamId)
			teamAbbr = strings.ToUpper(teamId)
		}
	} else {
		// Not numeric: treat input as abbreviation (e.g., "wpg") and normalize
		teamAbbr = strings.ToUpper(teamId)
	}

	// If the abbreviation is not a known NHL team, assume it's an international/Olympic team
	// and return an empty roster (upstream won't have NHL roster data for these teams).
	if _, ok := abbrevToTeamID[teamAbbr]; !ok {
		log.Printf("Detected non‑NHL team abbreviation '%s' — returning empty roster", teamAbbr)
		return &RosterResponse{Players: []PlayerInfo{}}, nil
	}

	seasonID := currentSeasonID()
	cacheKey := fmt.Sprintf("roster:%s-%s", teamAbbr, seasonID)

	// Build roster URL using current season and lower-case team abbreviation
	url := fmt.Sprintf("%s/roster/%s/%s", BaseURL, strings.ToLower(teamAbbr), seasonID)

	// Try fetching the roster with a small retry/backoff in case the upstream temporarily returns
	// inconsistent data (some entries missing names/ids).
	var data []byte
	var fetchErr error
	backoff := []time.Duration{0, 5 * time.Second, 15 * time.Second}
	for i, d := range backoff {
		if d > 0 {
			time.Sleep(d)
		}
		var body io.ReadCloser
		body, fetchErr = fetchURL(url)
		if fetchErr == nil {
			data, fetchErr = io.ReadAll(body)
			_ = body.Close()
			if fetchErr == nil {
				break
			}
		}
		if i == len(backoff)-1 {
			break
		}
		log.Printf("Retrying roster fetch for %s after error: %v", teamId, fetchErr)
	}
	if fetchErr != nil {
		// If rate limited, try Redis cached copy
		if strings.Contains(fetchErr.Error(), "429") || strings.Contains(fetchErr.Error(), "Too Many Requests") {
			log.Printf("Upstream 429 for roster %s, trying Redis", teamId)
			if cachedData, cacheErr := getCachedRaw(cacheKey); cacheErr == nil {
				log.Printf("Found cached roster for %s in Redis", teamId)
				var response RosterResponse
				jsonErr := json.Unmarshal(cachedData, &response)
				if jsonErr == nil {
					// Log any players with ID 0 in cached data
					for i, p := range response.Players {
						if p.ID == 0 {
							log.Printf("WARNING: Cached roster for %s has player at index %d with ID 0, name='%s', position='%s'", teamId, i, p.Name, p.Position)
						}
					}
					return &response, nil
				}
				log.Printf("Failed to unmarshal cached roster: %v", jsonErr)
			} else {
				log.Printf("No cached roster for %s in Redis: %v", teamId, cacheErr)
			}
		}
		return nil, fmt.Errorf("failed to fetch roster: %w", fetchErr)
	}

	// Unmarshal into typed RosterPlayer slices so we can pick localized names reliably
	var rosterResp struct {
		Forwards   []RosterPlayer `json:"forwards"`
		Defensemen []RosterPlayer `json:"defensemen"`
		Goalies    []RosterPlayer `json:"goalies"`
	}
	if err := json.Unmarshal(data, &rosterResp); err != nil {
		return nil, fmt.Errorf("parsing roster response: %w", err)
	}

	var players []PlayerInfo

	// Helper to build PlayerInfo from RosterPlayer and role
	makePlayer := func(r RosterPlayer, pos, fullPos string) *PlayerInfo {
		first := pickName(r.FirstName)
		last := pickName(r.LastName)
		name := strings.TrimSpace(first + " " + last)
		return &PlayerInfo{
			ID:            r.ID,
			Name:          name,
			Number:        r.SweaterNumber,
			Position:      pos,
			FullPosition:  fullPos,
			Photo:         r.Headshot,
			ShootsCatches: r.ShootsCatches,
			Stats:         &PlayerStats{},
		}
	}

	// Add forwards with enrichment
	for _, r := range rosterResp.Forwards {
		log.Printf("Processing forward: ID=%d, Name=%s %s", r.ID, pickName(r.FirstName), pickName(r.LastName))
		p := makePlayer(r, "F", "Forward")
		enriched := getOrFetchPlayer(r.ID, *p)
		if enriched.Name == "" {
			enriched.Name = p.Name
		}
		if enriched.ID == 0 {
			log.Printf("ERROR: After enrichment, forward has ID 0: original ID=%d, name='%s'", r.ID, enriched.Name)
		}
		players = append(players, enriched)
	}

	// Add defensemen with enrichment
	for _, r := range rosterResp.Defensemen {
		p := makePlayer(r, "D", "Defenseman")
		enriched := getOrFetchPlayer(r.ID, *p)
		if enriched.Name == "" {
			enriched.Name = p.Name
		}
		players = append(players, enriched)
	}

	// Add goalies with enrichment
	for _, r := range rosterResp.Goalies {
		p := makePlayer(r, "G", "Goalie")
		enriched := getOrFetchPlayer(r.ID, *p)
		if enriched.Name == "" {
			enriched.Name = p.Name
		}
		players = append(players, enriched)
	}

	resp := &RosterResponse{Players: players}

	// Cache the successful response in Redis
	if cacheData, jsonErr := json.Marshal(resp); jsonErr == nil {
		if setErr := setCachedRaw(cacheKey, cacheData, time.Hour); setErr != nil {
			log.Printf("Failed to cache roster for %s: %v", teamId, setErr)
		}
	}

	return resp, nil
}

// fetchPlayerData fetches player stats and photo from the player landing endpoint
// It caches the full raw JSON response and parses needed fields into the player struct
func fetchPlayerData(playerID int, player *PlayerInfo) error {
	url := fmt.Sprintf("%s/player/%d/landing", BaseURL, playerID)

	body, err := fetchURL(url)
	if err != nil {
		return fmt.Errorf("failed to fetch player %d data: %w", playerID, err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return fmt.Errorf("failed to read player %d response: %w", playerID, err)
	}

	// Cache the full raw JSON response for use by both roster and player detail endpoints
	cacheKey := fmt.Sprintf("player:%d", playerID)
	if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
		log.Printf("Failed to cache raw player data for %d: %v", playerID, setErr)
	}

	var playerResp struct {
		Headshot      string `json:"headshot"`
		HeroImage     string `json:"heroImage"`
		ShootsCatches string `json:"shootsCatches"`
		BirthCity     struct {
			Default string `json:"default"`
		} `json:"birthCity"`
		BirthStateProvince struct {
			Default string `json:"default"`
		} `json:"birthStateProvince"`
		BirthCountry  string `json:"birthCountry"`
		FeaturedStats struct {
			RegularSeason struct {
				SubSeason struct {
					Games           int     `json:"gamesPlayed"`
					Goals           int     `json:"goals"`
					Assists         int     `json:"assists"`
					Points          int     `json:"points"`
					PlusMinus       int     `json:"plusMinus"`
					PIM             int     `json:"pim"`
					Shots           int     `json:"shots"`
					SavePctg        float64 `json:"savePctg"`
					GoalsAgainstAvg float64 `json:"goalsAgainstAvg"`
					Wins            int     `json:"wins"`
					Losses          int     `json:"losses"`
				} `json:"subSeason"`
			} `json:"regularSeason"`
		} `json:"featuredStats"`
	}

	if err := json.Unmarshal(data, &playerResp); err != nil {
		return fmt.Errorf("failed to parse player %d response: %w", playerID, err)
	}

	// Ensure ID is always set (critical for caching)
	player.ID = playerID

	// Set photo
	player.Photo = playerResp.Headshot
	player.ActionShot = playerResp.HeroImage
	player.ShootsCatches = playerResp.ShootsCatches

	// Set birth place
	birthParts := []string{}
	if playerResp.BirthCity.Default != "" {
		birthParts = append(birthParts, playerResp.BirthCity.Default)
	}
	if playerResp.BirthStateProvince.Default != "" {
		birthParts = append(birthParts, playerResp.BirthStateProvince.Default)
	}
	if playerResp.BirthCountry != "" {
		birthParts = append(birthParts, playerResp.BirthCountry)
	}
	if len(birthParts) > 0 {
		player.BirthPlace = strings.Join(birthParts, ", ")
	}

	// Set stats based on position
	subSeason := playerResp.FeaturedStats.RegularSeason.SubSeason

	if player.Position == "G" {
		// Goalie stats
		player.Stats = &PlayerStats{
			Games:          subSeason.Games,
			Wins:           subSeason.Wins,
			Losses:         subSeason.Losses,
			GAA:            subSeason.GoalsAgainstAvg,
			SavePercentage: subSeason.SavePctg,
		}
	} else {
		// Skater stats
		player.Stats = &PlayerStats{
			Games:     subSeason.Games,
			Goals:     subSeason.Goals,
			Assists:   subSeason.Assists,
			Points:    subSeason.Points,
			PlusMinus: subSeason.PlusMinus,
			PIM:       subSeason.PIM,
			Shots:     subSeason.Shots,
		}
	}

	return nil
}
func fetchURL(url string) (io.ReadCloser, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		if cerr := resp.Body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, url)
	}

	return resp.Body, nil
}
