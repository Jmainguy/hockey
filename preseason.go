package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

type preseasonGame struct {
	ID     int    `json:"id"`
	Season int    `json:"season"`
	Type   int    `json:"gameType"`
	State  string `json:"gameState"`
	Home   struct {
		Abbrev string `json:"abbrev"`
		Score  int    `json:"score"`
	} `json:"homeTeam"`
	Away struct {
		Abbrev string `json:"abbrev"`
		Score  int    `json:"score"`
	} `json:"awayTeam"`
	Outcome struct {
		Period string `json:"lastPeriodType"`
	} `json:"gameOutcome"`
	Period struct {
		Type string `json:"periodType"`
	} `json:"periodDescriptor"`
}

func preseasonRecords(games []preseasonGame, season int, historical ...*TeamsResponse) *TeamsResponse {
	out := catalogResponse()
	if len(historical) > 0 {
		out = historical[0]
		for i := range out.Teams {
			old := out.Teams[i]
			out.Teams[i] = Team{ID: old.ID, Abbrev: old.Abbrev, Name: old.Name, Conference: old.Conference, Division: old.Division}
		}
	}
	out.Season = season
	out.StandingsAvailable = true
	teams := map[string]*Team{}
	for i := range out.Teams {
		teams[out.Teams[i].Abbrev] = &out.Teams[i]
	}
	seen := map[int]bool{}
	for _, g := range games {
		if g.Type != 1 || g.Season != season || (g.State != "OFF" && g.State != "FINAL") || seen[g.ID] || g.Home.Score == g.Away.Score {
			continue
		}
		seen[g.ID] = true
		home, away := teams[g.Home.Abbrev], teams[g.Away.Abbrev]
		if home == nil || away == nil {
			continue
		}
		home.GamesPlayed++
		away.GamesPlayed++
		home.GoalsFor += g.Home.Score
		home.GoalsAgainst += g.Away.Score
		away.GoalsFor += g.Away.Score
		away.GoalsAgainst += g.Home.Score
		winner, loser := home, away
		if g.Away.Score > g.Home.Score {
			winner, loser = away, home
		}
		winner.Record.Wins++
		winner.Record.Points += 2
		if g.Outcome.Period == "OT" || g.Outcome.Period == "SO" || g.Period.Type == "OT" || g.Period.Type == "SO" {
			loser.Record.OvertimeLosses++
			loser.Record.Points++
		} else {
			loser.Record.Losses++
		}
	}
	for i := range out.Teams {
		t := &out.Teams[i]
		t.GoalDiff = t.GoalsFor - t.GoalsAgainst
		if t.GamesPlayed > 0 {
			t.WinPct = float64(t.Record.Wins) / float64(t.GamesPlayed)
			t.PointPctg = float64(t.Record.Points) / float64(2*t.GamesPlayed)
		}
	}
	sort.Slice(out.Teams, func(i, j int) bool {
		a, b := out.Teams[i], out.Teams[j]
		if a.Record.Points != b.Record.Points {
			return a.Record.Points > b.Record.Points
		}
		if a.Record.Wins != b.Record.Wins {
			return a.Record.Wins > b.Record.Wins
		}
		if a.GoalDiff != b.GoalDiff {
			return a.GoalDiff > b.GoalDiff
		}
		return a.Name < b.Name
	})
	conferences, divisions := map[string]int{}, map[string]int{}
	for i := range out.Teams {
		t := &out.Teams[i]
		conferences[t.Conference]++
		divisions[t.Division]++
		t.Rank = i + 1
		t.ConferenceRank = conferences[t.Conference]
		t.DivisionRank = divisions[t.Division]
	}
	return out
}
func getPreseason(ctx context.Context, season int, end string, standingsEnd string) (*TeamsResponse, error) {
	start := time.Date(season/10000, 9, 1, 0, 0, 0, 0, time.UTC)
	stop, err := time.Parse("2006-01-02", end)
	if err != nil {
		return nil, err
	}
	// Lockout/pandemic seasons may start in January without a preseason.
	capDate := time.Date(season/10000, 11, 1, 0, 0, 0, 0, time.UTC)
	if stop.After(capDate) {
		stop = capDate
	}
	today := time.Now().UTC()
	if today.Before(stop) {
		stop = today
	}
	var historical *TeamsResponse
	if fmt.Sprint(season) != currentSeasonID() {
		e, err := upstream.get(ctx, BaseURL+"/standings/"+standingsEnd)
		if err != nil {
			return nil, err
		}
		historical, err = parseStandings(e.Data)
		if err != nil {
			return nil, err
		}
		if !historical.StandingsAvailable {
			return nil, fmt.Errorf("historical teams unavailable")
		}
	}
	games := []preseasonGame{}
	var oldest time.Time
	stale := false
	for date := start; !date.After(stop); date = date.AddDate(0, 0, 7) {
		e, err := upstream.get(ctx, fmt.Sprintf("%s/schedule/%s", BaseURL, date.Format("2006-01-02")))
		if err != nil {
			return nil, err
		}
		var week struct {
			Days []struct {
				Games []preseasonGame `json:"games"`
			} `json:"gameWeek"`
		}
		if err = json.Unmarshal(e.Data, &week); err != nil {
			return nil, err
		}
		for _, day := range week.Days {
			games = append(games, day.Games...)
		}
		if oldest.IsZero() || e.UpdatedAt.Before(oldest) {
			oldest = e.UpdatedAt
		}
		stale = stale || time.Now().After(e.FreshUntil)
	}
	var out *TeamsResponse
	if historical != nil {
		out = preseasonRecords(games, season, historical)
	} else {
		out = preseasonRecords(games, season)
	}
	played := 0
	for _, team := range out.Teams {
		played += team.GamesPlayed
	}
	out.StandingsAvailable = played > 0
	out.UpdatedAt = oldest
	out.Stale = stale
	return out, nil
}
