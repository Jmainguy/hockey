package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPreseasonBoxscoreStats(t *testing.T) {
	old, base := upstream, BaseURL
	defer func() { upstream = old; BaseURL = base }()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/club-schedule-season/BOS/20262027" {
			w.Write([]byte(`{"games":[{"id":1,"gameType":1,"gameState":"FINAL","homeTeam":{"abbrev":"BOS"}},{"id":1,"gameType":1,"gameState":"FINAL","homeTeam":{"abbrev":"BOS"}},{"id":2,"gameType":1,"gameState":"LIVE"}]}`))
			return
		}
		if r.URL.Path != "/gamecenter/1/boxscore" {
			t.Errorf("unexpected call %s", r.URL.Path)
		}
		w.Write([]byte(`{"id":1,"playerByGameStats":{"homeTeam":{"forwards":[{"playerId":7,"toi":"12:10","goals":1,"assists":2,"points":3}],"goalies":[{"playerId":8,"toi":"30:00","saves":9,"shotsAgainst":10,"goalsAgainst":1,"decision":"W"},{"playerId":9,"toi":"00:00"}]}}}`))
	}))
	defer srv.Close()
	upstream = testClient()
	BaseURL = srv.URL
	players := []PlayerInfo{{ID: 7, Position: "F"}, {ID: 8, Position: "G"}, {ID: 9, Position: "G"}}
	if err := preseasonPlayerStats(context.Background(), "BOS", "20262027", players); err != nil {
		t.Fatal(err)
	}
	if players[0].Stats.Points != 3 || players[0].Stats.Games != 1 {
		t.Fatal("skater totals or dedup failed")
	}
	if players[1].Stats.GAA != 2 || players[1].Stats.SavePercentage != 0.9 || players[1].Stats.Wins != 1 {
		t.Fatal("goalie totals failed")
	}
	if players[2].Stats != nil {
		t.Fatal("backup goalie counted as played")
	}
}
