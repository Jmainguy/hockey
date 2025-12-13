// NHL Standings Page
let allTeams = [];
let currentFilter = 'league';
let sortState = { key: 'points', dir: 'desc' }; // default sort

document.addEventListener('DOMContentLoaded', function() {
    loadStandings();
    setupFilters();
});

function setupFilters() {
    const filters = {
        'filterLeague': 'league',
        'filterEastern': 'Eastern',
        'filterWestern': 'Western',
        'filterAtlantic': 'Atlantic',
        'filterMetropolitan': 'Metropolitan',
        'filterCentral': 'Central',
        'filterPacific': 'Pacific'
    };

    Object.keys(filters).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                // Update active state
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Apply filter
                currentFilter = filters[btnId];
                renderStandings();
            });
        }
    });
}

async function loadStandings() {
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const container = document.getElementById('standingsContainer');

    try {
        const response = await fetch('/api/teams');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.teams && data.teams.length > 0) {
            allTeams = data.teams;
            loading.style.display = 'none';
            container.classList.remove('hidden');
            renderStandings();
        } else {
            throw new Error('No teams data received');
        }
    } catch (error) {
        console.error('Error loading standings:', error);
        loading.style.display = 'none';
        errorDiv.textContent = `Error loading standings: ${error.message}`;
        errorDiv.classList.remove('hidden');
    }
}

function renderStandings() {
    const tbody = document.getElementById('standingsBody');
    tbody.innerHTML = '';
    const cardsRoot = document.getElementById('standingsCards');
    if (cardsRoot) cardsRoot.innerHTML = '';

    // Filter teams based on current filter
    let filteredTeams = allTeams;
    
    if (currentFilter === 'league') {
        // Show all teams
        filteredTeams = [...allTeams];
    } else if (currentFilter === 'Eastern' || currentFilter === 'Western') {
        // Filter by conference
        filteredTeams = allTeams.filter(team => team.conference === currentFilter);
    } else {
        // Filter by division
        filteredTeams = allTeams.filter(team => team.division === currentFilter);
    }

    // Sort using sortState
    const compare = (a, b) => {
        const key = sortState.key;
        let va, vb;
        switch (key) {
            case 'rank':
                va = a._originalIndex || 0; vb = b._originalIndex || 0; break;
            case 'name':
                va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
            case 'gp':
                va = (a.record && (a.record.wins + a.record.losses + a.record.overtimeLosses)) || 0; vb = (b.record && (b.record.wins + b.record.losses + b.record.overtimeLosses)) || 0; break;
            case 'wins':
                va = a.record ? a.record.wins : 0; vb = b.record ? b.record.wins : 0; break;
            case 'losses':
                va = a.record ? a.record.losses : 0; vb = b.record ? b.record.losses : 0; break;
            case 'otl':
                va = a.record ? a.record.overtimeLosses : 0; vb = b.record ? b.record.overtimeLosses : 0; break;
            case 'points':
                va = a.record ? a.record.points : 0; vb = b.record ? b.record.points : 0; break;
            case 'gf':
                va = a.goalsFor || 0; vb = b.goalsFor || 0; break;
            case 'ga':
                va = a.goalsAgainst || 0; vb = b.goalsAgainst || 0; break;
            case 'diff':
                va = (a.goalDiff !== undefined && a.goalDiff !== null) ? a.goalDiff : 0; vb = (b.goalDiff !== undefined && b.goalDiff !== null) ? b.goalDiff : 0; break;
            case 'l10':
                // try parse L10 as x-y-z, fallback to 0
                va = parseL10Value(a.lastTen); vb = parseL10Value(b.lastTen); break;
            case 'streak':
                va = parseStreakValue(a.streak); vb = parseStreakValue(b.streak); break;
            case 'winpct':
                va = a.winPct || 0; vb = b.winPct || 0; break;
            case 'ppct':
                va = calcPointsPct(a); vb = calcPointsPct(b); break;
            default:
                va = a.record ? a.record.points : 0; vb = b.record ? b.record.points : 0;
        }

        if (typeof va === 'string' && typeof vb === 'string') {
            return va.localeCompare(vb) * (sortState.dir === 'asc' ? 1 : -1);
        }
        if (va < vb) return sortState.dir === 'asc' ? -1 : 1;
        if (va > vb) return sortState.dir === 'asc' ? 1 : -1;
        // tiebreakers: points then wins
        if (a.record && b.record) {
            if (a.record.points !== b.record.points) return (a.record.points - b.record.points) * -1;
            if (a.record.wins !== b.record.wins) return (a.record.wins - b.record.wins) * -1;
        }
        return 0;
    };

    // attach original index for stable rank sorting
    filteredTeams.forEach((t, i) => t._originalIndex = i + 1);
    filteredTeams.sort(compare);

    // Calculate games played and points percentage
    filteredTeams.forEach((team, index) => {
        const gp = team.record.wins + team.record.losses + team.record.overtimeLosses;
        const maxPoints = gp * 2; // Maximum possible points
        const pointsPct = maxPoints > 0 ? ((team.record.points / maxPoints) * 100).toFixed(1) : '0.0';
        
        // Desktop row
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition';
        
        const logoUrl = team.abbrev ? `https://assets.nhle.com/logos/nhl/svg/${team.abbrev.toUpperCase()}_light.svg` : '';
        
        row.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="text-lg font-bold text-gray-700">${index + 1}</span>
            </td>
            <td class="px-6 py-3 whitespace-nowrap">
                <a href="/team/${(team.abbrev || '').toString().toLowerCase()}" class="flex items-center gap-3 hover:text-primary transition group">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${team.abbrev}" class="w-8 h-8 object-contain" onerror="this.style.display='none'">` : ''}
                    <div>
                        <div class="font-bold text-gray-900 group-hover:text-primary">${team.name}</div>
                        <div class="text-xs text-gray-500">${team.division}</div>
                    </div>
                </a>
            </td>
            <td class="px-3 py-3 whitespace-nowrap text-center text-gray-700">${gp}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center font-semibold text-green-600">${team.record.wins}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center font-semibold text-red-600">${team.record.losses}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center font-semibold text-yellow-600">${team.record.overtimeLosses}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-primary text-white">
                    ${team.record.points}
                </span>
            </td>
            <td class="px-3 py-3 whitespace-nowrap text-center text-gray-700">${team.goalsFor ?? '-'}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center text-gray-700">${team.goalsAgainst ?? '-'}</td>
            <td class="px-3 py-3 whitespace-nowrap text-center text-gray-700">${team.goalDiff !== undefined && team.goalDiff !== null ? (team.goalDiff>=0?`+${team.goalDiff}`:team.goalDiff) : '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center text-gray-700">${team.lastTen || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center text-gray-700">${team.streak || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center text-gray-700">${(team.winPct !== undefined && team.winPct !== null) ? (Number(team.winPct)*100).toFixed(1)+'%' : '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-center text-gray-700 font-medium">${pointsPct}</td>
        `;
        tbody.appendChild(row);

        // Mobile card
        if (cardsRoot) {
            const a = document.createElement('a');
            a.href = `/team/${(team.abbrev || '').toString().toLowerCase()}`;
            a.className = 'block';
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow mb-3 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
            const left = document.createElement('div');
            left.className = 'flex items-center gap-3 min-w-0';
            const imgHtml = logoUrl ? `<img src="${logoUrl}" alt="${team.abbrev}" class="w-12 h-12 object-contain flex-shrink-0" onerror="this.style.display='none'">` : `<div class="w-12 h-12 bg-gray-100 flex items-center justify-center rounded">${(team.abbrev||'').substring(0,3).toUpperCase()}</div>`;
            left.innerHTML = `${imgHtml}<div class="min-w-0"><div class="font-bold text-gray-900 truncate">${team.name}</div><div class="text-xs text-gray-500 truncate">${team.division}</div></div>`;
            const right = document.createElement('div');
            right.className = 'text-sm mt-2 sm:mt-0 sm:text-right';
            const gf = team.goalsFor || '-';
            const ga = team.goalsAgainst || '-';
            const diff = (team.goalDiff !== undefined && team.goalDiff !== null) ? (team.goalDiff >= 0 ? `+${team.goalDiff}` : `${team.goalDiff}`) : '-';
            const l10 = team.lastTen || '-';
            const strk = team.streak || '-';
            right.innerHTML = `
                <div class="text-gray-700 font-semibold">${team.record.points} pts</div>
                <div class="text-gray-500">GP ${gp} • W ${team.record.wins} • L ${team.record.losses} • OTL ${team.record.overtimeLosses}</div>
                <div class="text-gray-500">GF ${gf} • GA ${ga} • Diff ${diff}</div>
                <div class="text-gray-500">L10 ${l10} • Strk ${strk}</div>
                <div class="text-gray-500">Win% ${(team.winPct !== undefined && team.winPct !== null) ? (Number(team.winPct)*100).toFixed(1)+'%' : '-'}</div>
                <div class="text-gray-500">P% ${pointsPct}</div>
            `;
            card.appendChild(left);
            card.appendChild(right);
            a.appendChild(card);
            cardsRoot.appendChild(a);
        }
    });

    // Attach click handlers to headers for sorting (desktop only)
    const table = document.querySelector('.min-w-full');
    if (table) {
        const headers = table.querySelectorAll('th[data-sort]');
        headers.forEach(h => {
            h.style.cursor = 'pointer';
            // Add indicator
            if (!h.querySelector('.sort-ind')) {
                const span = document.createElement('span');
                span.className = 'sort-ind ml-2 text-xs';
                h.appendChild(span);
            }
            h.onclick = () => {
                const key = h.getAttribute('data-sort');
                if (sortState.key === key) {
                    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortState.key = key;
                    sortState.dir = 'desc';
                }
                // update visual indicators
                headers.forEach(h2 => {
                    const ind = h2.querySelector('.sort-ind');
                    if (h2.getAttribute('data-sort') === sortState.key) {
                        ind.textContent = sortState.dir === 'asc' ? '▲' : '▼';
                    } else {
                        ind.textContent = '';
                    }
                });
                renderStandings();
            };
        });
    }
}

function parseL10Value(lastTen) {
    if (!lastTen) return 0;
    const m = String(lastTen).match(/(\d+)-(\d+)-(\d+)/);
    if (!m) return 0;
    // score L10 by wins*3 + otl*1 (simple heuristic)
    return parseInt(m[1], 10) * 3 + parseInt(m[3], 10);
}

function parseStreakValue(streak) {
    if (!streak) return 0;
    // expecting formats like W3 or L2 or 'W1'
    const m = String(streak).match(/([WL])([0-9]+)/i);
    if (!m) return 0;
    const sign = (m[1].toUpperCase() === 'W') ? 1 : -1;
    return sign * parseInt(m[2], 10);
}

function calcPointsPct(team) {
    const gp = (team.record && (team.record.wins + team.record.losses + team.record.overtimeLosses)) || 0;
    const max = gp * 2;
    return max > 0 && team.record ? (team.record.points / max) : 0;
}
