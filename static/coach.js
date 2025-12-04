// Get team ID from URL
const params = new URLSearchParams(window.location.search);
const teamId = params.get('team');

let allPlayers = [];
let forwards = [];
let defensemen = [];
let goalies = [];
let teamAbbrev = '';
let draggedPlayer = null;
let currentTab = 'even-strength';

// Load lineup from localStorage
function loadSavedLineup() {
    const saved = localStorage.getItem(`lineup_${teamId}`);
    return saved ? JSON.parse(saved) : null;
}

// Save lineup to localStorage
function saveLineup() {
    const lineup = {};
    
    // Collect all assigned players
    document.querySelectorAll('.drop-zone').forEach(zone => {
        const slot = zone.closest('.player-slot');
        const playerId = zone.dataset.playerId;
        if (playerId) {
            const tabName = zone.closest('.tab-content').id.replace('tab-', '');
            const key = `${tabName}_${slot.dataset.line}_${slot.dataset.position}`;
            lineup[key] = playerId;
        }
    });
    
    localStorage.setItem(`lineup_${teamId}`, JSON.stringify(lineup));
    alert('✅ Lineup saved successfully!');
}

// Reset lineup
function resetLineup() {
    if (confirm('Are you sure you want to reset the lineup? This will clear all assignments.')) {
        localStorage.removeItem(`lineup_${teamId}`);
        location.reload();
    }
}

// Check if player is already assigned in current tab
function isPlayerAssignedInTab(playerId, tabName) {
    const tabContent = document.getElementById(`tab-${tabName}`);
    const assignedZones = tabContent.querySelectorAll('.drop-zone[data-player-id]');
    
    for (const zone of assignedZones) {
        if (zone.dataset.playerId == playerId) {
            return true;
        }
    }
    return false;
}

// Get available players for a slot
function getAvailablePlayersForSlot(slotPosition, tabName) {
    let availablePlayers = [];
    
    if (slotPosition === 'G') {
        availablePlayers = goalies;
    } else if (slotPosition === 'LW' || slotPosition === 'C' || slotPosition === 'RW') {
        // Even strength forward lines - only forwards
        availablePlayers = forwards;
    } else if (slotPosition === 'LD' || slotPosition === 'RD') {
        // Even strength defense pairs - only defensemen
        availablePlayers = defensemen;
    } else if (slotPosition === 'F' || slotPosition === 'D') {
        // Power play / penalty kill / overtime - any skater (forwards + defensemen)
        availablePlayers = [...forwards, ...defensemen];
    }
    
    // Filter out already assigned players in this tab
    return availablePlayers.filter(p => !isPlayerAssignedInTab(p.id, tabName));
}

// Show player selection modal
function showPlayerSelectionModal(slot, zone, tabName) {
    const slotPosition = slot.dataset.position;
    const availablePlayers = getAvailablePlayersForSlot(slotPosition, tabName);
    
    if (availablePlayers.length === 0) {
        alert('No available players for this position');
        return;
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h3 class="text-xl font-bold text-gray-800">Select Player</h3>
                <button class="close-modal w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-2xl font-bold text-gray-600 transition">×</button>
            </div>
            <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" id="modalPlayerList"></div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Populate player list
    const playerList = modal.querySelector('#modalPlayerList');
    availablePlayers.forEach(player => {
        // Determine color class based on player's handedness and slot position
        let colorClass = '';
        const shoots = player.shootsCatches;
        
        // For forwards (LW, RW)
        if (slotPosition === 'LW' || slotPosition === 'RW') {
            if (shoots === 'L' && slotPosition === 'LW') {
                colorClass = 'natural-side';
            } else if (shoots === 'R' && slotPosition === 'RW') {
                colorClass = 'natural-side';
            } else if (shoots === 'L' && slotPosition === 'RW') {
                colorClass = 'off-wing';
            } else if (shoots === 'R' && slotPosition === 'LW') {
                colorClass = 'off-wing';
            }
        }
        // For defensemen (LD, RD)
        else if (slotPosition === 'LD' || slotPosition === 'RD') {
            if (shoots === 'L' && slotPosition === 'LD') {
                colorClass = 'natural-side';
            } else if (shoots === 'R' && slotPosition === 'RD') {
                colorClass = 'natural-side';
            } else if (shoots === 'L' && slotPosition === 'RD') {
                colorClass = 'off-side-d';
            } else if (shoots === 'R' && slotPosition === 'LD') {
                colorClass = 'off-side-d';
            }
        }
        
        const card = document.createElement('div');
        card.className = `player-select-card bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-lg hover:border-accent transition ${colorClass}`;
        
        card.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="${player.photo || '/static/img/placeholder-player.png'}" alt="${player.name}" class="w-12 h-12 rounded-full object-cover">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-gray-800 truncate">${player.name}</div>
                    <div class="text-xs text-gray-600">#${player.number} - ${player.fullPosition}</div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${player.position === 'G' 
                            ? `GP: ${player.stats?.games || 0} | SV%: ${player.stats?.savePercentage ? player.stats.savePercentage.toFixed(3) : '-'}`
                            : `GP: ${player.stats?.games || 0} | PTS: ${player.stats?.points || 0}`
                        }
                    </div>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            assignPlayerToSlot(player, zone);
            document.body.removeChild(modal);
        });
        
        playerList.appendChild(card);
    });
    
    // Close modal handlers
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Assign player to slot
function assignPlayerToSlot(player, zone) {
    zone.innerHTML = '';
    zone.dataset.playerId = player.id;
    
    // Determine if player is on natural side or off-wing
    const slot = zone.closest('.player-slot');
    const position = slot.dataset.position;
    const shoots = player.shootsCatches;
    
    let sideClass = '';
    
    // For forwards (LW, RW)
    if (position === 'LW' || position === 'RW') {
        if (shoots === 'L' && position === 'LW') {
            sideClass = 'natural-side';
        } else if (shoots === 'R' && position === 'RW') {
            sideClass = 'natural-side';
        } else if (shoots === 'L' && position === 'RW') {
            sideClass = 'off-wing';
        } else if (shoots === 'R' && position === 'LW') {
            sideClass = 'off-wing';
        }
    }
    // For defensemen (LD, RD)
    else if (position === 'LD' || position === 'RD') {
        if (shoots === 'L' && position === 'LD') {
            sideClass = 'natural-side';
        } else if (shoots === 'R' && position === 'RD') {
            sideClass = 'natural-side';
        } else if (shoots === 'L' && position === 'RD') {
            sideClass = 'off-side-d';
        } else if (shoots === 'R' && position === 'LD') {
            sideClass = 'off-side-d';
        }
    }
    
    const playerCard = document.createElement('div');
    playerCard.className = `bg-white border-2 border-gray-300 rounded-lg p-2 ${sideClass} cursor-pointer hover:opacity-80 transition`;
    playerCard.innerHTML = `
        <div class="flex items-center gap-2">
            <img src="${player.photo || '/static/img/placeholder-player.png'}" alt="${player.name}" class="w-10 h-10 rounded-full object-cover">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-gray-800 truncate">${player.name}</div>
                <div class="text-xs text-gray-600">#${player.number}</div>
            </div>
        </div>
    `;
    
    // Remove player on click
    playerCard.addEventListener('click', (e) => {
        e.stopPropagation();
        zone.innerHTML = '<div class="text-center text-sm text-gray-400">Click to select</div>';
        delete zone.dataset.playerId;
    });
    
    zone.appendChild(playerCard);
}

async function loadCoach() {
    if (!teamId) {
        showError('No team specified');
        return;
    }

    try {
        // Fetch team details
        const teamResponse = await fetch(`/api/team/${teamId}`);
        if (teamResponse.ok) {
            const teamData = await teamResponse.json();
            if (teamData.teams && teamData.teams.length > 0) {
                const team = teamData.teams[0];
                teamAbbrev = team.abbreviation;
                document.getElementById('teamName').textContent = team.name;
                
                // Set team logo
                if (teamAbbrev) {
                    const logoContainer = document.getElementById('teamLogoContainer');
                    const logoEl = document.createElement('img');
                    logoEl.alt = `${teamAbbrev} logo`;
                    logoEl.className = 'w-16 h-16 object-contain drop-shadow-md';
                    logoEl.src = `https://assets.nhle.com/logos/nhl/svg/${teamAbbrev.toUpperCase()}_light.svg`;
                    logoContainer.appendChild(logoEl);
                }
            }
        }

        // Fetch roster
        const rosterResponse = await fetch(`/api/roster/${teamId}`);
        if (!rosterResponse.ok) {
            throw new Error('Failed to load roster');
        }
        
        const data = await rosterResponse.json();
        
        if (data.players && data.players.length > 0) {
            allPlayers = data.players;
            
            // Separate by position
            forwards = allPlayers.filter(p => p.position === 'F');
            defensemen = allPlayers.filter(p => p.position === 'D');
            goalies = allPlayers.filter(p => p.position === 'G');
            
            // Setup click handlers for slots
            setupSlotClickHandlers();
            
            // Load saved lineup if exists
            const savedLineup = loadSavedLineup();
            if (savedLineup) {
                applyLineup(savedLineup);
            }
            
            // Hide loading, show coach
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('coachSection').classList.remove('hidden');
        } else {
            showError('No players found in roster');
        }
    } catch (error) {
        showError(error.message);
    }
}

function setupSlotClickHandlers() {
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('click', (e) => {
            // Don't trigger if clicking remove button
            if (e.target.classList.contains('remove-player')) {
                return;
            }
            
            // Only show modal if slot is empty
            if (!zone.dataset.playerId) {
                const slot = zone.closest('.player-slot');
                const tabContent = zone.closest('.tab-content');
                const tabName = tabContent.id.replace('tab-', '');
                showPlayerSelectionModal(slot, zone, tabName);
            }
        });
        
        // Make clickable appearance
        zone.classList.add('cursor-pointer', 'hover:border-accent', 'hover:bg-accent/5', 'transition');
    });
}



function applyLineup(lineup) {
    Object.keys(lineup).forEach(key => {
        const parts = key.split('_');
        if (parts.length < 3) return; // Old format, skip
        
        const tabName = parts[0];
        const line = parts[1];
        const position = parts.slice(2).join('_'); // Handle positions with underscores
        const playerId = lineup[key];
        const player = allPlayers.find(p => p.id == playerId);
        
        if (player) {
            const tabContent = document.getElementById(`tab-${tabName}`);
            if (!tabContent) return;
            
            const slot = tabContent.querySelector(`.player-slot[data-line="${line}"][data-position="${position}"]`);
            if (slot) {
                const zone = slot.querySelector('.drop-zone');
                assignPlayerToSlot(player, zone);
            }
        }
    });
}

function showError(message) {
    document.getElementById('loading').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function goBackToTeam() {
    window.location.href = `/team/${teamId}`;
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        currentTab = tabName;
        
        // Update button states
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('border-primary', 'text-primary');
            b.classList.add('border-transparent', 'text-gray-600');
        });
        btn.classList.add('border-primary', 'text-primary');
        btn.classList.remove('border-transparent', 'text-gray-600');
        
        // Show/hide content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    });
});



// Event listeners
document.getElementById('backToTeam').addEventListener('click', goBackToTeam);
document.getElementById('saveLineup').addEventListener('click', saveLineup);
document.getElementById('resetLineup').addEventListener('click', resetLineup);

// Load on page load
loadCoach();
