// Renders the shared team header used across team pages (team, schedule, coach, trivia)
(function() {
    function buildHeader() {
        const container = document.getElementById('teamHeaderContainer');
        if (!container) return;

        container.innerHTML = `
                <section id="teamHeader" class="hidden bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl shadow-md p-4 sm:p-6 mb-6">
                    <div class="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div class="flex items-start sm:items-center gap-4 w-full sm:w-auto">
                            <div id="teamLogoContainer" class="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0"></div>
                            <div class="flex-1 min-w-0">
                                <h2 id="teamName" class="text-2xl sm:text-3xl font-bold mb-2 truncate"></h2>
                                <div class="flex gap-2 text-sm flex-wrap">
                                    <span id="teamDivision" class="px-2 py-1 bg-white/20 text-white rounded-full font-semibold text-xs"></span>
                                    <span id="teamConference" class="px-2 py-1 bg-white/20 text-white rounded-full font-semibold text-xs"></span>
                                </div>
                            </div>
                        </div>
                        <div class="flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-2">
                            <button id="scheduleBtn" class="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition">📅 Schedule</button>
                            <button id="coachBtn" class="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition">📋 Coach</button>
                            <button id="triviaBtn" class="w-full sm:w-auto px-4 py-2 bg-accent hover:bg-accent/90 text-gray-900 rounded-lg font-semibold transition">🎯 Trivia</button>
                            <a id="backToTeam" href="#" class="w-full sm:w-auto px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition backdrop-blur-sm">← Team</a>
                            <a id="homeBtn" href="/" class="w-full sm:w-auto px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold transition">🏠 Home</a>
                        </div>
                    </div>
                </section>
        `;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildHeader);
    } else {
        buildHeader();
    }
    
    // Populate the shared header elements with team data
    window.populateSharedHeader = function(team, suffix) {
        if (!team) return;
        // ensure header exists
        buildHeader();
        // helper to format a rank into a human-friendly label
        const formatRank = (r) => {
            if (!r && r !== 0) return '';
            if (r === 1) return 'Leader';
            if (r === 2) return '2nd';
            if (r === 3) return '3rd';
            return `${r}th`;
        };
        const logoContainer = document.getElementById('teamLogoContainer');
        const teamNameEl = document.getElementById('teamName');
        const divisionEl = document.getElementById('teamDivision');
        const conferenceEl = document.getElementById('teamConference');
        const backLink = document.getElementById('backToTeam');
        const teamHeader = document.getElementById('teamHeader');

        // Logo: prefer the team's primary logo; fallback to NHL asset, then wordmark
        if (logoContainer) {
            logoContainer.innerHTML = '';
            const img = document.createElement('img');
            img.alt = team.name || team.abbreviation || 'Team logo';
            img.className = 'w-20 h-20 object-contain drop-shadow-md';
            // prefer `team.logo` (primary logo), then NHL svg, then wordmark if nothing else
            img.src = team.logo || (team.abbreviation ? `https://assets.nhle.com/logos/nhl/svg/${team.abbreviation.toUpperCase()}_light.svg` : '') || team.wordmarkUrl || '';
            img.onerror = () => {
                if (!img.dataset.alt) {
                    img.dataset.alt = '1';
                    // try dark variant of NHL svg
                    img.src = img.src.replace('_light', '_dark');
                } else {
                    img.classList.add('hidden');
                }
            };
            logoContainer.appendChild(img);
        }

        // Name
        if (teamNameEl) {
            const title = suffix ? `${team.name} — ${suffix}` : (team.name || 'Team');
            // prefer wordmark in the name area; otherwise fall back to textual title
            if (team.wordmarkUrl) {
                teamNameEl.innerHTML = '';
                const wm = document.createElement('img');
                wm.src = team.wordmarkUrl;
                wm.alt = team.name;
                wm.className = 'h-8 object-contain';
                wm.onerror = () => { teamNameEl.textContent = team.name; };
                teamNameEl.appendChild(wm);
            } else {
                teamNameEl.textContent = title;
            }
        }

        // Show division/conference with ranks. If ranks are missing, compute them from /api/teams
        if (divisionEl && team.division && team.division.name) {
            const dr = team.divisionRank ? formatRank(team.divisionRank) : '';
            divisionEl.textContent = `${team.division.name}${dr ? ' - ' + dr : ''}`;
        }
        if (conferenceEl && team.conference && team.conference.name) {
            const cr = team.conferenceRank ? formatRank(team.conferenceRank) : '';
            conferenceEl.textContent = `${team.conference.name}${cr ? ' - ' + cr : ''}`;
        }

        // If ranks are not present, try to compute them asynchronously
        if ((!team.divisionRank || !team.conferenceRank) && (divisionEl || conferenceEl)) {
            (async function computeRanks() {
                try {
                    const resp = await fetch('/api/teams');
                    if (!resp.ok) return;
                    const data = await resp.json();
                    if (!data.teams || data.teams.length === 0) return;

                    const divisionTeams = data.teams
                        .filter(t => t.division === team.division.name)
                        .sort((a, b) => {
                            if (b.record.points !== a.record.points) return b.record.points - a.record.points;
                            return b.record.wins - a.record.wins;
                        });
                    const divisionRank = divisionTeams.findIndex(t => t.id === team.id) + 1;

                    const conferenceTeams = data.teams
                        .filter(t => t.conference === team.conference.name)
                        .sort((a, b) => {
                            if (b.record.points !== a.record.points) return b.record.points - a.record.points;
                            return b.record.wins - a.record.wins;
                        });
                    const conferenceRank = conferenceTeams.findIndex(t => t.id === team.id) + 1;

                    if (divisionEl) divisionEl.textContent = `${team.division.name} - ${formatRank(divisionRank)}`;
                    if (conferenceEl) conferenceEl.textContent = `${team.conference.name} - ${formatRank(conferenceRank)}`;
                } catch (e) {
                    // ignore
                }
            })();
        }

        if (backLink) {
            backLink.href = `/team/${(team.abbreviation || team.id || '').toString().toLowerCase()}`;
        }
        const homeBtn = document.getElementById('homeBtn');
        if (homeBtn) homeBtn.href = '/';

        if (teamHeader) teamHeader.classList.remove('hidden');

        // expose resolved id/abbrev for header nav handlers
        try { window._sharedHeaderTeamId = team.abbreviation ? team.abbreviation.toLowerCase() : (team.id || null); } catch (e) { /* ignore */ }
    };
    // Store a small helper to resolve a team id/abbrev from context
    function resolveTeamId() {
        if (window._sharedHeaderTeamId) return window._sharedHeaderTeamId;
        // try common globals
        if (window.currentTeamId) return window.currentTeamId;
        if (window.teamId) return window.teamId;
        // try URL query
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('team')) return params.get('team');
        } catch (e) {}
        // last resort: path segment
        const p = window.location.pathname.split('/').filter(Boolean);
        return p.length ? p[p.length - 1] : null;
    }

    // Use event delegation on the header container so handlers are robust and won't be lost
    function headerClickHandler(e) {
        const btn = e.target.closest('button, a');
        if (!btn) return;
        const id = resolveTeamId();
        // prefer anchors to behave normally unless we override
        if (btn.tagName.toLowerCase() === 'a') {
            // If this is the team link, ensure it points to team page
            if (btn.id === 'backToTeam') {
                if (id) {
                    e.preventDefault();
                    window.location.href = `/team/${id}`;
                }
            }
            return;
        }

        // Buttons: schedule, coach, trivia
        if (btn.id === 'scheduleBtn') {
            if (id) window.location.href = `/team-schedule/${id}`;
            return;
        }
        if (btn.id === 'coachBtn') {
            if (id) window.location.href = `/coach?team=${id}`;
            return;
        }
        if (btn.id === 'triviaBtn') {
            if (id) window.location.href = `/trivia?team=${id}`;
            return;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            const container = document.getElementById('teamHeaderContainer');
            if (container) container.addEventListener('click', headerClickHandler);
        });
    } else {
        const container = document.getElementById('teamHeaderContainer');
        if (container) container.addEventListener('click', headerClickHandler);
    }
})();
