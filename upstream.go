package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"
)

const cacheNamespace = "hockey:v2:"
const maxCacheEntries = 2048

type cacheEntry struct {
	Data       json.RawMessage `json:"data"`
	UpdatedAt  time.Time       `json:"updatedAt"`
	FreshUntil time.Time       `json:"freshUntil"`
	ExpiresAt  time.Time       `json:"expiresAt"`
}
type fetchCall struct {
	done  chan struct{}
	entry cacheEntry
	err   error
}
type upstreamClient struct {
	mu       sync.Mutex
	entries  map[string]cacheEntry
	calls    map[string]*fetchCall
	failures map[string]time.Time
	cooldown time.Time
	client   *http.Client
	limiter  *rate.Limiter
	redis    *redis.Client
}

func newUpstreamClient() *upstreamClient {
	return &upstreamClient{entries: make(map[string]cacheEntry), calls: make(map[string]*fetchCall), failures: make(map[string]time.Time), client: &http.Client{Timeout: 6 * time.Second}, limiter: rate.NewLimiter(2, 1)}
}

var upstream = newUpstreamClient()

func init() {
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		upstream.redis = redis.NewClient(&redis.Options{Addr: addr, DialTimeout: 300 * time.Millisecond, ReadTimeout: 300 * time.Millisecond, WriteTimeout: 300 * time.Millisecond, MaxRetries: -1})
	}
	if base := os.Getenv("NHL_API_BASE_URL"); base != "" {
		BaseURL = strings.TrimRight(base, "/")
	}
}
func redisKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return cacheNamespace + hex.EncodeToString(hash[:])
}
func (c *upstreamClient) cached(key string) (cacheEntry, bool) {
	c.mu.Lock()
	e, ok := c.entries[key]
	c.mu.Unlock()
	if ok && time.Now().Before(e.ExpiresAt) {
		return e, true
	}
	if c.redis != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
		defer cancel()
		data, err := c.redis.Get(ctx, redisKey(key)).Bytes()
		if err == nil && json.Unmarshal(data, &e) == nil && time.Now().Before(e.ExpiresAt) {
			c.remember(key, e)
			return e, true
		}
	}
	return cacheEntry{}, false
}
func (c *upstreamClient) remember(key string, e cacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= maxCacheEntries {
		for k, v := range c.entries {
			if time.Now().After(v.ExpiresAt) {
				delete(c.entries, k)
			}
		}
		if len(c.entries) >= maxCacheEntries {
			for k := range c.entries {
				delete(c.entries, k)
				break
			}
		}
	}
	c.entries[key] = e
}
func (c *upstreamClient) save(key string, data []byte, ttl time.Duration) cacheEntry {
	now := time.Now()
	e := cacheEntry{Data: append([]byte(nil), data...), UpdatedAt: now, FreshUntil: now.Add(ttl), ExpiresAt: now.Add(7 * 24 * time.Hour)}
	c.remember(key, e)
	if c.redis != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
		defer cancel()
		b, _ := json.Marshal(e)
		_ = c.redis.Set(ctx, redisKey(key), b, 7*24*time.Hour).Err()
	}
	return e
}

// get serves stale data immediately while one bounded refresh runs. Cold misses
// share one request; callers may cancel their wait without canceling others.
func (c *upstreamClient) get(ctx context.Context, url string) (cacheEntry, error) {
	cached, ok := c.cached(url)
	if ok && time.Now().Before(cached.FreshUntil) {
		return cached, nil
	}
	c.mu.Lock()
	call, running := c.calls[url]
	if !running {
		if time.Now().Before(c.cooldown) || time.Now().Before(c.failures[url]) {
			c.mu.Unlock()
			if ok {
				return cached, nil
			}
			return cacheEntry{}, errors.New("hockey data is temporarily unavailable")
		}
		call = &fetchCall{done: make(chan struct{})}
		c.calls[url] = call
		go func() {
			fetchCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			defer cancel()
			call.entry, call.err = c.fetch(fetchCtx, url)
			if call.err != nil {
				log.Printf("Upstream fetch failed (%s): %v", url, call.err)
			}
			c.mu.Lock()
			delete(c.calls, url)
			if call.err != nil {
				if len(c.failures) >= maxCacheEntries {
					clear(c.failures)
				}
				c.failures[url] = time.Now().Add(time.Minute)
			} else {
				delete(c.failures, url)
			}
			close(call.done)
			c.mu.Unlock()
		}()
	}
	c.mu.Unlock()
	if ok {
		return cached, nil
	}
	select {
	case <-ctx.Done():
		return cacheEntry{}, ctx.Err()
	case <-call.done:
		return call.entry, call.err
	}
}
func (c *upstreamClient) fetch(ctx context.Context, url string) (cacheEntry, error) {
	// A distributed lease prevents different replicas from duplicating a fetch.
	if c.redis != nil {
		tokenBytes := make([]byte, 16)
		_, _ = rand.Read(tokenBytes)
		token := hex.EncodeToString(tokenBytes)
		lock := redisKey(url) + ":lock"
		owned, err := c.redis.SetNX(ctx, lock, token, 12*time.Second).Result()
		if err != nil {
			return cacheEntry{}, errors.New("shared cache temporarily unavailable")
		}
		if !owned {
			ticker := time.NewTicker(100 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return cacheEntry{}, ctx.Err()
				case <-ticker.C:
					if e, ok := c.cached(url); ok && time.Now().Before(e.FreshUntil) {
						return e, nil
					}
				}
			}
		}
		defer func() {
			releaseCtx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
			defer cancel()
			_ = c.redis.Eval(releaseCtx, `if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0`, []string{lock}, token).Err()
		}()
		// Another replica may have populated the entry while we acquired the lease.
		if e, ok := c.cached(url); ok && time.Now().Before(e.FreshUntil) {
			return e, nil
		}
	}
	if err := c.limiter.Wait(ctx); err != nil {
		return cacheEntry{}, err
	}
	c.mu.Lock()
	cooling := time.Now().Before(c.cooldown)
	c.mu.Unlock()
	if cooling {
		return cacheEntry{}, errors.New("upstream cooldown")
	}
	if c.redis != nil {
		blocked, err := c.redis.Exists(ctx, cacheNamespace+"cooldown").Result()
		if err != nil || blocked > 0 {
			return cacheEntry{}, errors.New("upstream cooldown")
		}
		// A cluster-wide fixed window caps aggregate traffic, not per-pod traffic.
		for {
			key := cacheNamespace + "budget:" + strconv.FormatInt(time.Now().Unix(), 10)
			count, err := c.redis.Eval(ctx, `local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],2) end; return n`, []string{key}).Int()
			if err != nil {
				return cacheEntry{}, err
			}
			if count <= 2 {
				break
			}
			select {
			case <-ctx.Done():
				return cacheEntry{}, ctx.Err()
			case <-time.After(250 * time.Millisecond):
			}
		}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return cacheEntry{}, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return cacheEntry{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == 429 || resp.StatusCode == 503 {
		delay := time.Minute
		if secs, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && secs > 0 {
			delay = time.Duration(secs) * time.Second
		} else if when, err := http.ParseTime(resp.Header.Get("Retry-After")); err == nil && time.Until(when) > 0 {
			delay = time.Until(when)
		}
		if delay > time.Hour {
			delay = time.Hour
		}
		c.mu.Lock()
		c.cooldown = time.Now().Add(delay)
		c.mu.Unlock()
		if c.redis != nil {
			_ = c.redis.Set(ctx, cacheNamespace+"cooldown", "1", delay).Err()
		}
		log.Printf("NHL cooldown: status=%d duration=%s", resp.StatusCode, delay)
	}
	if resp.StatusCode != 200 {
		return cacheEntry{}, fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return cacheEntry{}, err
	}
	if !json.Valid(data) {
		return cacheEntry{}, errors.New("invalid upstream JSON")
	}
	if err := validateResource(url, data); err != nil {
		return cacheEntry{}, err
	}
	// Preserve a useful standings snapshot if an offseason refresh turns empty.
	if strings.Contains(url, "/standings/") && !hasNonEmptyStandingsJSON(data) {
		if old, ok := c.cached(url); ok && hasNonEmptyStandingsJSON(old.Data) {
			return cacheEntry{}, errors.New("empty standings refresh; keeping last snapshot")
		}
	}
	return c.save(url, data, resourceTTL(url, data)), nil
}
func resourceTTL(url string, data []byte) time.Duration {
	switch {
	case strings.Contains(url, "/gamecenter/"):
		var g struct {
			GameState string `json:"gameState"`
		}
		_ = json.Unmarshal(data, &g)
		if g.GameState == "OFF" || g.GameState == "FINAL" {
			return 24 * time.Hour
		}
		return 20 * time.Second
	case strings.Contains(url, "/schedule/") || strings.Contains(url, "/club-schedule"):
		if scheduleHasLiveGame(data) {
			return 20 * time.Second
		}
		return 2 * time.Minute
	case strings.Contains(url, "/standings/"):
		return 15 * time.Minute
	case strings.Contains(url, "/roster/") || strings.Contains(url, "/prospects/"):
		return time.Hour
	default:
		return 15 * time.Minute
	}
}
func scheduleHasLiveGame(data []byte) bool {
	var s struct {
		GameWeek []struct {
			Games []struct {
				State string `json:"gameState"`
			} `json:"games"`
		} `json:"gameWeek"`
	}
	if json.Unmarshal(data, &s) != nil {
		return false
	}
	for _, day := range s.GameWeek {
		for _, g := range day.Games {
			if g.State == "LIVE" || g.State == "CRIT" {
				return true
			}
		}
	}
	return false
}

// Successful HTTP responses can still contain error documents. Only replace
// known-good snapshots when the resource's essential shape is present.
func validateResource(url string, data []byte) error {
	if strings.Contains(url, "/roster-season/") {
		var seasons []int
		return json.Unmarshal(data, &seasons)
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(data, &object) != nil || object == nil {
		return errors.New("invalid upstream object")
	}
	field := ""
	switch {
	case strings.Contains(url, "/standings/"):
		field = "standings"
	case strings.Contains(url, "/schedule/") && !strings.Contains(url, "playoff-series"):
		field = "gameWeek"
	case strings.Contains(url, "/player/"):
		field = "playerId"
	case strings.Contains(url, "/gamecenter/"):
		field = "id"
	case strings.Contains(url, "/club-stats/"):
		field = "season"
	case strings.Contains(url, "/club-schedule"):
		field = "games"
	case strings.Contains(url, "/roster/"):
		field = "forwards"
	}
	if field != "" {
		value, ok := object[field]
		if !ok || string(value) == "null" {
			return fmt.Errorf("upstream payload missing %s", field)
		}
	}
	return nil
}
