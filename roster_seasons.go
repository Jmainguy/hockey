package main

import (
	"encoding/json"
	"github.com/gorilla/mux"
	"net/http"
	"strconv"
	"strings"
)

func handleRosterSeasons(w http.ResponseWriter, r *http.Request) {
	team := strings.ToUpper(mux.Vars(r)["teamId"])
	if _, ok := abbrevToTeamID[team]; !ok {
		http.NotFound(w, r)
		return
	}
	e, err := upstream.get(r.Context(), BaseURL+"/roster-season/"+team)
	if err != nil {
		dataUnavailable(w)
		return
	}
	writeDataHeaders(w, e)
	w.Header().Set("Content-Type", "application/json")
	var seasons []int
	if json.Unmarshal(e.Data, &seasons) != nil {
		dataUnavailable(w)
		return
	}
	current, _ := strconv.Atoi(currentSeasonID())
	found := false
	for _, season := range seasons {
		if season == current {
			found = true
		}
	}
	if !found {
		seasons = append(seasons, current)
	}
	_ = json.NewEncoder(w).Encode(seasons)
}
