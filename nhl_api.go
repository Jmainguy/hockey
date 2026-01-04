package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

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
	teamCache     map[string]*TeamDetails
	rosterCache   map[string]*RosterResponse // key format: TEAMABBR-SEASONID
	cacheMutex    sync.RWMutex
	cacheTimeout  = 5 * time.Minute
	lastCacheTime time.Time
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
	teamCache = make(map[string]*TeamDetails)
	rosterCache = make(map[string]*RosterResponse)
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
	// Use date-based standings endpoint (e.g., /standings/2025-11-23)
	url := fmt.Sprintf("%s/standings/%s", BaseURL, getStandingsDate())

	body, err := fetchURL(url)
	if err != nil {
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

	return &TeamsResponse{Teams: teams}, nil
}

// GetTeamDetails fetches team details including record and stats
func GetTeamDetails(teamId string) (*TeamDetailsResponse, error) {
	cacheMutex.RLock()
	if time.Since(lastCacheTime) < cacheTimeout {
		if cached, ok := teamCache[teamId]; ok {
			cacheMutex.RUnlock()
			response := &TeamDetailsResponse{
				Teams: []TeamDetails{*cached},
			}
			return response, nil
		}
	}
	cacheMutex.RUnlock()

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

	// Cache the result
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

	cacheMutex.Lock()
	teamCache[teamId] = &team
	lastCacheTime = time.Now()
	cacheMutex.Unlock()

	return &TeamDetailsResponse{Teams: []TeamDetails{team}}, nil
}

// GetRoster fetches team roster with player stats
func GetRoster(teamId string) (*RosterResponse, error) {
	// Convert team ID to abbreviation
	var teamAbbr string
	teamIDInt := 1
	if _, err := fmt.Sscanf(teamId, "%d", &teamIDInt); err != nil {
		// If not an int, treat as abbreviation
		teamAbbr = strings.ToUpper(teamId)
		if id, ok := abbrevToTeamID[teamAbbr]; ok {
			teamIDInt = id
		}
	}
	if abbr, ok := teamIDToAbbr[teamIDInt]; ok {
		teamAbbr = abbr
	} else {
		return nil, fmt.Errorf("unknown team id: %s", teamId)
	}

	seasonID := currentSeasonID()
	cacheKey := fmt.Sprintf("%s-%s", teamAbbr, seasonID)

	// Check roster cache (key by teamAbbr)
	cacheMutex.RLock()
	if cached, ok := rosterCache[cacheKey]; ok {
		if time.Since(lastCacheTime) < cacheTimeout {
			cacheMutex.RUnlock()
			return cached, nil
		}
	}
	cacheMutex.RUnlock()

	// Build roster URL using current season and lower-case team abbreviation
	url := fmt.Sprintf("%s/roster/%s/%s", BaseURL, strings.ToLower(teamAbbr), seasonID)

	body, err := fetchURL(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch roster: %w", err)
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("reading roster response: %w", err)
	}

	// Parse roster response
	var rosterResp struct {
		Forwards []struct {
			ID int `json:"id"`

			FirstName struct {
				Default string `json:"default"`
			} `json:"firstName"`
			LastName struct {
				Default string `json:"default"`
			} `json:"lastName"`
			SweaterNumber int `json:"sweaterNumber"`
		} `json:"forwards"`
		Defensemen []struct {
			ID        int `json:"id"`
			FirstName struct {
				Default string `json:"default"`
			} `json:"firstName"`
			LastName struct {
				Default string `json:"default"`
			} `json:"lastName"`
			SweaterNumber int `json:"sweaterNumber"`
		} `json:"defensemen"`
		Goalies []struct {
			ID        int `json:"id"`
			FirstName struct {
				Default string `json:"default"`
			} `json:"firstName"`
			LastName struct {
				Default string `json:"default"`
			} `json:"lastName"`
			SweaterNumber int `json:"sweaterNumber"`
		} `json:"goalies"`
	}

	if err := json.Unmarshal(data, &rosterResp); err != nil {
		return nil, fmt.Errorf("parsing roster response: %w", err)
	}

	var players []PlayerInfo

	// Add forwards
	for _, player := range rosterResp.Forwards {
		name := player.FirstName.Default + " " + player.LastName.Default
		playerData := PlayerInfo{
			ID:           player.ID,
			Name:         name,
			Number:       player.SweaterNumber,
			Position:     "F",
			FullPosition: "Forward",
			Stats:        &PlayerStats{},
		}

		// Fetch player stats from landing endpoint
		if player.ID > 0 {
			fetchPlayerData(player.ID, &playerData)
		}

		players = append(players, playerData)
	}

	// Add defensemen
	for _, player := range rosterResp.Defensemen {
		name := player.FirstName.Default + " " + player.LastName.Default
		playerData := PlayerInfo{
			ID:           player.ID,
			Name:         name,
			Number:       player.SweaterNumber,
			Position:     "D",
			FullPosition: "Defenseman",
			Stats:        &PlayerStats{},
		}

		// Fetch player stats from landing endpoint
		if player.ID > 0 {
			fetchPlayerData(player.ID, &playerData)
		}

		players = append(players, playerData)
	}

	// Add goalies
	for _, player := range rosterResp.Goalies {
		name := player.FirstName.Default + " " + player.LastName.Default
		playerData := PlayerInfo{
			ID:           player.ID,
			Name:         name,
			Number:       player.SweaterNumber,
			Position:     "G",
			FullPosition: "Goalie",
			Stats:        &PlayerStats{},
		}

		// Fetch player stats from landing endpoint
		if player.ID > 0 {
			fetchPlayerData(player.ID, &playerData)
		}

		players = append(players, playerData)
	}

	resp := &RosterResponse{Players: players}
	cacheMutex.Lock()
	rosterCache[cacheKey] = resp
	lastCacheTime = time.Now()
	cacheMutex.Unlock()
	return resp, nil
}

// fetchPlayerData fetches player stats and photo from the player landing endpoint
func fetchPlayerData(playerID int, player *PlayerInfo) {
	url := fmt.Sprintf("%s/player/%d/landing", BaseURL, playerID)

	body, err := fetchURL(url)
	if err != nil {
		return
	}
	defer func() {
		if cerr := body.Close(); cerr != nil {
			log.Printf("Error closing response body: %v", cerr)
		}
	}()

	data, err := io.ReadAll(body)
	if err != nil {
		return
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
		return
	}

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
