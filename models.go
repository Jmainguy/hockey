package main

import (
	"encoding/json"
	"io"
)

// Team represents an NHL team
type Team struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Abbrev     string `json:"abbrev"`
	Link       string `json:"link"`
	Conference string `json:"conference"`
	Division   string `json:"division"`
	Record     struct {
		Wins           int `json:"wins"`
		Losses         int `json:"losses"`
		OvertimeLosses int `json:"overtimeLosses"`
		Points         int `json:"points"`
	} `json:"record"`
	GamesPlayed  int     `json:"gamesPlayed,omitempty"`
	GoalsFor     int     `json:"goalsFor,omitempty"`
	GoalsAgainst int     `json:"goalsAgainst,omitempty"`
	GoalDiff     int     `json:"goalDiff,omitempty"`
	LastTen      string  `json:"lastTen,omitempty"`
	Streak       string  `json:"streak,omitempty"`
	WinPct       float64 `json:"winPct,omitempty"`
}

// TeamDetails contains detailed team information
type TeamDetails struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	TeamName     string `json:"teamName"`
	LocationName string `json:"locationName"`
	Abbreviation string `json:"abbreviation"`
	WordmarkURL  string `json:"wordmarkUrl,omitempty"`
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

// PlayerStats represents player statistics
type PlayerStats struct {
	Games          int     `json:"games,omitempty"`
	Goals          int     `json:"goals,omitempty"`
	Assists        int     `json:"assists,omitempty"`
	Points         int     `json:"points,omitempty"`
	GamesStarted   int     `json:"gamesStarted,omitempty"`
	Wins           int     `json:"wins,omitempty"`
	Losses         int     `json:"losses,omitempty"`
	GoalsAgainst   int     `json:"goalsAgainst,omitempty"`
	GAA            float64 `json:"gaa,omitempty"`
	SavePercentage float64 `json:"savePercentage,omitempty"`
	PlusMinus      int     `json:"plusMinus,omitempty"`
	PIM            int     `json:"pim,omitempty"`
	Shots          int     `json:"shots,omitempty"`
}

// TeamsResponse is the API response for teams endpoint
type TeamsResponse struct {
	Teams []Team `json:"teams"`
}

// TeamDetailsResponse is the API response for team details
type TeamDetailsResponse struct {
	Teams []TeamDetails `json:"teams"`
}

// RosterResponse contains roster information
type RosterResponse struct {
	Players []PlayerInfo `json:"players"`
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
