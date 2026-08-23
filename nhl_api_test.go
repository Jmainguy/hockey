package main

import (
	"testing"
	"time"
)

func TestSeasonIDAt(t *testing.T) {
	tests := []struct {
		name string
		date time.Time
		want string
	}{
		{name: "before league year rollover", date: time.Date(2026, time.June, 30, 23, 59, 59, 0, time.UTC), want: "20252026"},
		{name: "league year rollover", date: time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC), want: "20262027"},
		{name: "August offseason", date: time.Date(2026, time.August, 23, 0, 0, 0, 0, time.UTC), want: "20262027"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := seasonIDAt(tt.date); got != tt.want {
				t.Fatalf("seasonIDAt(%s) = %s, want %s", tt.date, got, tt.want)
			}
		})
	}
}
