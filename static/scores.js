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
    
    // Add click handler to show game details
    card.addEventListener('click', () => {
        showGameDetails(game);
    });
    
    const awayTeam = game.awayTeam;
    const homeTeam = game.homeTeam;
    const gameState = game.gameState;
    const gameScheduleState = game.gameScheduleState;
    
    // Determine game status
    let statusHTML = '';
    let scoreHTML = '';
    
    if (gameState === 'FUT' || gameScheduleState === 'TBD') {
        // Future game - show start time
        const startTime = formatTime(game.startTimeUTC);
        statusHTML = `<div class="text-center text-sm font-semibold text-gray-600 mb-2">${startTime}</div>`;
        scoreHTML = `
            <div class="text-center py-4">
                <div class="text-4xl font-bold text-gray-300">VS</div>
            </div>
        `;
    } else if (gameState === 'LIVE' || gameState === 'CRIT') {
        // Live game
        const period = game.periodDescriptor?.periodType || 'LIVE';
        const clock = game.clock?.timeRemaining || '';
        statusHTML = `
            <div class="text-center mb-2">
                <span class="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
                    <span class="animate-pulse">🔴</span> ${period} ${clock}
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
                <div class="text-xs text-gray-500 mt-1">@ ${awayTeam.record || ''}</div>
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

