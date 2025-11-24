// NHL Fan Hub - Main App
document.addEventListener('DOMContentLoaded', function() {
    loadTeams();
});

async function loadTeams() {
    try {
        const response = await fetch('/api/teams');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        const teamsGrid = document.getElementById('teamsGrid');
        const teamLoading = document.getElementById('teamLoading');
        
        teamsGrid.innerHTML = '';
        teamLoading.style.display = 'none';
        
        if (data.teams && data.teams.length > 0) {
            // Group teams by conference and division
            const conferences = {};
            data.teams.forEach(team => {
                const conf = team.conference || 'Unknown';
                const div = team.division || 'Unknown';
                if (!conferences[conf]) {
                    conferences[conf] = {};
                }
                if (!conferences[conf][div]) {
                    conferences[conf][div] = [];
                }
                conferences[conf][div].push(team);
            });
            
            // Order conferences: Eastern first, then Western
            const conferenceOrder = ['Eastern', 'Western'];
            const sortedConferences = conferenceOrder.filter(c => conferences[c]);
            // Add any other conferences not in the predefined order
            Object.keys(conferences).forEach(c => {
                if (!conferenceOrder.includes(c)) sortedConferences.push(c);
            });
            
            sortedConferences.forEach(conferenceName => {
                // Conference header
                const conferenceHeader = document.createElement('div');
                conferenceHeader.className = 'col-span-full mt-12 first:mt-0 mb-6 bg-gradient-to-r from-accent to-primary text-white px-8 py-6 rounded-2xl shadow-xl';
                conferenceHeader.innerHTML = `<h2 class="text-3xl font-extrabold tracking-tight flex items-center gap-4"><span class="text-4xl">★</span>${conferenceName} Conference</h2>`;
                teamsGrid.appendChild(conferenceHeader);
                
                // Sort divisions within conference
                const divisions = conferences[conferenceName];
                const sortedDivisions = Object.keys(divisions).sort();
                
                sortedDivisions.forEach(divisionName => {
                    // Division header
                    const divisionHeader = document.createElement('div');
                    divisionHeader.className = 'col-span-full mt-6 mb-4 bg-gradient-to-r from-primary to-secondary text-white px-6 py-4 rounded-xl shadow-md';
                    divisionHeader.innerHTML = `<h3 class="text-2xl font-bold tracking-tight flex items-center gap-3"><span class="text-accent">▶</span>${divisionName}</h3>`;
                    teamsGrid.appendChild(divisionHeader);
                    
                    // Sort teams by points (descending) within division
                    divisions[divisionName].sort((a, b) => b.record.points - a.record.points);
                    
                    // Create team cards for this division
                    divisions[divisionName].forEach(team => {
                        const card = createTeamCard(team);
                        teamsGrid.appendChild(card);
                    });
                });
            });
        } else {
            teamsGrid.innerHTML = '<p>No teams found</p>';
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        const teamsGrid = document.getElementById('teamsGrid');
        teamsGrid.innerHTML = `<p style="color: red;">Error loading teams: ${error.message}</p>`;
    }
}

function createTeamCard(team) {
    const wins = team.record.wins;
    const losses = team.record.losses;
    const otLosses = team.record.overtimeLosses;
    const points = team.record.points;
    const abbrev = (team.abbrev || '').toString().toUpperCase();
    const logoLight = abbrev ? `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg` : '';
    const logoDark = abbrev ? `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg` : '';

    const a = document.createElement('a');
    a.href = `/team/${team.id}`;
    a.className = 'group relative flex flex-col items-center rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-accent transition duration-200';
    a.setAttribute('aria-label', `View ${team.name} details`);

    // Logo element with fallback
    let logoHTML = '';
    if (abbrev) {
        logoHTML = `<img class="h-16 w-16 object-contain drop-shadow-sm" src="${logoLight}" alt="${abbrev} logo" onerror="if(!this.dataset.alt){this.dataset.alt='1';this.src='${logoDark}';}else{this.style.display='none';this.closest('a').querySelector('.logo-fallback').classList.remove('hidden');}" />`;
    }

    a.innerHTML = `
        <div class="flex flex-col items-center gap-3 w-full">
            <div class="relative">
                ${logoHTML}
                <div class="logo-fallback hidden h-16 w-16 rounded-full bg-primary/80 flex items-center justify-center text-white font-bold text-sm tracking-wider">${abbrev.slice(0,3)}</div>
            </div>
            <h3 class="text-lg font-bold text-gray-800 group-hover:text-primary tracking-tight text-center">${team.name}</h3>
            <div class="flex flex-col items-center gap-1 text-sm">
                <p class="font-semibold text-gray-700">${wins}W – ${losses}L – ${otLosses}OT</p>
                <p class="text-gray-600"><span class="font-semibold">${points}</span> pts</p>
            </div>
        </div>
        <div class="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition bg-[radial-gradient(circle_at_30%_20%,rgba(255,179,0,0.25),transparent_70%)]"></div>
    `;
    return a;
}
