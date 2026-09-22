package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"

	"strings"
	"time"
)

// Legacy processed caches use a versioned namespace and finite lifetimes.
// Upstream request coalescing and stale fallback live in upstream.go.
func getCachedRaw(key string) ([]byte, error) {
	entry, ok := upstream.cached("processed:" + key)
	if !ok || time.Now().After(entry.FreshUntil) {
		return nil, fmt.Errorf("cache miss")
	}
	return entry.Data, nil
}
func setCachedRaw(key string, data []byte, ttl time.Duration) error {
	if ttl <= 0 || ttl > time.Hour {
		ttl = time.Hour
	}
	upstream.save("processed:"+key, data, ttl)
	return nil
}

// BaseURL is the upstream NHL API base URL.
var (
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
func GetGameLanding(gameID string) (*GameLanding, error) {
	url := fmt.Sprintf("%s/gamecenter/%s/landing", BaseURL, gameID)
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

// currentSeasonID returns the active NHL season ID like 20262027.
// The NHL league year rolls over on July 1, when offseason roster movement
// begins and the API exposes the upcoming season's roster and schedule.
func currentSeasonID() string {
	return seasonIDAt(time.Now().UTC())
}

func seasonIDAt(now time.Time) string {
	year := now.Year()
	var startYear, endYear int
	if now.Month() >= time.July {
		startYear = year
		endYear = year + 1
	} else {
		startYear = year - 1
		endYear = year
	}
	return fmt.Sprintf("%d%d", startYear, endYear)
}

// hasNonEmptyStandingsJSON returns true if the JSON contains a non-empty "standings" array.
func hasNonEmptyStandingsJSON(data []byte) bool {
	var s struct {
		Standings []json.RawMessage `json:"standings"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return false
	}
	return len(s.Standings) > 0
}

// The NHL's now endpoint carries its own season/date. Never scan historical
// dates on a visitor request. Empty offseason standings are a valid response.
func getStandingsPayloadForUI() ([]byte, error) {
	entry, err := upstream.get(context.Background(), BaseURL+"/standings/now")
	return entry.Data, err
}

// playoffBracketCalendarYear returns the year used in /playoff-bracket/{year}
// (spring year of the Stanley Cup for the current season, e.g. 2025 for 2024-25).
func playoffBracketCalendarYear() int {
	now := time.Now().UTC()
	if now.Month() >= time.September {
		return now.Year() + 1
	}
	return now.Year()
}

// GetPlayoffBracketJSON fetches the league playoff bracket (series, wins, team logos).
func GetPlayoffBracketJSON() ([]byte, error) {
	e, err := upstream.get(context.Background(), fmt.Sprintf("%s/playoff-bracket/%d", BaseURL, playoffBracketCalendarYear()))
	return e.Data, err
}
func GetPlayoffSeriesScheduleJSON(seasonID, seriesLetter string) ([]byte, error) {
	e, err := upstream.get(context.Background(), fmt.Sprintf("%s/schedule/playoff-series/%s/%s", BaseURL, seasonID, strings.ToUpper(seriesLetter)))
	return e.Data, err
}

// GetAllTeams fetches all NHL teams from standings
func GetAllTeams() (*TeamsResponse, error) {
	data, err := getStandingsPayloadForUI()
	if err != nil {
		return catalogResponse(), nil
	}

	return parseStandings(data)
}

func parseStandings(data []byte) (*TeamsResponse, error) {
	// Parse standings response - note different structure from old API
	var standingsResp struct {
		Standings []struct {
			Rank           int     `json:"leagueSequence"`
			ConferenceRank int     `json:"conferenceSequence"`
			DivisionRank   int     `json:"divisionSequence"`
			PointPctg      float64 `json:"pointPctg"`
			TeamAbbrev     struct {
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
			Rank: standing.Rank, ConferenceRank: standing.ConferenceRank, DivisionRank: standing.DivisionRank, PointPctg: standing.PointPctg,
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

	if len(teams) == 0 {
		return catalogResponse(), nil
	}
	var meta struct {
		Standings []struct {
			Date     string `json:"date"`
			SeasonID int    `json:"seasonId"`
		} `json:"standings"`
	}
	_ = json.Unmarshal(data, &meta)
	response := &TeamsResponse{Teams: teams, StandingsAvailable: true}
	if len(meta.Standings) > 0 {
		response.AsOf = meta.Standings[0].Date
		response.Season = meta.Standings[0].SeasonID
	}
	return response, nil
}

// GetTeamDetails fetches team details including record and stats
func GetTeamDetails(teamID string) (*TeamDetailsResponse, error) {
	abbr := strings.ToUpper(teamID)
	if id, err := strconv.Atoi(teamID); err == nil {
		abbr = teamIDToAbbr[id]
	}
	response, err := catalogTeamDetails(abbr)
	if err != nil {
		return nil, err
	}
	// Identity and navigation never wait for the standings service.
	if e, ok := upstream.cached(BaseURL + "/standings/now"); ok && hasNonEmptyStandingsJSON(e.Data) {
		teams, _ := GetAllTeams()
		for _, t := range teams.Teams {
			if t.Abbrev == abbr {
				team := &response.Teams[0]
				team.AsOf = teams.AsOf
				team.Season = teams.Season
				team.Record = append(team.Record, struct {
					Type           string `json:"type"`
					Wins           int    `json:"wins"`
					Losses         int    `json:"losses"`
					OvertimeLosses int    `json:"overtimeLosses"`
					GamesPlayed    int    `json:"gamesPlayed"`
					Points         int    `json:"points"`
				}{"season", t.Record.Wins, t.Record.Losses, t.Record.OvertimeLosses, t.GamesPlayed, t.Record.Points})
			}
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

	// Build a combined `players` array (roster-like) including any warmed
	// `player:<id>` cached data we have available so the UI can behave like
	// the roster endpoint (and sort by draft position).
	var original map[string]interface{}
	if err := json.Unmarshal(data, &original); err != nil {
		// If we can't unmarshal original, just cache and return original bytes
		if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
			log.Printf("Failed to cache prospects for %s: %v", teamAbbrev, setErr)
		}
		return data, nil
	}

	// Build `players` array (preserving upstream fields) and attach it to the
	// original payload. Sorting / extraction of `overallPick` is handled in
	// the helper for clarity.
	players := buildPlayersFromOriginal(original, []string{"forwards", "defensemen", "goalies"})
	original["players"] = players

	newData, jerr := json.Marshal(original)
	if jerr != nil {
		// Fallback to original bytes if marshal fails
		if setErr := setCachedRaw(cacheKey, data, time.Hour); setErr != nil {
			log.Printf("Failed to cache prospects for %s: %v", teamAbbrev, setErr)
		}
		return data, nil
	}

	// Cache the augmented prospects response (includes `players`)
	if setErr := setCachedRaw(cacheKey, newData, time.Hour); setErr != nil {
		log.Printf("Failed to cache prospects for %s: %v", teamAbbrev, setErr)
	}

	return newData, nil
}

// buildPlayersFromOriginal constructs a roster-like `players` slice from the
// raw prospects payload. It preserves all upstream fields and, when available,
// surfaces a warmed `draftDetails.overallPick` from `player:<id>` cache entries.
func buildPlayersFromOriginal(original map[string]interface{}, sections []string) []map[string]interface{} {
	var players []map[string]interface{}

	for _, section := range sections {
		raw, ok := original[section]
		if !ok {
			continue
		}
		list, ok := raw.([]interface{})
		if !ok {
			continue
		}

		for _, item := range list {
			pm, ok := item.(map[string]interface{})
			if !ok {
				continue
			}

			// Shallow copy original prospect map so we keep all upstream fields
			m := make(map[string]interface{}, len(pm)+1)
			for k, v := range pm {
				m[k] = v
			}

			// Extract numeric id (JSON numbers are float64)
			id := 0
			if vid, ok := pm["id"]; ok {
				switch t := vid.(type) {
				case float64:
					id = int(t)
				case int:
					id = t
				}
			}

			if e, ok := upstream.cached(fmt.Sprintf("%s/player/%d/landing", BaseURL, id)); ok {
				var cp struct {
					DraftDetails struct {
						OverallPick int `json:"overallPick"`
					} `json:"draftDetails"`
				}
				if json.Unmarshal(e.Data, &cp) == nil && cp.DraftDetails.OverallPick > 0 {
					m["overallPick"] = cp.DraftDetails.OverallPick
				}
			}

			if _, ok := m["overallPick"]; !ok {
				m["overallPick"] = 999999
			}

			players = append(players, m)
		}
	}

	sort.SliceStable(players, func(i, j int) bool {
		vi, _ := players[i]["overallPick"].(int)
		vj, _ := players[j]["overallPick"].(int)
		return vi < vj
	})

	return players
}

// GetRoster fetches team roster with player stats
func GetRoster(ctx context.Context, teamID string, selected ...string) (*RosterResponse, error) {
	// Convert team ID or abbreviation into the canonical abbreviation we use
	var teamAbbr string
	teamIDInt := -1
	// If numeric ID provided, resolve to canonical abbreviation
	if _, err := fmt.Sscanf(teamID, "%d", &teamIDInt); err == nil {
		if abbr, ok := teamIDToAbbr[teamIDInt]; ok {
			teamAbbr = abbr
		} else {
			// Unknown numeric ID (likely an international/Olympic team). Fall back to
			// treating the provided identifier as an abbreviation so the non-NHL
			// fallback below can return an empty roster instead of an error.
			log.Printf("Unknown numeric team id %s — falling back to treat as abbrev", teamID)
			teamAbbr = strings.ToUpper(teamID)
		}
	} else {
		// Not numeric: treat input as abbreviation (e.g., "wpg") and normalize
		teamAbbr = strings.ToUpper(teamID)
	}

	// If the abbreviation is not a known NHL team, assume it's an international/Olympic team
	// and return an empty roster (upstream won't have NHL roster data for these teams).
	if _, ok := abbrevToTeamID[teamAbbr]; !ok {
		log.Printf("Detected non‑NHL team abbreviation '%s' — returning empty roster", teamAbbr)
		return &RosterResponse{Players: []PlayerInfo{}}, nil
	}

	seasonID := currentSeasonID()
	statsPath := "/now"
	if len(selected) > 0 && selected[0] != "" {
		seasonID = selected[0]
		statsPath = "/" + seasonID + "/2"
	}
	preseason := false
	if len(selected) > 0 && seasonID == currentSeasonID() {
		seasons, err := standingsSeasons(ctx)
		if err == nil {
			for _, s := range seasons.Seasons {
				if strconv.Itoa(s.ID) == seasonID && s.DefaultView == "preseason" {
					preseason = true
					statsPath = "/" + seasonID + "/1"
				}
			}
		}
	}
	statsURL := BaseURL + "/club-stats/" + teamAbbr + statsPath
	rosterURL := fmt.Sprintf("%s/roster/%s/%s", BaseURL, strings.ToLower(teamAbbr), seasonID)
	// Start the two independent resources together; never fetch every player.
	statsDone := make(chan struct{})
	go func() { defer close(statsDone); _, _ = upstream.get(ctx, statsURL) }()
	entry, err := upstream.get(ctx, rosterURL)
	if err != nil {
		return nil, err
	}
	data := []byte(entry.Data)

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
			Stats:         nil,
		}
	}

	// Add forwards with enrichment
	for _, r := range rosterResp.Forwards {
		p := makePlayer(r, "F", "Forward")
		enriched := *p
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
		enriched := *p
		if enriched.Name == "" {
			enriched.Name = p.Name
		}
		players = append(players, enriched)
	}

	// Add goalies with enrichment
	for _, r := range rosterResp.Goalies {
		p := makePlayer(r, "G", "Goalie")
		enriched := *p
		if enriched.Name == "" {
			enriched.Name = p.Name
		}
		players = append(players, enriched)
	}

	select {
	case <-statsDone:
	case <-ctx.Done():
	}
	season := enrichRosterStats(teamAbbr, players, statsPath)
	if preseason {
		if err := preseasonPlayerStats(ctx, teamAbbr, seasonID, players); err != nil {
			return nil, err
		}
		season, _ = strconv.Atoi(seasonID)
	}
	resp := &RosterResponse{Players: players, Season: season, UpdatedAt: entry.UpdatedAt, Stale: time.Now().After(entry.FreshUntil)}
	if preseason {
		resp.GameType = 1
	} else {
		resp.GameType = 2
	}
	if e, ok := upstream.cached(statsURL); ok {
		if e.UpdatedAt.Before(resp.UpdatedAt) {
			resp.UpdatedAt = e.UpdatedAt
		}
		resp.Stale = resp.Stale || time.Now().After(e.FreshUntil)
	}

	return resp, nil
}

func fetchURL(url string) (io.ReadCloser, error) { return fetchURLContext(context.Background(), url) }
func fetchURLContext(ctx context.Context, url string) (io.ReadCloser, error) {
	entry, err := upstream.get(ctx, url)
	if err != nil {
		return nil, err
	}
	return io.NopCloser(bytes.NewReader(entry.Data)), nil
}
func rateLimitedGetContext(ctx context.Context, url string) (*http.Response, error) {
	body, err := fetchURLContext(ctx, url)
	if err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: http.StatusOK, Body: body, Header: make(http.Header)}, nil
}
