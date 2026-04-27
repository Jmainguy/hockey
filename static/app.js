// NHL Fan Hub - Main App
let teamsRetryTimer = null;
let teamsBackoff = 0; // exponent counter
const teamsBaseDelay = 10000; // 10s base
const teamsMaxDelay = 5 * 60 * 1000; // 5 minutes max

document.addEventListener('DOMContentLoaded', function() {
    loadPlayoffBracket();
    loadTeams();
});

function logoForTeam(t) {
    if (!t) return '';
    const a = (t.abbrev || '').toString().toUpperCase();
    if (t.logo) return t.logo;
    if (a) return `https://assets.nhle.com/logos/nhl/svg/${a}_light.svg`;
    return '';
}

function renderPlayoffMatchup(s, seasonId) {
    const top = s.topSeedTeam;
    const bot = s.bottomSeedTeam;
    if (!top || !bot) return '';
    const letter = (s.seriesLetter != null && String(s.seriesLetter).length)
        ? String(s.seriesLetter).charAt(0).toUpperCase()
        : 'A';
    const sid = (seasonId || '').toString();
    const seriesHref = sid ? ('/playoff-series/' + encodeURIComponent(sid) + '/' + encodeURIComponent(letter)) : '#';
    const tw = s.topSeedWins != null ? s.topSeedWins : 0;
    const bw = s.bottomSeedWins != null ? s.bottomSeedWins : 0;
    const winId = s.winningTeamId;
    const topWon = winId != null && winId === top.id;
    const botWon = winId != null && winId === bot.id;
    const topLogo = logoForTeam(top);
    const botLogo = logoForTeam(bot);
    const topAbbr = (top.abbrev || '').toString().toUpperCase();
    const botAbbr = (bot.abbrev || '').toString().toUpperCase();
    const topName = (top.name && top.name.default) ? top.name.default : topAbbr;
    const botName = (bot.name && bot.name.default) ? bot.name.default : botAbbr;
    return `
        <a href="${seriesHref}" class="block rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-100 hover:ring-2 hover:ring-accent/50 transition ring-offset-2">
            <div class="flex-1 flex items-center justify-between gap-3 p-4 sm:p-5 ${topWon ? 'bg-amber-50/80' : ''}">
                <div class="flex items-center gap-3 min-w-0">
                    ${topLogo ? `<img src="${topLogo}" alt="" class="h-12 w-12 sm:h-14 sm:w-14 object-contain flex-shrink-0" onerror="this.onerror=null;this.src='https://assets.nhle.com/logos/nhl/svg/${topAbbr}_dark.svg'">` : ''}
                    <div class="min-w-0">
                        <div class="text-xs text-gray-500 font-semibold">${topAbbr}</div>
                        <div class="font-bold text-gray-900 truncate" title="${topName}">${topName}</div>
                    </div>
                </div>
                <div class="text-3xl font-black text-primary tabular-nums">${tw}</div>
            </div>
            <div class="hidden sm:flex items-center justify-center px-2 text-gray-400 text-sm font-semibold">vs</div>
            <div class="flex-1 flex items-center justify-between gap-3 p-4 sm:p-5 sm:flex-row-reverse text-right sm:text-left ${botWon ? 'bg-amber-50/80' : ''}">
                <div class="text-3xl font-black text-primary tabular-nums sm:order-2">${bw}</div>
                <div class="flex items-center gap-3 min-w-0 sm:order-1 sm:flex-row-reverse sm:flex-1 sm:justify-end">
                    <div class="min-w-0 sm:text-right">
                        <div class="text-xs text-gray-500 font-semibold">${botAbbr}</div>
                        <div class="font-bold text-gray-900 truncate" title="${botName}">${botName}</div>
                    </div>
                    ${botLogo ? `<img src="${botLogo}" alt="" class="h-12 w-12 sm:h-14 sm:w-14 object-contain flex-shrink-0" onerror="this.onerror=null;this.src='https://assets.nhle.com/logos/nhl/svg/${botAbbr}_dark.svg'">` : ''}
                </div>
            </div>
        </a>`;
}

function roundLabelFromNumber(n) {
    switch (n) {
        case 1: return 'First round';
        case 2: return 'Second round';
        case 3: return 'Conference finals';
        case 4: return 'Stanley Cup Final';
        default: return `Round ${n}`;
    }
}

async function loadPlayoffBracket() {
    const section = document.getElementById('playoffSection');
    const root = document.getElementById('playoffBracket');
    if (!section || !root) return;
    try {
        const response = await fetch('/api/playoff-bracket');
        if (!response.ok) return;
        const data = await response.json();
        if (!data.series || !data.series.length) return;
        const seasonId = (data.seasonId != null) ? String(data.seasonId) : '';
        const byRound = {};
        for (const s of data.series) {
            const r = s.playoffRound != null ? s.playoffRound : 0;
            if (!byRound[r]) byRound[r] = [];
            byRound[r].push(s);
        }
        const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
        const html = rounds.map((roundNum) => {
            const list = byRound[roundNum];
            list.sort((a, b) => (a.seriesLetter || '').localeCompare(b.seriesLetter || ''));
            const label = (list[0] && list[0].seriesTitle) ? list[0].seriesTitle : roundLabelFromNumber(roundNum);
            const cards = list.map((s) => renderPlayoffMatchup(s, seasonId)).join('');
            return `
                <div>
                    <h3 class="text-lg font-extrabold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="text-accent">●</span>${label}
                    </h3>
                    <div class="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2">${cards}</div>
                </div>`;
        }).join('');
        root.innerHTML = html;
        section.classList.remove('hidden');
    } catch (e) {
        console.warn('loadPlayoffBracket:', e);
    }
}

async function loadTeams() {
    try {
        const response = await fetch('/api/teams');
        if (!response.ok) {
            console.warn('loadTeams received non-OK response:', response.status);
            // Keep showing loading UI and retry in background
            scheduleTeamsRetry();
            return;
        }
        const data = await response.json();
        
        const teamsGrid = document.getElementById('teamsGrid');
        const teamLoading = document.getElementById('teamLoading');
        
        teamsGrid.innerHTML = '';
        // Reset backoff on successful fetch
        teamsBackoff = 0;
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
                    
                    // Sort teams by standings (points descending, then wins as tiebreaker)
                    divisions[divisionName].sort((a, b) => {
                        if (b.record.points !== a.record.points) {
                            return b.record.points - a.record.points;
                        }
                        return b.record.wins - a.record.wins;
                    });
                    
                    // Create team cards for this division
                    divisions[divisionName].forEach(team => {
                        const card = createTeamCard(team);
                        teamsGrid.appendChild(card);
                    });
                });
            });
            // Populate searchable datalist for quick navigation
            const datalist = document.getElementById('teamsDatalist');
            const teamSearch = document.getElementById('teamSearch');
            if (datalist && teamSearch) {
                datalist.innerHTML = '';
                data.teams.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.name;
                    opt.dataset.id = t.id;
                    datalist.appendChild(opt);
                });

                // Do not pre-select or persist last chosen team; start with empty search each visit
                teamSearch.value = '';
                teamSearch.addEventListener('change', () => {
                    const name = teamSearch.value;
                    // find team by name (case-sensitive match expected from datalist)
                    const found = data.teams.find(t => t.name === name);
                    if (found) {
                        const ab = (found.abbrev || found.abbrev || '').toString().toLowerCase();
                        window.location.href = `/team/${ab || found.id}`;
                    }
                });
            }

            // Mobile team picker wiring
            const mobileBtn = document.getElementById('mobileTeamPickerBtn');
            const mobileModal = document.getElementById('mobileTeamPicker');
            const mobileClose = document.getElementById('mobileTeamPickerClose');
            const mobileFilter = document.getElementById('mobileTeamFilter');
            const mobileList = document.getElementById('mobileTeamList');

            if (mobileBtn && mobileModal && mobileClose && mobileFilter && mobileList) {
                // populate list
                function renderMobileList(filter) {
                    mobileList.innerHTML = '';
                    const teams = data.teams.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''));
                    teams.filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase()))
                         .forEach(t => {
                        const btn = document.createElement('button');
                        btn.className = 'w-full p-3 bg-white rounded-lg shadow text-left flex items-center gap-3';
                        // Prefer a team-provided wordmark, otherwise NHL svg logo, otherwise fallback initials
                        const abbrev = (t.abbrev||t.abbreviation||'').toString().toUpperCase();
                        const wordmark = (t.wordmarkUrl || t.wordmark || '');
                        const logoSrc = wordmark || (abbrev ? `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg` : '');

                        let imgHTML = '';
                        if (logoSrc) {
                            imgHTML = `<img src="${logoSrc}" alt="${t.name}" class="h-10 w-20 object-contain" onerror="this.dataset.err=1;this.src='https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg'">`;
                        } else {
                            imgHTML = `<div class="w-10 h-10 flex items-center justify-center bg-gray-100 rounded text-sm font-semibold">${abbrev.slice(0,3)}</div>`;
                        }

                        const title = `<div class="flex-1"><div class=\"text-base font-bold text-gray-900\">${t.name}</div><div class=\"text-sm text-gray-600\">${abbrev} • ${t.record?.points ?? ''} pts</div></div>`;

                        btn.innerHTML = `<div class=\"flex-shrink-0\">${imgHTML}</div>${title}`;
                        btn.addEventListener('click', () => {
                            const ab = (t.abbrev || t.abbreviation || '').toString().toLowerCase();
                            window.location.href = `/team/${ab || t.id}`;
                        });
                        mobileList.appendChild(btn);
                    });
                }

                mobileBtn.addEventListener('click', () => {
                    renderMobileList('');
                    mobileModal.classList.remove('hidden');
                    mobileFilter.value = '';
                    mobileFilter.focus();
                });

                mobileClose.addEventListener('click', () => mobileModal.classList.add('hidden'));
                mobileFilter.addEventListener('input', (e) => renderMobileList(e.target.value));
            }
        } else {
            teamsGrid.innerHTML = '<p>No teams found</p>';
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        // Keep showing the loading message and retry after 10s
        scheduleTeamsRetry();
    }
}

function scheduleTeamsRetry() {
    // Avoid multiple timers
    if (teamsRetryTimer) return;
    const teamLoading = document.getElementById('teamLoading');
    // compute exponential backoff delay
    teamsBackoff = Math.min(teamsBackoff + 1, 10); // cap exponent to avoid overflow
    let delay = teamsBaseDelay * Math.pow(2, teamsBackoff - 1);
    if (delay > teamsMaxDelay) delay = teamsMaxDelay;

    let remaining = Math.floor(delay / 1000);
    if (teamLoading) {
        teamLoading.style.display = '';
        teamLoading.textContent = `Loading teams... retrying in ${remaining}s`;
    }

    teamsRetryTimer = setInterval(() => {
        remaining -= 1;
        if (teamLoading) teamLoading.textContent = `Loading teams... retrying in ${remaining}s`;
        if (remaining <= 0) {
            clearInterval(teamsRetryTimer);
            teamsRetryTimer = null;
            loadTeams();
        }
    }, 1000);
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
    a.href = `/team/${(team.abbrev || team.abbrev || '').toString().toLowerCase()}`;
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
