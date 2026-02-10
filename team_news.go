package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// TeamNewsStory represents a summary of a single team news story.
type TeamNewsStory struct {
	Title       string `json:"title"`
	ContentDate string `json:"contentDate"`
	Thumbnail   string `json:"thumbnail"`
	URL         string `json:"url"`
}

// StoryPart is a fragment of article content returned by the Forge DAPI.
type StoryPart struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

// TeamNewsResponse is the minimal response returned by our team news endpoint.
type TeamNewsResponse struct {
	Stories []TeamNewsStory `json:"stories"`
}

// handleAPITeamNews fetches the last 10 news stories for a team and follows selfUrl for full content
func handleAPITeamNews(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]
	// Accept either numeric team ID or 3-letter abbreviation; map abbrev -> id for Forge tags
	if _, err := strconv.Atoi(teamID); err != nil {
		if id, ok := abbrevToTeamID[strings.ToUpper(teamID)]; ok {
			teamID = strconv.Itoa(id)
		}
	}

	cacheKey := fmt.Sprintf("team-news:%s", teamID)

	// Build the Forge DAPI URL for team news
	apiURL := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%s&$limit=10", teamID)
	resp, err := rateLimitedGet(apiURL)
	if err != nil {
		http.Error(w, "Failed to fetch team news", http.StatusBadGateway)
		return
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			fmt.Printf("warning: closing team news resp body: %v\n", cerr)
		}
	}()

	// If upstream rate-limits us, try Redis
	if resp.StatusCode == http.StatusTooManyRequests {
		cachedData, cacheErr := getCachedRaw(cacheKey)
		if cacheErr == nil {
			fmt.Printf("Upstream 429 for team news %s, using Redis cache\n", teamID)
			w.Header().Set("Content-Type", "application/json")
			if _, writeErr := w.Write(cachedData); writeErr != nil {
				fmt.Printf("error writing cached team news response: %v\n", writeErr)
				http.Error(w, "Encoding error", http.StatusInternalServerError)
			}
			return
		}
		fmt.Printf("No cached team news for %s in Redis: %v\n", teamID, cacheErr)
		http.Error(w, "Upstream rate limited", http.StatusBadGateway)
		return
	}

	var apiResp struct {
		Items []struct {
			Title       string `json:"title"`
			ContentDate string `json:"contentDate"`
			Thumbnail   struct {
				ThumbnailURL string `json:"thumbnailUrl"`
			} `json:"thumbnail"`
			SelfURL string `json:"selfUrl"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		http.Error(w, "Failed to decode team news", http.StatusBadGateway)
		return
	}

	stories := make([]TeamNewsStory, 0, len(apiResp.Items))
	for _, item := range apiResp.Items {
		// Only return summary fields (title, date, thumbnail, url). Full content is on nhl.com.
		story := TeamNewsStory{
			Title:       item.Title,
			ContentDate: item.ContentDate,
			Thumbnail:   item.Thumbnail.ThumbnailURL,
			URL:         item.SelfURL,
		}
		stories = append(stories, story)
	}

	respObj := TeamNewsResponse{Stories: stories}

	// Cache successful response in Redis
	if cacheData, jsonErr := json.Marshal(respObj); jsonErr == nil {
		if setErr := setCachedRaw(cacheKey, cacheData, time.Hour); setErr != nil {
			fmt.Printf("Failed to cache team news for %s: %v\n", teamID, setErr)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(respObj); err != nil {
		fmt.Printf("error encoding team news response: %v\n", err)
		http.Error(w, "Encoding error", http.StatusInternalServerError)
		return
	}
}

// handleAPITeamTransactions fetches recent transactions for a team (basic implementation)
func handleAPITeamTransactions(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamID := vars["teamId"]

	// Accept either numeric team ID or 3-letter abbreviation; map abbrev -> id for Forge tags
	if _, err := strconv.Atoi(teamID); err != nil {
		if id, ok := abbrevToTeamID[strings.ToUpper(teamID)]; ok {
			teamID = strconv.Itoa(id)
		}
	}

	cacheKey := fmt.Sprintf("team-transactions:%s", teamID)

	// We'll request stories tagged as transactions and paginate until we have enough items.
	pageSize := 30
	maxPages := 10
	skip := 0
	allItems := []struct {
		Title       string `json:"title"`
		ContentDate string `json:"contentDate"`
		Thumbnail   struct {
			ThumbnailURL string `json:"thumbnailUrl"`
		} `json:"thumbnail"`
		SelfURL string `json:"selfUrl"`
		Fields  struct {
			Description string `json:"description"`
		} `json:"fields"`
	}{}

	for page := 0; page < maxPages; page++ {
		// Do not restrict by season tag; fetch transactions broadly and paginate until we have enough
		apiURL := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%s&tags.slug=transactions&$limit=%d&$skip=%d", teamID, pageSize, skip)
		resp, err := rateLimitedGet(apiURL)
		if err != nil {
			http.Error(w, "Failed to fetch transactions", http.StatusBadGateway)
			return
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			// If upstream rate-limits, try Redis
			if cerr := resp.Body.Close(); cerr != nil {
				fmt.Printf("warning: closing transactions resp body (rate-limited): %v\n", cerr)
			}
			cachedData, cacheErr := getCachedRaw(cacheKey)
			if cacheErr == nil {
				fmt.Printf("Upstream 429 for team transactions %s, using Redis cache\n", teamID)
				w.Header().Set("Content-Type", "application/json")
				if _, writeErr := w.Write(cachedData); writeErr != nil {
					fmt.Printf("error writing cached team transactions response: %v\n", writeErr)
					http.Error(w, "Encoding error", http.StatusInternalServerError)
				}
				return
			}
			fmt.Printf("No cached team transactions for %s in Redis: %v\n", teamID, cacheErr)
			http.Error(w, "Upstream rate limited", http.StatusBadGateway)
			return
		}

		var pageResp struct {
			Items []struct {
				Title       string `json:"title"`
				ContentDate string `json:"contentDate"`
				Thumbnail   struct {
					ThumbnailURL string `json:"thumbnailUrl"`
				} `json:"thumbnail"`
				SelfURL string `json:"selfUrl"`
				Fields  struct {
					Description string `json:"description"`
				} `json:"fields"`
			} `json:"items"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&pageResp); err != nil {
			if cerr := resp.Body.Close(); cerr != nil {
				fmt.Printf("warning: closing transactions resp body after decode error: %v\n", cerr)
			}
			http.Error(w, "Failed to decode transactions", http.StatusBadGateway)
			return
		}
		if cerr := resp.Body.Close(); cerr != nil {
			fmt.Printf("warning: closing transactions resp body: %v\n", cerr)
		}

		if len(pageResp.Items) == 0 {
			break
		}

		allItems = append(allItems, pageResp.Items...)
		// Stop early if we've collected enough items
		if len(allItems) >= 30 {
			break
		}
		if len(pageResp.Items) < pageSize {
			break
		}
		skip += pageSize
	}

	type TxItem struct {
		Title      string    `json:"title"`
		Date       string    `json:"date"`
		Thumbnail  string    `json:"thumbnail"`
		URL        string    `json:"url"`
		Summary    string    `json:"summary"`
		DateParsed time.Time `json:"-"`
	}

	txs := make([]TxItem, 0, len(allItems))
	for _, it := range allItems {
		var dt time.Time
		if it.ContentDate != "" {
			if t, err := time.Parse(time.RFC3339Nano, it.ContentDate); err == nil {
				dt = t
			} else if t, err := time.Parse(time.RFC3339, it.ContentDate); err == nil {
				dt = t
			}
		}
		txs = append(txs, TxItem{
			Title:      it.Title,
			Date:       it.ContentDate,
			Thumbnail:  it.Thumbnail.ThumbnailURL,
			URL:        it.SelfURL,
			Summary:    it.Fields.Description,
			DateParsed: dt,
		})
	}

	// sort by date descending
	if len(txs) > 1 {
		sort.Slice(txs, func(i, j int) bool {
			if txs[i].DateParsed.IsZero() && txs[j].DateParsed.IsZero() {
				return i < j
			}
			if txs[i].DateParsed.IsZero() {
				return false
			}
			if txs[j].DateParsed.IsZero() {
				return true
			}
			return txs[i].DateParsed.After(txs[j].DateParsed)
		})
	}

	// Limit to the most recent 30 transactions
	if len(txs) > 30 {
		txs = txs[:30]
	}

	type TransactionsResponse struct {
		Transactions []TxItem `json:"transactions"`
	}

	respObj := TransactionsResponse{Transactions: txs}

	// Cache successful response in Redis
	if cacheData, jsonErr := json.Marshal(respObj); jsonErr == nil {
		if setErr := setCachedRaw(cacheKey, cacheData, time.Hour); setErr != nil {
			fmt.Printf("Failed to cache team transactions for %s: %v\n", teamID, setErr)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(respObj); err != nil {
		fmt.Printf("error encoding transactions response: %v\n", err)
		http.Error(w, "Encoding error", http.StatusInternalServerError)
		return
	}
}
