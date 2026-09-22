package main

import (
	"encoding/json"
	"testing"
)

func TestPreseasonRecordsCountCompletedUniqueExhibitions(t *testing.T) {
	var games []preseasonGame
	err := json.Unmarshal([]byte(`[
 {"id":1,"season":20262027,"gameType":1,"gameState":"OFF","homeTeam":{"abbrev":"CAR","score":3},"awayTeam":{"abbrev":"FLA","score":2},"gameOutcome":{"lastPeriodType":"OT"}},
 {"id":1,"season":20262027,"gameType":1,"gameState":"OFF","homeTeam":{"abbrev":"CAR","score":3},"awayTeam":{"abbrev":"FLA","score":2}},
 {"id":2,"season":20262027,"gameType":1,"gameState":"LIVE","homeTeam":{"abbrev":"CAR","score":1},"awayTeam":{"abbrev":"FLA","score":0}},
 {"id":3,"season":20262027,"gameType":2,"gameState":"OFF","homeTeam":{"abbrev":"CAR","score":8},"awayTeam":{"abbrev":"FLA","score":0}},
 {"id":4,"season":20262027,"gameType":1,"gameState":"FINAL","homeTeam":{"abbrev":"CAR","score":0},"awayTeam":{"abbrev":"FLA","score":4}}
 ]`), &games)
	if err != nil {
		t.Fatal(err)
	}
	data := preseasonRecords(games, 20262027)
	if data.Teams[0].Abbrev != "FLA" {
		t.Fatal("expected Florida to lead by points")
	}
	for _, team := range data.Teams {
		if team.Abbrev == "CAR" && (team.Record.Wins != 1 || team.Record.Losses != 1 || team.Record.Points != 2 || team.GamesPlayed != 2 || team.GoalsFor != 3) {
			t.Fatalf("bad CAR record %+v", team)
		}
		if team.Abbrev == "FLA" && (team.Record.OvertimeLosses != 1 || team.Record.Points != 3) {
			t.Fatalf("bad FLA record %+v", team)
		}
	}
}

func TestHistoricalPreseasonUsesHistoricalTeams(t *testing.T) {
	historical := &TeamsResponse{Teams: []Team{{Abbrev: "ARI", Name: "Arizona Coyotes", Conference: "Western", Division: "Central"}, {Abbrev: "LAK", Name: "Los Angeles Kings", Conference: "Western", Division: "Pacific"}}}
	historical.Teams[0].Record.Wins = 50
	var games []preseasonGame
	_ = json.Unmarshal([]byte(`[{"id":1,"season":20232024,"gameType":1,"gameState":"FINAL","homeTeam":{"abbrev":"ARI","score":3},"awayTeam":{"abbrev":"LAK","score":1}}]`), &games)
	result := preseasonRecords(games, 20232024, historical)
	if len(result.Teams) != 2 || result.Teams[0].Abbrev != "ARI" || result.Teams[0].Record.Wins != 1 {
		t.Fatalf("incorrect historical teams or leaked regular record: %+v", result.Teams)
	}
}
