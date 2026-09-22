package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type boxPlayer struct {
	ID        int    `json:"playerId"`
	Goals     int    `json:"goals"`
	Assists   int    `json:"assists"`
	Points    int    `json:"points"`
	PlusMinus int    `json:"plusMinus"`
	TOI       string `json:"toi"`
	Saves     int    `json:"saves"`
	Shots     int    `json:"shotsAgainst"`
	Against   int    `json:"goalsAgainst"`
	Decision  string `json:"decision"`
}
type boxPlayers struct {
	Forwards []boxPlayer `json:"forwards"`
	Defense  []boxPlayer `json:"defense"`
	Goalies  []boxPlayer `json:"goalies"`
}

func preseasonPlayerStats(ctx context.Context, abbr, season string, players []PlayerInfo) error {
	e, err := upstream.get(ctx, BaseURL+"/club-schedule-season/"+abbr+"/"+season)
	if err != nil {
		return err
	}
	var schedule struct {
		Games []preseasonGame `json:"games"`
	}
	if err = json.Unmarshal(e.Data, &schedule); err != nil {
		return err
	}
	stats := map[int]*PlayerStats{}
	seconds, saves, shots, against := map[int]int{}, map[int]int{}, map[int]int{}, map[int]int{}
	seen := map[int]bool{}
	for _, game := range schedule.Games {
		if game.Type != 1 || (game.State != "OFF" && game.State != "FINAL") || seen[game.ID] {
			continue
		}
		seen[game.ID] = true
		entry, err := upstream.get(ctx, fmt.Sprintf("%s/gamecenter/%d/boxscore", BaseURL, game.ID))
		if err != nil {
			return err
		}
		var box struct {
			Players struct {
				Home boxPlayers `json:"homeTeam"`
				Away boxPlayers `json:"awayTeam"`
			} `json:"playerByGameStats"`
		}
		if err = json.Unmarshal(entry.Data, &box); err != nil {
			return err
		}
		group := box.Players.Away
		if strings.EqualFold(game.Home.Abbrev, abbr) {
			group = box.Players.Home
		}
		for _, p := range append(append(group.Forwards, group.Defense...), group.Goalies...) {
			var m, s int
			if _, err := fmt.Sscanf(p.TOI, "%d:%d", &m, &s); err != nil {
				continue
			}
			if m*60+s == 0 {
				continue
			}
			if stats[p.ID] == nil {
				stats[p.ID] = &PlayerStats{}
			}
			v := stats[p.ID]
			v.Games++
			v.Goals += p.Goals
			v.Assists += p.Assists
			v.Points += p.Points
			v.PlusMinus += p.PlusMinus
			if p.Decision == "W" {
				v.Wins++
			}
			if p.Decision == "L" || p.Decision == "O" {
				v.Losses++
			}
			seconds[p.ID] += m*60 + s
			saves[p.ID] += p.Saves
			shots[p.ID] += p.Shots
			against[p.ID] += p.Against
		}
	}
	for i := range players {
		p := &players[i]
		p.Stats = stats[p.ID]
		if p.Stats != nil && p.Position == "G" {
			if shots[p.ID] > 0 {
				p.Stats.SavePercentage = float64(saves[p.ID]) / float64(shots[p.ID])
			}
			if seconds[p.ID] > 0 {
				p.Stats.GAA = float64(against[p.ID]) * 3600 / float64(seconds[p.ID])
			}
		}
	}
	return nil
}
