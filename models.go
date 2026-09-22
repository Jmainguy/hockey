package main

import (
	"encoding/json"
	"io"
	"time"
)

// Team represents an NHL team
type Team struct {
	Rank           int     `json:"rank"`
	ConferenceRank int     `json:"conferenceRank"`
	DivisionRank   int     `json:"divisionRank"`
	PointPctg      float64 `json:"pointPctg"`
	ID             int     `json:"id"`
	Name           string  `json:"name"`
	Abbrev         string  `json:"abbrev"`
	Link           string  `json:"link"`
	Conference     string  `json:"conference"`
	Division       string  `json:"division"`
	Record         struct {
		Wins           int `json:"wins"`
		Losses         int `json:"losses"`
		OvertimeLosses int `json:"overtimeLosses"`
		Points         int `json:"points"`
	} `json:"record"`
	GamesPlayed  int     `json:"gamesPlayed"`
	GoalsFor     int     `json:"goalsFor"`
	GoalsAgainst int     `json:"goalsAgainst"`
	GoalDiff     int     `json:"goalDiff"`
	LastTen      string  `json:"lastTen,omitempty"`
	Streak       string  `json:"streak,omitempty"`
	WinPct       float64 `json:"winPct"`
}

// TeamDetails contains detailed team information
type TeamDetails struct {
	AsOf         string `json:"asOf,omitempty"`
	Season       int    `json:"season,omitempty"`
	ID           int    `json:"id"`
	Name         string `json:"name"`
	TeamName     string `json:"teamName"`
	LocationName string `json:"locationName"`
	Abbreviation string `json:"abbreviation"`
	WordmarkURL  string `json:"wordmarkUrl,omitempty"`
	Logo         string `json:"logo,omitempty"`
	DarkLogo     string `json:"darkLogo,omitempty"`
	Conference   struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"conference"`
	Division struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"division"`
	Website   string `json:"website"`
	Franchise struct {
		FranchiseID int    `json:"franchiseId"`
		TeamName    string `json:"teamName"`
	} `json:"franchise"`
	Stats  []interface{} `json:"stats"`
	Record []struct {
		Type           string `json:"type"`
		Wins           int    `json:"wins"`
		Losses         int    `json:"losses"`
		OvertimeLosses int    `json:"overtimeLosses"`
		GamesPlayed    int    `json:"gamesPlayed"`
		Points         int    `json:"points"`
	} `json:"record"`
}

// PlayerInfo represents a player on a roster
type PlayerInfo struct {
	ID            int          `json:"id"`
	Name          string       `json:"name"`
	Number        int          `json:"number"`
	Position      string       `json:"position"`
	FullPosition  string       `json:"fullPosition"`
	Photo         string       `json:"photo"`
	ActionShot    string       `json:"actionShot,omitempty"`
	BirthPlace    string       `json:"birthPlace,omitempty"`
	ShootsCatches string       `json:"shootsCatches,omitempty"` // "L" or "R"
	Stats         *PlayerStats `json:"stats"`
}

// RosterPlayer is the parsed shape we get from the NHL roster/prospects endpoints.
// Keep it as a single struct so parsing is consistent across callers.
type RosterPlayer struct {
	ID            int               `json:"id"`
	Headshot      string            `json:"headshot"`
	FirstName     map[string]string `json:"firstName"`
	LastName      map[string]string `json:"lastName"`
	SweaterNumber int               `json:"sweaterNumber"`
	PositionCode  string            `json:"positionCode"`
	ShootsCatches string            `json:"shootsCatches"`
}

// pickName returns the best available name from localized name fields.
// It prefers the "default" key, then returns any other language if default is absent.
func pickName(nameMap map[string]string) string {
	if nameMap == nil {
		return ""
	}
	if v, ok := nameMap["default"]; ok && v != "" {
		return v
	}
	for _, v := range nameMap {
		if v != "" {
			return v
		}
	}
	return ""
}

// PlayerStats represents player statistics
type PlayerStats struct {
	Games          int     `json:"games"`
	Goals          int     `json:"goals"`
	Assists        int     `json:"assists"`
	Points         int     `json:"points"`
	GamesStarted   int     `json:"gamesStarted"`
	Wins           int     `json:"wins"`
	Losses         int     `json:"losses"`
	GoalsAgainst   int     `json:"goalsAgainst"`
	GAA            float64 `json:"gaa"`
	SavePercentage float64 `json:"savePercentage"`
	PlusMinus      int     `json:"plusMinus"`
	PIM            int     `json:"pim"`
	Shots          int     `json:"shots"`
}

// TeamsResponse is the API response for teams endpoint
type TeamsResponse struct {
	Teams              []Team    `json:"teams"`
	StandingsAvailable bool      `json:"standingsAvailable"`
	RegularSeasonStart string    `json:"regularSeasonStart,omitempty"`
	AsOf               string    `json:"asOf,omitempty"`
	Season             int       `json:"season,omitempty"`
	UpdatedAt          time.Time `json:"updatedAt"`
	Stale              bool      `json:"stale"`
}

// TeamDetailsResponse is the API response for team details
type TeamDetailsResponse struct {
	Teams []TeamDetails `json:"teams"`
}

// RosterResponse contains roster information
type RosterResponse struct {
	GameType  int          `json:"gameType"`
	Players   []PlayerInfo `json:"players"`
	Season    int          `json:"season,omitempty"`
	UpdatedAt time.Time    `json:"updatedAt"`
	Stale     bool         `json:"stale"`
}

// WriteJSON writes the response as JSON
func (tr *TeamsResponse) WriteJSON(w io.Writer) error {
	return json.NewEncoder(w).Encode(tr)
}

// WriteJSON writes the response as JSON
func (td *TeamDetailsResponse) WriteJSON(w io.Writer) error {
	return json.NewEncoder(w).Encode(td)
}

// WriteJSON writes the response as JSON
func (r *RosterResponse) WriteJSON(w io.Writer) error {
	return json.NewEncoder(w).Encode(r)
}
