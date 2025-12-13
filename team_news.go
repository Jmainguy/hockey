package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// simple in-memory cache for team news
var teamNewsCache = struct {
	sync.RWMutex
	m map[string]cacheEntry
}{m: map[string]cacheEntry{}}

// separate cache for transactions
var teamTransactionsCache = struct {
	sync.RWMutex
	m map[string]cacheEntry
}{m: map[string]cacheEntry{}}

type cacheEntry struct {
	resp interface{}
	ts   time.Time
}

// cache TTL
const teamNewsTTL = 2 * time.Minute

type TeamNewsStory struct {
	Title       string      `json:"title"`
	ContentDate string      `json:"contentDate"`
	Thumbnail   string      `json:"thumbnail"`
	Url         string      `json:"url"`
	Parts       []StoryPart `json:"parts"`
}

type StoryPart struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

type TeamNewsResponse struct {
	Stories []TeamNewsStory `json:"stories"`
}

// handleAPITeamNews fetches the last 10 news stories for a team and follows selfUrl for full content
func handleAPITeamNews(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamId := vars["teamId"]
	// Accept either numeric team ID or 3-letter abbreviation; map abbrev -> id for Forge tags
	if _, err := strconv.Atoi(teamId); err != nil {
		if id, ok := abbrevToTeamID[strings.ToUpper(teamId)]; ok {
			teamId = strconv.Itoa(id)
		}
	}
	// Check cache first
	teamNewsCache.RLock()
	if e, ok := teamNewsCache.m[teamId]; ok {
		if time.Since(e.ts) < teamNewsTTL {
			teamNewsCache.RUnlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(e.resp)
			return
		}
	}
	teamNewsCache.RUnlock()

	// Build the Forge DAPI URL for team news
	apiUrl := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%s&$limit=10", teamId)
	resp, err := http.Get(apiUrl)
	if err != nil {
		http.Error(w, "Failed to fetch team news", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// If upstream rate-limits us, return cached response if available
	if resp.StatusCode == http.StatusTooManyRequests {
		teamNewsCache.RLock()
		if e, ok := teamNewsCache.m[teamId]; ok {
			if time.Since(e.ts) < 10*teamNewsTTL {
				teamNewsCache.RUnlock()
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(e.resp)
				return
			}
		}
		teamNewsCache.RUnlock()
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
			SelfUrl string `json:"selfUrl"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		http.Error(w, "Failed to decode team news", http.StatusBadGateway)
		return
	}

	stories := make([]TeamNewsStory, 0, len(apiResp.Items))
	for _, item := range apiResp.Items {
		story := TeamNewsStory{
			Title:       item.Title,
			ContentDate: item.ContentDate,
			Thumbnail:   item.Thumbnail.ThumbnailURL,
			Url:         item.SelfUrl,
			Parts:       []StoryPart{},
		}
		// Fetch full content from selfUrl and parse parts
		if item.SelfUrl != "" {
			if storyResp, err := http.Get(item.SelfUrl); err == nil {
				defer storyResp.Body.Close()

				var full struct {
					Parts []struct {
						Type    string      `json:"type"`
						Content interface{} `json:"content"`
						Image   struct {
							TemplateURL  string `json:"templateUrl"`
							ThumbnailURL string `json:"thumbnailUrl"`
						} `json:"image"`
					} `json:"parts"`
					Fields struct {
						Description string `json:"description"`
					} `json:"fields"`
				}
				if err := json.NewDecoder(storyResp.Body).Decode(&full); err == nil {
					// Use fields.description as fallback first part
					if full.Fields.Description != "" {
						story.Parts = append(story.Parts, StoryPart{Type: "markdown", Content: full.Fields.Description})
					}
					for _, p := range full.Parts {
						switch p.Type {
						case "html", "markdown", "text":
							// content may be string or object; convert to string
							var s string
							switch c := p.Content.(type) {
							case string:
								s = c
							default:
								// try marshal back to string
								if b, err := json.Marshal(c); err == nil {
									s = string(b)
								}
							}
							story.Parts = append(story.Parts, StoryPart{Type: "markdown", Content: s})
						case "image":
							// use provided image fields
							imgURL := p.Image.TemplateURL
							if imgURL == "" {
								imgURL = p.Image.ThumbnailURL
							}
							if imgURL != "" {
								story.Parts = append(story.Parts, StoryPart{Type: "image", Content: imgURL})
							}
						case "video":
							// video content may be structured; attempt to extract a url
							var s string
							switch c := p.Content.(type) {
							case string:
								s = c
							default:
								if b, err := json.Marshal(c); err == nil {
									s = string(b)
								}
							}
							story.Parts = append(story.Parts, StoryPart{Type: "video", Content: s})
						default:
							// unknown type, stringify
							if b, err := json.Marshal(p.Content); err == nil {
								story.Parts = append(story.Parts, StoryPart{Type: "markdown", Content: string(b)})
							}
						}
					}
				}
			}
		}
		stories = append(stories, story)
	}

	respObj := TeamNewsResponse{Stories: stories}

	// Cache successful response
	teamNewsCache.Lock()
	teamNewsCache.m[teamId] = cacheEntry{resp: respObj, ts: time.Now()}
	teamNewsCache.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(respObj)
}

// handleAPITeamTransactions fetches recent transactions for a team (basic implementation)
func handleAPITeamTransactions(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	teamId := vars["teamId"]

	// Accept either numeric team ID or 3-letter abbreviation; map abbrev -> id for Forge tags
	if _, err := strconv.Atoi(teamId); err != nil {
		if id, ok := abbrevToTeamID[strings.ToUpper(teamId)]; ok {
			teamId = strconv.Itoa(id)
		}
	}

	// Check cache first
	teamTransactionsCache.RLock()
	if e, ok := teamTransactionsCache.m[teamId]; ok {
		if time.Since(e.ts) < teamNewsTTL {
			teamTransactionsCache.RUnlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(e.resp)
			return
		}
	}
	teamTransactionsCache.RUnlock()

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
		SelfUrl string `json:"selfUrl"`
		Fields  struct {
			Description string `json:"description"`
		} `json:"fields"`
	}{}

	for page := 0; page < maxPages; page++ {
		// Do not restrict by season tag; fetch transactions broadly and paginate until we have enough
		apiUrl := fmt.Sprintf("https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-%s&tags.slug=transactions&$limit=%d&$skip=%d", teamId, pageSize, skip)
		resp, err := http.Get(apiUrl)
		if err != nil {
			http.Error(w, "Failed to fetch transactions", http.StatusBadGateway)
			return
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			// If upstream rate-limits, return cached if available
			resp.Body.Close()
			teamTransactionsCache.RLock()
			if e, ok := teamTransactionsCache.m[teamId]; ok {
				// respect cached TTL
				if time.Since(e.ts) < 10*teamNewsTTL {
					teamTransactionsCache.RUnlock()
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(e.resp)
					return
				}
			}
			teamTransactionsCache.RUnlock()
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
				SelfUrl string `json:"selfUrl"`
				Fields  struct {
					Description string `json:"description"`
				} `json:"fields"`
			} `json:"items"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&pageResp); err != nil {
			resp.Body.Close()
			http.Error(w, "Failed to decode transactions", http.StatusBadGateway)
			return
		}
		resp.Body.Close()

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
		Url        string    `json:"url"`
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
			Url:        it.SelfUrl,
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

	// Cache successful response
	teamTransactionsCache.Lock()
	teamTransactionsCache.m[teamId] = cacheEntry{resp: respObj, ts: time.Now()}
	teamTransactionsCache.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(respObj)
}
