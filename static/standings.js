// NHL Standings Page
let allTeams = [];
let currentFilter = 'league';

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

    // Sort by points (descending), then by wins as tiebreaker
    filteredTeams.sort((a, b) => {
        if (b.record.points !== a.record.points) {
            return b.record.points - a.record.points;
        }
        return b.record.wins - a.record.wins;
    });

    // Calculate games played and points percentage
    filteredTeams.forEach((team, index) => {
        const gp = team.record.wins + team.record.losses + team.record.overtimeLosses;
        const maxPoints = gp * 2; // Maximum possible points
        const pointsPct = maxPoints > 0 ? ((team.record.points / maxPoints) * 100).toFixed(1) : '0.0';
        
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition';
        
        const logoUrl = team.abbrev ? `https://assets.nhle.com/logos/nhl/svg/${team.abbrev.toUpperCase()}_light.svg` : '';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-lg font-bold text-gray-700">${index + 1}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <a href="/team/${team.id}" class="flex items-center gap-3 hover:text-primary transition group">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${team.abbrev}" class="w-8 h-8 object-contain" onerror="this.style.display='none'">` : ''}
                    <div>
                        <div class="font-bold text-gray-900 group-hover:text-primary">${team.name}</div>
                        <div class="text-xs text-gray-500">${team.division}</div>
                    </div>
                </a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-gray-700">${gp}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-semibold text-green-600">${team.record.wins}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-semibold text-red-600">${team.record.losses}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-semibold text-yellow-600">${team.record.overtimeLosses}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-primary text-white">
                    ${team.record.points}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-gray-700 font-medium">${pointsPct}</td>
        `;
        
        tbody.appendChild(row);
    });
}
