// Current date being viewed
let currentDate = new Date();

// Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format date for display
function formatDateDisplay(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Format time from ISO string
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

// Load games for the current date
async function loadGames() {
    const dateStr = formatDate(currentDate);
    
    // Update date display
    document.getElementById('currentDate').textContent = formatDateDisplay(currentDate);
    
    // Show loading
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('gamesContainer').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    
    try {
        const response = await fetch(`/api/schedule/${dateStr}`);
        if (!response.ok) {
            throw new Error('Failed to load schedule');
        }
        
        const data = await response.json();
        
        // Hide loading
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('gamesContainer').classList.remove('hidden');
        
        if (data.gameWeek && data.gameWeek.length > 0) {
            displayGames(data.gameWeek);
        } else {
            document.getElementById('noGames').classList.remove('hidden');
            document.getElementById('gamesGrid').innerHTML = '';
        }
    } catch (error) {
        showError(error.message);
    }
}

// Display games
function displayGames(gameWeek) {
    const gamesGrid = document.getElementById('gamesGrid');
    const noGames = document.getElementById('noGames');
    gamesGrid.innerHTML = '';
    
    // Find games for the current date only
    const dateStr = formatDate(currentDate);
    const allGames = [];
    
    gameWeek.forEach(day => {
        // Only include games from the current date
        if (day.date === dateStr && day.games && day.games.length > 0) {
            allGames.push(...day.games);
        }
    });
    
    if (allGames.length === 0) {
        noGames.classList.remove('hidden');
        return;
    }
    
    noGames.classList.add('hidden');
    
    allGames.forEach(game => {
        const gameCard = createGameCard(game);
        gamesGrid.appendChild(gameCard);
    });
}

// Create a game card
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl shadow-md hover:shadow-xl transition p-6 cursor-pointer';
    
    // Click opens a dedicated game page so it can be shared
    card.addEventListener('click', () => {
        const dateStr = formatDate(currentDate);
        const url = new URL(window.location.origin + `/game/${game.id}`);
        url.searchParams.set('from', 'schedule');
        url.searchParams.set('date', dateStr);
        window.location.href = url.toString();
    });
    
    const awayTeam = game.awayTeam;
    const homeTeam = game.homeTeam;
    const gameState = game.gameState;
    const gameScheduleState = game.gameScheduleState;
    
    // Determine game status
    let statusHTML = '';
    let scoreHTML = '';
    
    if (gameState === 'PRE') {
        // Pregame - show pregame badge and start time
        const startTime = game.startTimeUTC ? formatTime(game.startTimeUTC) : 'TBD';
        statusHTML = `<div class="text-center mb-2">
                <span class="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-semibold">
                    <span class="text-sm">⏳</span> Pregame • ${startTime}
                </span>
            </div>`;
        scoreHTML = `
            <div class="text-center py-4">
                <div class="text-4xl font-bold text-gray-300">VS</div>
            </div>
        `;
    } else if (gameState === 'FUT' || gameScheduleState === 'TBD') {
        // Future game - show start time only
        const startTime = game.startTimeUTC ? formatTime(game.startTimeUTC) : 'TBD';
        statusHTML = `<div class="text-center text-sm font-semibold text-gray-600 mb-2">${startTime}</div>`;
        scoreHTML = `
            <div class="text-center py-4">
                <div class="text-4xl font-bold text-gray-300">VS</div>
            </div>
        `;
    } else if (gameState === 'LIVE' || gameState === 'CRIT') {
        // Live game - prefer clock.timeRemaining and show period number/type
        const pd = game.periodDescriptor || {};
        const periodType = pd.periodType || '';
        const periodNum = pd.number || '';
        const clockObj = game.clock || {};
        const isIntermission = !!clockObj.inIntermission;
        const clock = clockObj.timeRemaining || clockObj.TimeRemaining || '';
        let stateText = '';
        if (isIntermission) {
            stateText = `Intermission${periodNum ? ' • ' + (periodNum) : ''}`;
        } else if (clock) {
            stateText = `${periodType} ${periodNum} • ${clock}`.trim();
        } else if (periodType || periodNum) {
            stateText = `${periodType} ${periodNum}`.trim();
        } else {
            stateText = 'Live';
        }
        statusHTML = `
            <div class="text-center mb-2">
                <span class="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
                    <span class="animate-pulse">🔴</span> ${stateText}
                </span>
            </div>
        `;
        scoreHTML = `
            <div class="flex items-center justify-center gap-8 py-4">
                <div class="text-5xl font-bold ${homeTeam.score > awayTeam.score ? 'text-primary' : 'text-gray-400'}">${homeTeam.score || 0}</div>
                <div class="text-2xl font-bold text-gray-400">-</div>
                <div class="text-5xl font-bold ${awayTeam.score > homeTeam.score ? 'text-primary' : 'text-gray-400'}">${awayTeam.score || 0}</div>
            </div>
        `;
    } else if (gameState === 'OFF' || gameState === 'FINAL') {
        // Final game
        let finalText = 'Final';
        if (game.periodDescriptor) {
            const periodType = game.periodDescriptor.periodType;
            if (periodType === 'OT') {
                finalText = 'Final/OT';
            } else if (periodType === 'SO') {
                finalText = 'Final/SO';
            }
        }
        statusHTML = `<div class="text-center text-sm font-semibold text-gray-600 mb-2">${finalText}</div>`;
        scoreHTML = `
            <div class="flex items-center justify-center gap-8 py-4">
                <div class="text-5xl font-bold ${homeTeam.score > awayTeam.score ? 'text-primary' : 'text-gray-400'}">${homeTeam.score || 0}</div>
                <div class="text-2xl font-bold text-gray-400">-</div>
                <div class="text-5xl font-bold ${awayTeam.score > homeTeam.score ? 'text-primary' : 'text-gray-400'}">${awayTeam.score || 0}</div>
            </div>
        `;
    }
    
    // TV broadcasts
    let broadcastHTML = '';
    if (game.tvBroadcasts && game.tvBroadcasts.length > 0) {
        const broadcasts = game.tvBroadcasts.map(b => b.network).join(', ');
        broadcastHTML = `
            <div class="text-center text-xs text-gray-500 mt-3 flex items-center justify-center gap-2">
                <span>📺</span>
                <span>${broadcasts}</span>
            </div>
        `;
    }
    
    // Venue
    let venueHTML = '';
    if (game.venue && game.venue.default) {
        venueHTML = `
            <div class="text-center text-xs text-gray-500 mt-1">
                📍 ${game.venue.default}
            </div>
        `;
    }
    
    card.innerHTML = `
        ${statusHTML}
        <div class="grid grid-cols-3 gap-4 items-center mb-4">
            <!-- Home Team -->
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                     alt="${homeTeam.abbrev}" 
                     class="w-20 h-20 mx-auto mb-2 drop-shadow-md">
                <div class="font-bold text-gray-800">${homeTeam.placeName?.default || homeTeam.abbrev}</div>
                <div class="text-sm text-gray-600">${homeTeam.commonName?.default || ''}</div>
                <div class="text-xs text-gray-500 mt-1">${homeTeam.record || ''}</div>
            </div>
            
            <!-- Score -->
            <div>
                ${scoreHTML}
            </div>
            
            <!-- Away Team -->
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" 
                     alt="${awayTeam.abbrev}" 
                     class="w-20 h-20 mx-auto mb-2 drop-shadow-md">
                <div class="font-bold text-gray-800">${awayTeam.placeName?.default || awayTeam.abbrev}</div>
                <div class="text-sm text-gray-600">${awayTeam.commonName?.default || ''}</div>
                <div class="text-xs text-gray-500 mt-1">${awayTeam.record || ''}</div>
            </div>
        </div>
        ${broadcastHTML}
        ${venueHTML}
    `;
    
    return card;
}

// Show error
function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('gamesContainer').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

// Navigation handlers
document.getElementById('prevDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    loadGames();
});

document.getElementById('nextDay').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    loadGames();
});

document.getElementById('todayBtn').addEventListener('click', () => {
    currentDate = new Date();
    loadGames();
});

// Load games on page load
loadGames();

// Auto-refresh every 30 seconds for live games
setInterval(() => {
    const gamesGrid = document.getElementById('gamesGrid');
    if (gamesGrid && !gamesGrid.classList.contains('hidden')) {
        loadGames();
    }
}, 30000);

// Show game details in a modal
async function showGameDetails(game) {
    const gameId = game.id;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto my-8">
            <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
                <h3 class="text-xl font-bold text-gray-800">Game Details</h3>
                <button class="close-modal w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-2xl font-bold text-gray-600 transition">×</button>
            </div>
            <div class="p-6" id="gameDetailsContent">
                <div class="text-center py-12 text-gray-500">Loading game details...</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal handlers
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Load game details
    try {
        const response = await fetch(`/api/gamecenter/${gameId}/landing`);
        if (!response.ok) {
            throw new Error('Failed to load game details');
        }
        
        const data = await response.json();
        displayGameDetails(data, game, modal);
        // Additionally fetch related videos by gameId and append to modal
        fetch(`/api/videos/${gameId}`).then(resp => {
            if (!resp.ok) return null;
            return resp.json();
        }).then(videoData => {
            if (!videoData || !videoData.items || videoData.items.length === 0) return;
            try {
                const content = modal.querySelector('#gameDetailsContent');
                let videosHTML = '<div class="mt-6"><h4 class="text-lg font-bold mb-3">🎥 Game Videos</h4><div class="grid grid-cols-1 gap-3">';
                videoData.items.forEach(item => {
                    const bcAccount = item.fields && item.fields.brightcoveAccountId ? item.fields.brightcoveAccountId : (item.fields && item.fields.BrightcoveAccountID ? item.fields.BrightcoveAccountID : null);
                    const bcId = item.fields && item.fields.brightcoveId ? item.fields.brightcoveId : (item.fields && item.fields.BrightcoveID ? item.fields.BrightcoveID : null);
                    // Some items use item.fields.BrightcoveID or item.fields.brightcoveId; also item.fields.duration etc.
                    if (bcAccount && bcId) {
                        const playerUrl = `https://players.brightcove.net/${bcAccount}/EXtG1xJ7H_default/index.html?videoId=${bcId}`;
                        const base = item.title || (item.context && item.context.title) || 'Video';
                        const sub = (item.context && item.context.subtitle) || (item.fields && item.fields.sourceTitle) || (item.fields && item.fields.publishedDate) || item.guid || item.id || '';
                        const meta = sub ? ` — ${sub}` : '';
                        const title = `${base}${meta}`;
                        videosHTML += `<div class="bg-gray-50 rounded p-3 flex items-center justify-between"><div class="text-sm">${title}</div><div><a href="${playerUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-primary text-white px-3 py-1 rounded">▶ Watch</a></div></div>`;
                    }
                });
                videosHTML += '</div></div>';
                // Append videos section after existing content
                content.insertAdjacentHTML('beforeend', videosHTML);
            } catch (e) {
                // ignore
            }
        }).catch(() => {});
    } catch (error) {
        const content = modal.querySelector('#gameDetailsContent');
        content.innerHTML = `<div class="text-center py-12 text-red-500">Error loading game details: ${error.message}</div>`;
    }
}

// Display game details
function displayGameDetails(data, game, modal) {
    const content = modal.querySelector('#gameDetailsContent');
    content.innerHTML = displayGameDetailsHTML(data);
}

