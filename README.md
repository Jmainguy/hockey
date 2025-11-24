# NHL Fan Hub

A beautiful, real-time web application for NHL fans to explore teams, view current standings, browse rosters, and dive deep into player statistics and career histories. Built with Go and vanilla JavaScript, this app provides a fast, responsive interface to all the NHL data you need.

## 🏒 Features

### Team & Standings
- Browse all 32 NHL teams organized by conference and division
- View comprehensive league standings with filtering by conference or division
- Real-time team records (wins, losses, OT losses, points, points percentage)
- Team logos and visual branding

### Rosters & Players
- Complete team rosters for the current season
- Search and sort players by name, position, goals, assists, points, and more
- Player position filtering (Forwards, Defensemen, Goalies)
- Direct navigation from roster to detailed player pages

### Player Statistics
- Detailed player profiles with headshots and action photos
- Full career statistics across all seasons and leagues
- Season-by-season breakdown with NHL team logos
- Advanced stats expansion for detailed performance metrics
- Awards and achievements tracking
- Playoff vs regular season indicators
- Interactive stat highlighting and filtering

### Design
- 🎨 Modern, responsive design with NHL-inspired styling
- 📱 Mobile-friendly interface
- ⚡ Fast loading with client-side caching
- 🖼️ Dynamic team colors and action photography
- ✨ Smooth transitions and hover effects

## 🏗️ Architecture

### Backend
- **Language**: Go 1.21+
- **Framework**: Gorilla Mux (routing)
- **API Integration**: NHL Stats API v1 (https://api-web.nhle.com/v1)
- **Deployment**: Docker via ko with embedded static assets
- **Caching**: In-memory caching for improved performance

### Frontend
- **HTML5** with semantic structure
- **Tailwind CSS** for utility-first styling
- **Custom CSS** for specialized components
- **Vanilla JavaScript** (no framework dependencies)
- **Modular JS** architecture (app.js, team.js, player.js, standings.js)

## 📁 Project Structure

```
hockey/
├── main.go              # Server setup, HTTP handlers, embedded files
├── nhl_api.go          # NHL API client functions and data enrichment
├── models.go           # Data structures for API responses
├── go.mod              # Go module definition
├── .ko.yaml            # Ko configuration for container builds
├── templates/
│   ├── index.html      # Team selection page (by conference/division)
│   ├── standings.html  # League standings with filters
│   ├── team.html       # Team details and roster page
│   └── player.html     # Player statistics and career page
└── static/
    ├── style.css       # Custom styles and legacy components
    ├── app.js          # Main page: team cards and grouping
    ├── standings.js    # Standings page: filtering and rankings
    ├── team.js         # Team page: roster display, search, sort
    └── player.js       # Player page: stats, awards, seasons
```

## 🚀 Building and Running

### Prerequisites
- Go 1.21 or higher
- A web browser
- Internet connection (to access NHL API)

### Local Development

```bash
# Download dependencies
go mod download

# Run the server directly
go run .
```

The server will start on `http://localhost:8080`

### Build Binary

```bash
# Build the application
go build -o hockey

# Run the binary
./hockey
```

### Container Build with Ko

```bash
# Install ko if you haven't already
go install github.com/google/ko@latest

# Build and push to a registry (requires KO_DOCKER_REPO env var)
export KO_DOCKER_REPO=your-registry/your-username
ko build --bare .

# Or build locally without pushing
ko build --local --bare .
```

The application uses Go's `embed` directive to bundle all static assets and templates into the binary, making it ideal for containerized deployments.

## 📡 API Endpoints

### Frontend Routes
- `GET /` - Team selection page (organized by conference/division)
- `GET /standings` - League standings with filters
- `GET /team/{teamId}` - Team details and roster page
- `GET /player/{playerId}` - Player statistics and career page

### Backend API Routes
- `GET /api/teams` - Get all NHL teams with current records
- `GET /api/team/{teamId}` - Get team details (record, division, conference)
- `GET /api/roster/{teamId}` - Get current season team roster with player stats
- `GET /api/player/{playerId}` - Get player landing data (enriched with team abbreviations)

## 🏒 NHL API Data Sources

This application is powered by the **official NHL Stats API** and wouldn't be possible without the excellent documentation from the community:

### API Documentation Credits
- **NHL API Reference by dword4**: [https://gitlab.com/dword4/nhlapi/-/blob/master/new-api.md](https://gitlab.com/dword4/nhlapi/-/blob/master/new-api.md)
- **NHL API Reference by Zmalski**: [https://github.com/Zmalski/NHL-API-Reference](https://github.com/Zmalski/NHL-API-Reference)
- **NHL.com**: Official data provider - all statistics, player information, and team data

### Key Endpoints Used
- **Base URL**: `https://api-web.nhle.com/v1`
- `/standings/{date}` - Current standings data
- `/roster/{teamAbbrev}/{seasonId}` - Team rosters
- `/player/{playerId}/landing` - Player career statistics and details

The application enriches API responses with team abbreviation mappings for consistent logo display and navigation.

## ✨ Features Explained

### Team Selection (Home Page)
- All 32 NHL teams organized by conference (Eastern/Western) and division
- Team logos with automatic fallback handling
- Real-time records (wins, losses, OT losses, points)
- Direct links to team pages and standings

### Standings Page
- **League View**: Full NHL rankings
- **Conference View**: Eastern or Western conference standings
- **Division View**: Atlantic, Metropolitan, Central, or Pacific
- Displays: Rank, Team Logo, GP, W, L, OT, Points, Points %
- Sortable by points with wins as tiebreaker

### Team Details & Roster
- Team header with logo, division, and conference
- Current season record with colorful stat cards
- Complete roster with player headshots
- **Search**: Filter players by name
- **Sort**: By goals, assists, points, games played, save %, GAA
- **Position Filter**: All, Forwards, Defensemen, Goalies
- Click any player to view detailed stats

### Player Pages
- Hero card with player photo, jersey number, position
- Full name display with fallback handling
- **Overview Tab**: Current season featured stats
- **Seasons Tab**: Career history across all leagues
  - NHL seasons show official team logos
  - Playoff vs Regular Season indicators
  - Season cards with expandable advanced stats
  - Best stats highlighting per visible league
- **Awards Tab**: Career achievements and honors
- League filtering (NHL, AHL, college, international)
- Dynamic background with team action shots
- Navigation back to team or home

## 🎯 Performance & Caching

- **Server-side caching**: Team details and rosters cached for 5 minutes
- **In-memory storage**: Fast data retrieval with automatic expiration
- **Client-side**: Minimal bundle size with vanilla JavaScript
- **Embedded assets**: All static files compiled into binary (no external dependencies)
- **API timeout**: 10-second protection on external calls

## 🌐 Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🎟️ Support Your Team!

Love hockey? **Get out there and support your local team!** Whether it's NHL, AHL, ECHL, college, or junior hockey - live hockey is the best hockey. Check your team's schedule and grab tickets today! 🏒

---

**Go watch a game. You won't regret it.**

## 🙏 Acknowledgments

- **NHL.com** - For providing the comprehensive stats API that powers this application
- **dword4** - For the excellent NHL API documentation
- **Zmalski** - For the detailed NHL API reference guide  

## 📄 License

See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs or request features via GitHub Issues
- Submit pull requests for improvements
- Share feedback and suggestions

---

**Built with ❤️ for NHL fans everywhere**

*Go support your local team!*
