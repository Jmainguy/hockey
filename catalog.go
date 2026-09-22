package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Team identity is available even when standings are empty or NHL is offline.
func catalogResponse() *TeamsResponse {
	divisions := map[string][]string{
		"Atlantic":     {"BOS|Boston Bruins", "BUF|Buffalo Sabres", "DET|Detroit Red Wings", "FLA|Florida Panthers", "MTL|Montréal Canadiens", "OTT|Ottawa Senators", "TBL|Tampa Bay Lightning", "TOR|Toronto Maple Leafs"},
		"Metropolitan": {"CAR|Carolina Hurricanes", "CBJ|Columbus Blue Jackets", "NJD|New Jersey Devils", "NYI|New York Islanders", "NYR|New York Rangers", "PHI|Philadelphia Flyers", "PIT|Pittsburgh Penguins", "WSH|Washington Capitals"},
		"Central":      {"CHI|Chicago Blackhawks", "COL|Colorado Avalanche", "DAL|Dallas Stars", "MIN|Minnesota Wild", "NSH|Nashville Predators", "STL|St. Louis Blues", "UTA|Utah Mammoth", "WPG|Winnipeg Jets"},
		"Pacific":      {"ANA|Anaheim Ducks", "CGY|Calgary Flames", "EDM|Edmonton Oilers", "LAK|Los Angeles Kings", "SJS|San Jose Sharks", "SEA|Seattle Kraken", "VAN|Vancouver Canucks", "VGK|Vegas Golden Knights"},
	}
	out := &TeamsResponse{Teams: []Team{}}
	for division, entries := range divisions {
		conf := "Western"
		if division == "Atlantic" || division == "Metropolitan" {
			conf = "Eastern"
		}
		for _, entry := range entries {
			p := strings.SplitN(entry, "|", 2)
			out.Teams = append(out.Teams, Team{ID: abbrevToTeamID[p[0]], Abbrev: p[0], Name: p[1], Division: division, Conference: conf})
		}
	}
	sort.Slice(out.Teams, func(i, j int) bool { return out.Teams[i].Name < out.Teams[j].Name })
	return out
}
func catalogTeamDetails(abbr string) (*TeamDetailsResponse, error) {
	for _, t := range catalogResponse().Teams {
		if t.Abbrev == strings.ToUpper(abbr) {
			d := TeamDetails{ID: t.ID, Name: t.Name, TeamName: t.Name, Abbreviation: t.Abbrev, Logo: fmt.Sprintf("https://assets.nhle.com/logos/nhl/svg/%s_light.svg", t.Abbrev)}
			d.Division.Name = t.Division
			d.Conference.Name = t.Conference
			return &TeamDetailsResponse{Teams: []TeamDetails{d}}, nil
		}
	}
	return nil, fmt.Errorf("unknown team")
}

// One club-stat payload replaces dozens of synchronous player landing calls.
// Its season is returned explicitly, since preseason rosters often reference
// statistics from the previous regular season.
func enrichRosterStats(abbr string, players []PlayerInfo, selected ...string) int {
	path := "/now"
	if len(selected) > 0 {
		path = selected[0]
	}
	entry, ok := upstream.cached(BaseURL + "/club-stats/" + abbr + path)
	if !ok {
		return 0
	}
	type stat struct {
		ID        int     `json:"playerId"`
		Games     int     `json:"gamesPlayed"`
		Goals     int     `json:"goals"`
		Assists   int     `json:"assists"`
		Points    int     `json:"points"`
		PlusMinus int     `json:"plusMinus"`
		Wins      int     `json:"wins"`
		Losses    int     `json:"losses"`
		GAA       float64 `json:"goalsAgainstAverage"`
		Save      float64 `json:"savePercentage"`
	}
	var data struct {
		Season  json.Number `json:"season"`
		Skaters []stat      `json:"skaters"`
		Goalies []stat      `json:"goalies"`
	}
	if json.Unmarshal(entry.Data, &data) != nil {
		return 0
	}
	byID := map[int]stat{}
	for _, s := range append(data.Skaters, data.Goalies...) {
		byID[s.ID] = s
	}
	for i := range players {
		if s, ok := byID[players[i].ID]; ok {
			players[i].Stats = &PlayerStats{Games: s.Games, Goals: s.Goals, Assists: s.Assists, Points: s.Points, PlusMinus: s.PlusMinus, Wins: s.Wins, Losses: s.Losses, GAA: s.GAA, SavePercentage: s.Save}
		} else {
			players[i].Stats = nil
		}
	}
	season, _ := strconv.Atoi(data.Season.String())
	return season
}
