// NHL Fan Hub - Team Schedule Calendar
let currentTeamId = null;
let currentTeamAbbrev = null;
let currentTeamName = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let allGames = [];
let scheduleCache = {}; // Cache schedules by season
let teamObj = null;

document.addEventListener('DOMContentLoaded', function() {
    // Get team ID from URL
    const pathParts = window.location.pathname.split('/');
    currentTeamId = pathParts[pathParts.length - 1];
    
    if (!currentTeamId) {
        showError('No team selected. Please go back and select a team.');
        return;
    }

    // Set up back button
    const backBtn = document.getElementById('backToTeam');
    if (backBtn) {
        backBtn.href = `/team/${currentTeamId}`;
    }

    // Load team info first, then schedule
    loadTeamInfo().then(() => {
        loadSchedule();
    });

    // Set up navigation buttons
    document.getElementById('prevMonth')?.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        const season = getSeason(currentYear, currentMonth);
        loadSchedule(season);
    });

    document.getElementById('nextMonth')?.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        const season = getSeason(currentYear, currentMonth);
        loadSchedule(season);
    });

    document.getElementById('todayBtn')?.addEventListener('click', () => {
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
        loadSchedule('now');
    });

    // Close modal handlers
    const closeBtn = document.getElementById('gameModalClose');
    const modal = document.getElementById('gameModal');
    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
});

async function loadTeamInfo() {
    try {
        const response = await fetch(`/api/team/${currentTeamId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data.teams && data.teams.length > 0) {
            const team = data.teams[0];
            teamObj = team;
            currentTeamAbbrev = team.abbreviation;
            currentTeamName = team.name;
            // set doc title
            try { document.title = `${team.name} — Schedule`; } catch (e) {}
            // Use shared header populator
            if (window.populateSharedHeader) window.populateSharedHeader(teamObj, 'Schedule');
        }
    } catch (error) {
        console.error('Error loading team info:', error);
    }

        // Use shared populateSharedHeader from team-header.js
}

async function loadSchedule(season = null) {
    try {
        // Determine which season to load if not specified
        if (!season) {
            season = getSeason(currentYear, currentMonth);
        }
        
        // Check cache first
        if (scheduleCache[season]) {
            allGames = scheduleCache[season];
            renderCalendar();
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('calendarControls').classList.remove('hidden');
            document.getElementById('calendarSection').classList.remove('hidden');
            return;
        }
        
        const url = season === 'now' 
            ? `/api/team-schedule/${currentTeamId}`
            : `/api/team-schedule/${currentTeamId}?season=${season}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        allGames = data.games || [];
        scheduleCache[season] = allGames; // Cache the results
        renderCalendar();
        
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('calendarControls').classList.remove('hidden');
        document.getElementById('calendarSection').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading schedule:', error);
        showError(`Error loading schedule: ${error.message}`);
    }
}

// Determine the NHL season code based on year and month
// NHL seasons run from October (year) to June (year+1)
function getSeason(year, month) {
    // If viewing current date range, use 'now'
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) {
        return 'now';
    }
    
    // NHL season starts in October and ends in June
    // If month is Oct-Dec, season is YYYY(YYYY+1)
    // If month is Jan-Sep, season is (YYYY-1)YYYY
    let seasonStartYear;
    if (month >= 9) { // October (9) through December (11)
        seasonStartYear = year;
    } else { // January (0) through September (8)
        seasonStartYear = year - 1;
    }
    
    return `${seasonStartYear}${seasonStartYear + 1}`;
}

function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('currentMonth').textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    // Calculate month record
    calculateMonthRecord();
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        grid.appendChild(emptyCell);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = createDayCell(day);
        grid.appendChild(cell);
    }
}

function calculateMonthRecord() {
    // Filter games for the current month
    const monthGames = allGames.filter(game => {
        const gameDate = new Date(game.gameDate);
        return gameDate.getFullYear() === currentYear && 
               gameDate.getMonth() === currentMonth &&
               (game.gameState === 'FINAL' || game.gameState === 'OFF');
    });
    
    let wins = 0;
    let losses = 0;
    let otl = 0;
    
    monthGames.forEach(game => {
        const isHome = game.homeTeam.abbrev === currentTeamAbbrev;
        const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
        const won = teamScore > oppScore;
        const overtime = game.periodDescriptor?.periodType === 'OT' || game.periodDescriptor?.periodType === 'SO';
        
        if (won) {
            wins++;
        } else if (overtime) {
            otl++;
        } else {
            losses++;
        }
    });
    
    const points = (wins * 2) + otl;
    const gamesPlayed = wins + losses + otl;
    const pointsPct = gamesPlayed > 0 ? ((points / (gamesPlayed * 2)) * 100).toFixed(1) : '0.0';
    
    // Update display
    document.getElementById('monthWins').textContent = wins;
    document.getElementById('monthLosses').textContent = losses;
    document.getElementById('monthOTL').textContent = otl;
    document.getElementById('monthPoints').textContent = points;
    document.getElementById('monthPct').textContent = pointsPct + '%';
    document.getElementById('monthRecord').classList.remove('hidden');
}

function createDayCell(day) {
    const cell = document.createElement('div');
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Find games for this day
    const gamesOnDay = allGames.filter(game => {
        const gameDate = game.gameDate.split('T')[0];
        return gameDate === dateStr;
    });
    
    // Check if it's today
    const today = new Date();
    const isToday = day === today.getDate() && 
                    currentMonth === today.getMonth() && 
                    currentYear === today.getFullYear();
    
    // Determine day color based on game results
    let dayColorClass = '';
    let hasGameClass = '';
    if (gamesOnDay.length > 0) {
        // Check if any game is finished
        const finishedGames = gamesOnDay.filter(g => g.gameState === 'FINAL' || g.gameState === 'OFF');
        if (finishedGames.length > 0) {
            // Use the first finished game's result to color the whole day
            const game = finishedGames[0];
            const isHome = game.homeTeam.abbrev === currentTeamAbbrev;
            const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
            const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
            const won = teamScore > oppScore;
            const overtime = game.periodDescriptor?.periodType === 'OT' || game.periodDescriptor?.periodType === 'SO';
            
            if (won) {
                dayColorClass = 'day-win';
            } else if (overtime) {
                dayColorClass = 'day-otl';
            } else {
                dayColorClass = 'day-loss';
            }
        } else {
            // Game not finished yet - just mark as has-game
            hasGameClass = 'has-game';
        }
    }
    
    cell.className = `calendar-day-cell ${isToday ? 'today' : ''} ${hasGameClass} ${dayColorClass}`;
    
    let cellHtml = `<div class="day-number">${day}</div>`;
    
    if (gamesOnDay.length > 0) {
        cellHtml += '<div class="games-container">';
        gamesOnDay.forEach(game => {
            const isHome = game.homeTeam.abbrev === currentTeamAbbrev;
            const homeAbbrev = game.homeTeam.abbrev;
            const awayAbbrev = game.awayTeam.abbrev;
            const gameTime = formatGameTime(game.startTimeUTC || game.gameDate);
            const gameStatus = getGameStatus(game);
            
            // Build logo display
            const homeLogoSrc = game.homeTeam.logo || game.homeTeam.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${homeAbbrev}_light.svg`;
            const awayLogoSrc = game.awayTeam.logo || game.awayTeam.darkLogo || `https://assets.nhle.com/logos/nhl/svg/${awayAbbrev}_light.svg`;
            const logoHtml = `
                <div class="game-logos">
                    <div class="team-logo-container">
                        <img src="${homeLogoSrc}" 
                             alt="${homeAbbrev}" 
                             class="team-logo-calendar"
                             onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                        <div class="team-abbrev">${homeAbbrev}</div>
                    </div>
                    <span class="vs-text">vs</span>
                    <div class="team-logo-container">
                        <img src="${awayLogoSrc}" 
                             alt="${awayAbbrev}" 
                             class="team-logo-calendar"
                             onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                        <div class="team-abbrev">${awayAbbrev}</div>
                    </div>
                </div>
            `;
            
            // Show score or time with result text
            let resultHtml = '';
            if (gameStatus.text) {
                // Game is finished or live - show result/status
                if (game.gameState === 'FINAL' || game.gameState === 'OFF') {
                    const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
                    const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
                    const won = teamScore > oppScore;
                    const overtime = game.periodDescriptor?.periodType === 'OT' || game.periodDescriptor?.periodType === 'SO';
                    
                    let resultText = won ? 'Win' : 'Loss';
                    if (overtime && !won) resultText = 'OTL';
                    
                    resultHtml = `
                        <div class="game-result-text">${resultText}</div>
                        <div class="game-score-display">${game.homeTeam.score} - ${game.awayTeam.score}</div>
                    `;
                } else {
                    resultHtml = `<div class="game-time-result">${gameStatus.text}</div>`;
                }
            } else {
                resultHtml = `<div class="game-time-result">${gameTime}</div>`;
            }
            
            cellHtml += `
                <div class="game-item-calendar ${gameStatus.class}" data-game-id="${game.id}">
                    ${logoHtml}
                    ${resultHtml}
                </div>
            `;
        });
        cellHtml += '</div>';
        
        // Add click handlers to game items - navigate to dedicated game page instead of modal
        cell.addEventListener('click', (e) => {
            const gameItem = e.target.closest('.game-item-calendar');
            if (gameItem) {
                const gameId = gameItem.dataset.gameId;
                const url = new URL(window.location.origin + `/game/${gameId}`);
                url.searchParams.set('from', 'team-schedule');
                url.searchParams.set('team', currentTeamId || currentTeamAbbrev || '');
                window.location.href = url.toString();
            }
        });
    }
    
    cell.innerHTML = cellHtml;
    return cell;
}

function getOpponent(game) {
    if (!currentTeamAbbrev) return 'TBD';
    return game.homeTeam.abbrev === currentTeamAbbrev ? 
           game.awayTeam.abbrev : game.homeTeam.abbrev;
}

function formatGameTime(dateStr) {
    if (!dateStr) return 'TBD';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit'
    });
}

function getGameStatus(game) {
    // Check game state
    const state = game.gameState;
    
    if (state === 'FUT' || state === 'PRE') {
        return { class: '', text: null }; // Show time
    }
    
    if (state === 'LIVE' || state === 'CRIT') {
        return { class: 'live', text: 'LIVE' };
    }
    
    if (state === 'FINAL' || state === 'OFF') {
        // Game is over - show result
        const isHome = game.homeTeam.abbrev === currentTeamAbbrev;
        const teamScore = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
        
        const won = teamScore > oppScore;
        const overtime = game.periodDescriptor?.periodType === 'OT' || game.periodDescriptor?.periodType === 'SO';
        
        let resultText = won ? 'W' : 'L';
        if (overtime && !won) resultText = 'OTL';
        else if (overtime && won) resultText = 'W (OT)';
        
        return { 
            class: won ? 'win' : 'loss',
            text: `${resultText} ${teamScore}-${oppScore}`
        };
    }
    
    return { class: '', text: null };
}

async function showGameDetails(gameId) {
    const modal = document.getElementById('gameModal');
    const details = document.getElementById('gameDetails');
    
    details.innerHTML = '<div class="text-center py-6 text-gray-500">Loading game details...</div>';
    modal.classList.remove('hidden');
    
    try {
        const response = await fetch(`/api/gamecenter/${gameId}/landing`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        displayGameDetails(data, gameId);
    } catch (error) {
        console.error('Error loading game details:', error);
        details.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Error loading game details: ${error.message}</div>`;
    }
}

function displayGameDetails(data, gameId) {
    const content = document.getElementById('gameDetails');
    content.innerHTML = displayGameDetailsHTML(data);
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    const loading = document.getElementById('loading');
    
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    loading.classList.add('hidden');
}
