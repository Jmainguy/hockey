package main

import (
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gorilla/mux"
)

var assetPattern = regexp.MustCompile(`(src|href)="/static/([^"?]+\.(?:css|js))"`)
var titlePattern = regexp.MustCompile(`<title>(.*?)</title>`)

func addPageMetadata(content []byte, r *http.Request) []byte {
	content = assetPattern.ReplaceAllFunc(content, func(match []byte) []byte {
		parts := assetPattern.FindSubmatch(match)
		name := string(parts[2])
		data, err := embeddedFiles.ReadFile("static/" + name)
		if dir := os.Getenv("FRONTEND_DIST_DIR"); dir != "" {
			data, err = os.ReadFile(filepath.Join(dir, name))
		}
		if err != nil {
			return match
		}
		hash := sha256.Sum256(data)
		return []byte(fmt.Sprintf(`%s="/static/%s?v=%x"`, parts[1], name, hash[:6]))
	})
	title := "Barnwide"
	if match := titlePattern.FindSubmatch(content); len(match) > 1 {
		title = string(match[1])
	}
	description := "NHL team rosters, schedules, scores, and player statistics. An independent hockey fan project."
	if team, err := catalogTeamDetails(mux.Vars(r)["teamId"]); err == nil {
		title = team.Teams[0].Name + " | Barnwide"
		if strings.Contains(r.URL.Path, "team-schedule") {
			title = team.Teams[0].Name + " schedule | Barnwide"
		}
		content = titlePattern.ReplaceAll(content, []byte("<title>"+html.EscapeString(title)+"</title>"))
	}
	canonical := "https://barnwide.com" + r.URL.EscapedPath()
	data, _ := json.Marshal(map[string]any{"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": canonical, "description": description, "isPartOf": map[string]string{"@type": "WebSite", "name": "Barnwide", "url": "https://barnwide.com/"}})
	meta := `<meta name="description" content="` + html.EscapeString(description) + `"><link rel="canonical" href="` + html.EscapeString(canonical) + `"><meta property="og:title" content="` + html.EscapeString(title) + `"><meta property="og:description" content="` + html.EscapeString(description) + `"><meta property="og:url" content="` + html.EscapeString(canonical) + `"><meta property="og:type" content="website"><script type="application/ld+json">` + string(data) + `</script>`
	return []byte(strings.Replace(string(content), "</head>", meta+"</head>", 1))
}
func registerDiscoveryRoutes(router *mux.Router) {
	router.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://barnwide.com/sitemap.xml\n"))
	}).Methods("GET")
	router.HandleFunc("/llms.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("# Barnwide\n\nIndependent hockey fan project. Data from the NHL.\n\n- [Teams](https://barnwide.com/)\n- [Scores](https://barnwide.com/scores)\n- [Standings](https://barnwide.com/standings)\n\nStandings and statistics identify their season. Cached snapshots may be displayed when the NHL is unavailable.\n"))
	}).Methods("GET")
	router.HandleFunc("/sitemap.xml", func(w http.ResponseWriter, r *http.Request) {
		type url struct {
			Loc string `xml:"loc"`
		}
		out := struct {
			XMLName xml.Name `xml:"urlset"`
			NS      string   `xml:"xmlns,attr"`
			URLs    []url    `xml:"url"`
		}{NS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
		for _, path := range []string{"/", "/scores", "/standings"} {
			out.URLs = append(out.URLs, url{"https://barnwide.com" + path})
		}
		for _, t := range catalogResponse().Teams {
			for _, prefix := range []string{"/team/", "/team-schedule/"} {
				out.URLs = append(out.URLs, url{"https://barnwide.com" + prefix + strings.ToLower(t.Abbrev)})
			}
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		_, _ = w.Write([]byte(xml.Header))
		_ = xml.NewEncoder(w).Encode(out)
	}).Methods("GET")
}
