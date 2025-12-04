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
    const awayTeam = data.awayTeam;
    const homeTeam = data.homeTeam;
    
    let detailsHTML = `
        <!-- Game Summary -->
        <div class="grid grid-cols-3 gap-4 items-center mb-6 pb-6 border-b">
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                     alt="${homeTeam.abbrev}" 
                     class="w-24 h-24 mx-auto mb-2">
                <div class="font-bold text-lg">${homeTeam.placeName?.default || homeTeam.abbrev}</div>
                <div class="text-sm text-gray-600 mt-1">SOG: ${homeTeam.sog || 0}</div>
            </div>
            <div class="text-center">
                <div class="text-5xl font-bold text-gray-800">${homeTeam.score || 0} - ${awayTeam.score || 0}</div>
                <div class="text-sm text-gray-600 mt-2">${data.gameState === 'FUT' ? 'Scheduled' : data.gameState === 'LIVE' ? 'Live' : 'Final'}</div>
                ${data.periodDescriptor ? `<div class="text-xs text-gray-500 mt-1">${data.periodDescriptor.periodType} - Period ${data.periodDescriptor.number}</div>` : ''}
            </div>
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" 
                     alt="${awayTeam.abbrev}" 
                     class="w-24 h-24 mx-auto mb-2">
                <div class="font-bold text-lg">${awayTeam.placeName?.default || awayTeam.abbrev}</div>
                <div class="text-sm text-gray-600 mt-1">SOG: ${awayTeam.sog || 0}</div>
            </div>
        </div>
    `;
    
    // Three Stars
    if (data.summary?.threeStars && data.summary.threeStars.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    ⭐ Three Stars
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        `;
        
        data.summary.threeStars.forEach(player => {
            const starEmoji = player.star === 1 ? '🥇' : player.star === 2 ? '🥈' : '🥉';
            const stats = player.position === 'G' 
                ? `${player.savePctg ? (player.savePctg * 100).toFixed(1) + '% SV' : 'Goalie'}`
                : `${player.goals || 0}G ${player.assists || 0}A ${player.points || 0}P`;
            
            detailsHTML += `
                <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 flex items-center gap-3">
                    <div class="text-3xl">${starEmoji}</div>
                    <img src="${player.headshot}" alt="${player.name?.default}" class="w-12 h-12 rounded-full object-cover">
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-sm truncate">${player.name?.default || ''}</div>
                        <div class="text-xs text-gray-600">${player.teamAbbrev} #${player.sweaterNo}</div>
                        <div class="text-xs text-gray-500">${stats}</div>
                    </div>
                </div>
            `;
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    // Scoring Summary
    if (data.summary?.scoring && data.summary.scoring.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    🎯 Scoring Summary
                </h4>
                <div class="space-y-3">
        `;
        
        data.summary.scoring.forEach(period => {
            if (period.goals && period.goals.length > 0) {
                detailsHTML += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="font-semibold text-gray-700 mb-3">${period.periodDescriptor?.periodType || 'Period'} ${period.periodDescriptor?.number || ''}</div>
                        <div class="space-y-3">
                `;
                
                period.goals.forEach(goal => {
                    const teamAbbrev = goal.teamAbbrev?.default || '';
                    const scorer = goal.name?.default || 'Unknown';
                    const assists = goal.assists ? goal.assists.map(a => a.name?.default || '').filter(n => n).join(', ') : '';
                    const time = goal.timeInPeriod || '';
                    const strength = goal.strength || '';
                    const shotType = goal.shotType || '';
                    const score = `${goal.homeScore}-${goal.awayScore}`;
                    const highlightUrl = goal.highlightClipSharingUrl || '';
                    const goalModifier = goal.goalModifier || '';
                    
                    let strengthBadge = '';
                    if (strength === 'pp') {
                        strengthBadge = '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">PP</span>';
                    } else if (strength === 'sh') {
                        strengthBadge = '<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-semibold">SH</span>';
                    }
                    
                    if (goalModifier === 'empty-net') {
                        strengthBadge += ' <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">EN</span>';
                    }
                    
                    detailsHTML += `
                        <div class="flex items-start gap-3 text-sm bg-white rounded p-3">
                            <img src="https://assets.nhle.com/logos/nhl/svg/${teamAbbrev}_light.svg" 
                                 alt="${teamAbbrev}" 
                                 class="w-8 h-8 flex-shrink-0">
                            <img src="${goal.headshot}" alt="${scorer}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="font-bold">${scorer} (${goal.goalsToDate || 0}) ${strengthBadge}</div>
                                ${assists ? `<div class="text-gray-600 text-xs mt-1">Assists: ${assists}</div>` : ''}
                                <div class="text-gray-500 text-xs mt-1">${shotType ? shotType + ' shot' : ''}</div>
                                ${highlightUrl ? `<div class="mt-2"><a href="${highlightUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1 rounded hover:bg-secondary transition">🎥 Watch Highlight</a></div>` : ''}
                            </div>
                            <div class="text-right flex-shrink-0">
                                <div class="font-mono text-xs text-gray-600">${time}</div>
                                <div class="font-bold text-sm text-primary">${score}</div>
                            </div>
                        </div>
                    `;
                });
                
                detailsHTML += `
                        </div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    // Penalties
    if (data.summary?.penalties && data.summary.penalties.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    🚨 Penalties
                </h4>
                <div class="space-y-3">
        `;
        
        data.summary.penalties.forEach(period => {
            if (period.penalties && period.penalties.length > 0) {
                detailsHTML += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="font-semibold text-gray-700 mb-3">${period.periodDescriptor?.periodType || 'Period'} ${period.periodDescriptor?.number || ''}</div>
                        <div class="space-y-2">
                `;
                
                period.penalties.forEach(penalty => {
                    const teamAbbrev = penalty.teamAbbrev?.default || '';
                    const player = `${penalty.committedByPlayer?.firstName?.default || ''} ${penalty.committedByPlayer?.lastName?.default || ''}`.trim();
                    const number = penalty.committedByPlayer?.sweaterNumber || '';
                    const descKey = penalty.descKey || '';
                    const duration = penalty.duration || 0;
                    const type = penalty.type || '';
                    const penaltyType = type === 'MIN' ? 'Minor' : type === 'MAJ' ? 'Major' : type;
                    const time = penalty.timeInPeriod || '';
                    
                    detailsHTML += `
                        <div class="flex items-center gap-3 text-sm bg-white rounded p-2">
                            <img src="https://assets.nhle.com/logos/nhl/svg/${teamAbbrev}_light.svg" 
                                 alt="${teamAbbrev}" 
                                 class="w-6 h-6 flex-shrink-0">
                            <div class="flex-1">
                                <span class="font-semibold">${player} #${number}</span>
                                <span class="text-gray-600"> - ${penaltyType} (${duration} min) - ${descKey}</span>
                            </div>
                            <div class="text-gray-500 text-xs font-mono">${time}</div>
                        </div>
                    `;
                });
                
                detailsHTML += `
                        </div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    content.innerHTML = detailsHTML;
}

