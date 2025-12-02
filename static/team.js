// NHL Fan Hub - Team Details
let currentTeamId = null;
let allPlayers = [];
let rosterSortKey = 'POINTS';
let rosterSearchTerm = '';

document.addEventListener('DOMContentLoaded', function() {
    // Get team ID from URL query parameter
    const params = new URLSearchParams(window.location.search);
    currentTeamId = params.get('id');
    
    if (!currentTeamId) {
        // Try to get from URL path if using routing
        const pathParts = window.location.pathname.split('/');
        currentTeamId = pathParts[pathParts.length - 1];
    }
    
    if (currentTeamId) {
        loadTeamDetails();
        loadRoster();
    } else {
        showError('No team selected. Please go back and select a team.');
    }
    
    // Setup filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            applyFilterAndSort(this.dataset.position);
        });
    });

    // Search input
    const searchInput = document.getElementById('rosterSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            rosterSearchTerm = searchInput.value.toLowerCase();
            applyFilterAndSort(document.querySelector('.filter-btn.active')?.dataset.position || 'ALL');
        });
    }

    // Sort select
    const sortSelect = document.getElementById('rosterSort');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            rosterSortKey = sortSelect.value;
            applyFilterAndSort(document.querySelector('.filter-btn.active')?.dataset.position || 'ALL');
        });
    }
});

async function loadTeamDetails() {
    try {
        const response = await fetch(`/api/team/${currentTeamId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.teams && data.teams.length > 0) {
            const team = data.teams[0];
            displayTeamDetails(team);
        } else {
            showError('Team not found');
        }
    } catch (error) {
        console.error('Error loading team details:', error);
        showError(`Error loading team details: ${error.message}`);
    }
}

function displayTeamDetails(team) {
    const teamHeader = document.getElementById('teamHeader');
    const teamRecordSection = document.getElementById('teamRecordSection');
    const loading = document.getElementById('loading');
    
    // Use the full team name from API (e.g., "Buffalo Sabres")
    document.getElementById('teamName').textContent = team.name;
    document.getElementById('teamDivision').textContent = `${team.division.name}`;
    document.getElementById('teamConference').textContent = `${team.conference.name}`;

    // Inject team logo if abbreviation available
    const logoContainer = document.getElementById('teamLogoContainer');
    if (logoContainer && team.abbreviation) {
        const logoEl = document.createElement('img');
        logoEl.alt = `${team.abbreviation || team.name} logo`;
        logoEl.className = 'w-20 h-20 object-contain drop-shadow-md';
        logoEl.src = `https://assets.nhle.com/logos/nhl/svg/${team.abbreviation.toUpperCase()}_light.svg`;
        logoEl.onerror = () => {
            if (!logoEl.dataset.alt) {
                logoEl.dataset.alt = '1';
                logoEl.src = logoEl.src.replace('_light', '_dark');
            } else { logoEl.classList.add('hidden'); }
        };
        logoContainer.innerHTML = '';
        logoContainer.appendChild(logoEl);
    }
    
    // Display record
    if (team.record && team.record.length > 0) {
        const record = team.record[0];
        document.getElementById('wins').textContent = record.wins || 0;
        document.getElementById('losses').textContent = record.losses || 0;
        document.getElementById('otLosses').textContent = record.overtimeLosses || 0;
        document.getElementById('points').textContent = record.points || 0;
        document.getElementById('gamesPlayed').textContent = record.gamesPlayed || 0;
        teamRecordSection.classList.remove('hidden');
    }
    
    teamHeader.classList.remove('hidden');
    loading.classList.add('hidden');
}

async function loadRoster() {
    try {
        const response = await fetch(`/api/roster/${currentTeamId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.players) {
            allPlayers = data.players;
            applyFilterAndSort('ALL');
        }
    } catch (error) {
        console.error('Error loading roster:', error);
        showError(`Error loading roster: ${error.message}`);
    }
}

function displayRoster(players) {
    const rosterBody = document.getElementById('rosterBody');
    const rosterSection = document.getElementById('rosterSection');

    rosterBody.innerHTML = '';

    if (players && players.length > 0) {
        players.forEach(player => {
            const card = createPlayerCard(player);
            // Navigate to player page on click
            card.addEventListener('click', function() {
                window.location.href = `/player/${player.id}`;
            });
            rosterBody.appendChild(card);
        });
        rosterSection.classList.remove('hidden');
    } else {
        rosterBody.innerHTML = '<div class="no-players">No players found</div>';
        rosterSection.classList.remove('hidden');
    }
}

function createPlayerRow(player) {
    const row = document.createElement('tr');
    row.className = `player-row position-${player.position}`;
    row.dataset.position = player.position;
    
    const stats = player.stats || {};
    
    row.innerHTML = `
        <td class="number">${player.number}</td>
        <td class="name">${player.name}</td>
        <td class="position">${player.fullPosition}</td>
        <td>${stats.games || 0}</td>
        <td>${stats.goals || 0}</td>
        <td>${stats.assists || 0}</td>
        <td>${stats.points || 0}</td>
        <td>${stats.plusMinus !== undefined ? (stats.plusMinus >= 0 ? '+' : '') + stats.plusMinus : '-'}</td>
        <td>${stats.pim || 0}</td>
    `;
    
    return row;
}

function createPlayerCard(player) {
    const col = document.createElement('div');
    col.className = `player-card roster-card position-${player.position}`;
    col.dataset.position = player.position;

    const stats = player.stats || {};

    // Different display for goalies vs skaters
    let statHtml = '';
    if (player.position === 'G') {
        statHtml = `
            <div class="stat"><span class="label">GP</span><span class="value">${stats.games || 0}</span></div>
            <div class="stat"><span class="label">W</span><span class="value">${stats.wins || 0}</span></div>
            <div class="stat"><span class="label">L</span><span class="value">${stats.losses || 0}</span></div>
            <div class="stat"><span class="label">GAA</span><span class="value">${stats.gaa || '-'}</span></div>
            <div class="stat"><span class="label">SV%</span><span class="value">${stats.savePercentage || '-'}</span></div>
        `;
    } else {
        statHtml = `
            <div class="stat"><span class="label">GP</span><span class="value">${stats.games || 0}</span></div>
            <div class="stat"><span class="label">G</span><span class="value">${stats.goals || 0}</span></div>
            <div class="stat"><span class="label">A</span><span class="value">${stats.assists || 0}</span></div>
            <div class="stat"><span class="label">Pts</span><span class="value">${stats.points || 0}</span></div>
            <div class="stat"><span class="label">+/-</span><span class="value">${stats.plusMinus !== undefined ? (stats.plusMinus >= 0 ? '+' : '') + stats.plusMinus : '-'}</span></div>
        `;
    }

    col.innerHTML = `
        <div class="player-photo">
            <img src="${player.photo || '/static/img/placeholder-player.png'}" alt="${player.name}">
        </div>
        <div class="player-info">
            <div class="player-top">
                <div class="player-number">#${player.number}</div>
                <div class="player-name" title="${player.name}">${player.name}</div>
                <div class="player-pos">${player.fullPosition}</div>
            </div>
            <div class="player-stats">
                ${statHtml}
            </div>
        </div>
    `;

    return col;
}

function filterRoster(position) {
    // Deprecated: sorting is handled by applyFilterAndSort
    applyFilterAndSort(position);
}

function applyFilterAndSort(position) {
    if (!allPlayers) return;

    // Filter players by position
    let filtered = [];
    if (position === 'ALL') {
        filtered = allPlayers.slice();
    } else {
        filtered = allPlayers.filter(p => p.position === position);
    }

    // Apply search term
    if (rosterSearchTerm) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(rosterSearchTerm));
    }

    // Determine sort value extractor
    const getSortVal = (p) => {
        const s = p.stats || {};
        switch (rosterSortKey) {
            case 'GOALS': return s.goals || 0;
            case 'ASSISTS': return s.assists || 0;
            case 'GAMES': return s.games || 0;
            case 'SAVE%': return (p.position === 'G') ? (s.savePercentage || 0) : 0;
            case 'GAA': return (p.position === 'G') ? (s.gaa ? -s.gaa : 0) : 0; // inverse for GAA (lower better)
            case 'POINTS':
            default: return s.points || 0;
        }
    };

    filtered.sort((a,b) => getSortVal(b) - getSortVal(a));

    displayRoster(filtered);
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    const loading = document.getElementById('loading');
    
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    loading.classList.add('hidden');
}

// Player modal fetching and rendering
async function showPlayerModal(playerId) {
    const modal = document.getElementById('playerModal');
    const details = document.getElementById('playerDetails');
    details.innerHTML = '<div class="text-center py-6 text-gray-500">Loading player details...</div>';
    modal.classList.remove('hidden');

    try {
        const resp = await fetch(`/api/player/${playerId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Build details HTML from landing data
        const headshot = data.headshot || data.heroImage || '';
        const name = `${data.firstName || data.firstName || ''} ${data.lastName || data.lastName || ''}`.trim() || data.playerSlug || '';
        const pos = data.position || data.primaryPosition || data.position || '';
        const team = data.teamCommonName || data.currentTeamAbbrev || data.currentTeamRoster || '';
        const birthDate = data.birthDate || '';
        const birthPlace = [data.birthCity, data.birthStateProvince, data.birthCountry].filter(Boolean).join(', ');

        let statsHtml = '';
        // Featured stats
        if (data.featuredStats && data.featuredStats.regularSeason && data.featuredStats.regularSeason.subSeason) {
            const s = data.featuredStats.regularSeason.subSeason;
            const entries = [];
            if (s.gamesPlayed !== undefined) entries.push(`<div class="stat"><strong>GP:</strong> ${s.gamesPlayed}</div>`);
            if (s.goals !== undefined) entries.push(`<div class="stat"><strong>G:</strong> ${s.goals}</div>`);
            if (s.assists !== undefined) entries.push(`<div class="stat"><strong>A:</strong> ${s.assists}</div>`);
            if (s.points !== undefined) entries.push(`<div class="stat"><strong>PTS:</strong> ${s.points}</div>`);
            if (s.plusMinus !== undefined) entries.push(`<div class="stat"><strong>+/-:</strong> ${s.plusMinus}</div>`);
            if (s.pim !== undefined) entries.push(`<div class="stat"><strong>PIM:</strong> ${s.pim}</div>`);
            if (s.shots !== undefined) entries.push(`<div class="stat"><strong>SH:</strong> ${s.shots}</div>`);
            if (s.wins !== undefined) entries.push(`<div class="stat"><strong>W:</strong> ${s.wins}</div>`);
            if (s.losses !== undefined) entries.push(`<div class="stat"><strong>L:</strong> ${s.losses}</div>`);
            if (s.gaa !== undefined) entries.push(`<div class="stat"><strong>GAA:</strong> ${s.gaa}</div>`);
            if (s.savePercentage !== undefined) entries.push(`<div class="stat"><strong>SV%:</strong> ${s.savePercentage}</div>`);
            statsHtml = `<div class="player-detail-stats">${entries.join('')}</div>`;
        }

        const bioHtml = `
            <div class="player-detail-grid">
                <div class="player-detail-photo"><img src="${headshot || '/static/img/placeholder-player.png'}" alt="${name}"></div>
                <div>
                    <h2>${data.firstName || ''} ${data.lastName || ''}</h2>
                    <div class="player-detail-row"><strong>Position:</strong> ${data.position || data.primaryPosition || ''}</div>
                    <div class="player-detail-row"><strong>Team:</strong> ${data.teamCommonName || data.currentTeamAbbrev || ''}</div>
                    <div class="player-detail-row"><strong>Born:</strong> ${birthDate} ${birthPlace ? ' — ' + birthPlace : ''}</div>
                    <div class="player-detail-row">${data.twitterLink ? `<a href="${data.twitterLink}" target="_blank">@${data.twitterLink.split('/').pop()}</a>` : ''}</div>
                    ${statsHtml}
                </div>
            </div>
        `;

        details.innerHTML = bioHtml;
    } catch (err) {
        details.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Error loading player: ${err.message}</div>`;
    }

    // Close handlers
    closeBtn.onclick = () => { modal.classList.add('hidden'); };
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
}

// Trivia button handler
document.getElementById('triviaBtn')?.addEventListener('click', function() {
    if (currentTeamId) {
        window.location.href = `/trivia?team=${currentTeamId}`;
    }
});
