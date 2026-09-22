package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type standingsSeasonList struct {
	CurrentDate string `json:"currentDate"`
	Seasons     []struct {
		ID          int    `json:"id"`
		End         string `json:"standingsEnd"`
		Start       string `json:"standingsStart"`
		DefaultView string `json:"defaultView"`
	} `json:"seasons"`
}

func standingsSeasons(ctx context.Context) (standingsSeasonList, error) {
	var result standingsSeasonList
	e, err := upstream.get(ctx, BaseURL+"/standings-season")
	if err != nil {
		return result, err
	}
	err = json.Unmarshal(e.Data, &result)
	filtered := result.Seasons[:0]
	for _, season := range result.Seasons {
		today := time.Now().UTC().Format("2006-01-02")
		if season.Start <= result.CurrentDate || (today >= fmt.Sprintf("%d-09-01", season.ID/10000) && today <= season.End) {
			season.DefaultView = "regular"
			if today < season.Start {
				season.DefaultView = "preseason"
			}
			filtered = append(filtered, season)
		}
	}
	result.Seasons = filtered
	return result, err
}
func handleStandingsSeasons(w http.ResponseWriter, r *http.Request) {
	data, err := standingsSeasons(r.Context())
	if err != nil {
		dataUnavailable(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(data)
}
