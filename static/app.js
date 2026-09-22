// Barnwide - Main App
let teamsRetryTimer = null;
let teamsBackoff = 0; // exponent counter
const teamsBaseDelay = 10000; // 10s base
const teamsMaxDelay = 5 * 60 * 1000; // 5 minutes max

document.addEventListener('DOMContentLoaded', function() {
    if ([3,4,5].includes(new Date().getMonth())) loadPlayoffBracket();
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
        const response = await hockeyFetch('/api/playoff-bracket');
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
    const root = document.getElementById('teamsGrid');
    const loading = document.getElementById('teamLoading');
    try {
        const response = await hockeyFetch('/api/teams');
        if (!response.ok) throw new Error('Teams are temporarily unavailable.');
        const data = await response.json();
        const teams = data.teams || [];
        const render = () => {
            const query = document.getElementById('teamSearch').value.trim().toLowerCase();
            const filtered = teams.filter(t => `${t.name} ${t.abbrev}`.toLowerCase().includes(query));
            root.innerHTML = '';
            for (const conference of ['Eastern', 'Western']) {
                const group = filtered.filter(t => t.conference === conference);
                if (!group.length) continue;
                const section = document.createElement('section');
                section.className = 'conference-section';
                section.innerHTML = `<h2>${conference} Conference</h2>`;
                for (const division of [...new Set(group.map(t => t.division))].sort()) {
                    const block = document.createElement('div');
                    block.className = 'division-block';
                    const title = document.createElement('h3'); title.textContent = division; block.append(title);
                    group.filter(t => t.division === division).sort((a,b) => a.name.localeCompare(b.name)).forEach(t => {
                        const link = document.createElement('a'); link.className = 'team-link'; link.href = `/team/${t.abbrev.toLowerCase()}`;
                        const logo = document.createElement('img'); logo.src = `https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg`; logo.alt = ''; logo.width = 40; logo.height = 40;
                        logo.onerror = () => { logo.style.visibility = 'hidden'; };
                        const name = document.createElement('span'); name.textContent = t.name;
                        const abbr = document.createElement('small'); abbr.textContent = t.abbrev;
                        link.append(logo,name,abbr);block.append(link);
                    });
                    section.append(block);
                }
                root.append(section);
            }
            if (!filtered.length) root.innerHTML = '<p class="empty-state">No teams match your search.</p>';
        };
        document.getElementById('teamSearch').addEventListener('input', render);
        loading.hidden = true;
        render();
    } catch (error) {
        loading.textContent = 'Teams could not be loaded. Please try again.';
    }
}
