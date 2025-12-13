// NHL Fan Hub - Team Details
let currentTeamId = null;
let currentTeamAbbrev = null;
let allPlayers = [];
let allProspects = [];
let prospectsCache = {}; // Cache prospect details by team
let rosterSortKey = 'POINTS';
let rosterSearchTerm = '';

// Helper function to add delay between requests
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    
    // Setup tab buttons
        document.getElementById('rosterTab')?.addEventListener('click', () => switchTab('roster'));
        document.getElementById('prospectsTab')?.addEventListener('click', () => switchTab('prospects'));
        document.getElementById('newsTab')?.addEventListener('click', () => switchTab('news'));
        document.getElementById('transactionsTab')?.addEventListener('click', () => switchTab('transactions'));
    
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
            // Load standings to get division/conference ranks
            await loadStandingsForRanks(team);
            displayTeamDetails(team);
        } else {
            showError('Team not found');
        }
    } catch (error) {
        console.error('Error loading team details:', error);
        showError(`Error loading team details: ${error.message}`);
    }
}

async function loadStandingsForRanks(team) {
    try {
        const response = await fetch('/api/teams');
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.teams || data.teams.length === 0) return;
        
        // Calculate division rank
        const divisionTeams = data.teams
            .filter(t => t.division === team.division.name)
            .sort((a, b) => {
                if (b.record.points !== a.record.points) {
                    return b.record.points - a.record.points;
                }
                return b.record.wins - a.record.wins;
            });
        
        const divisionRank = divisionTeams.findIndex(t => t.id === team.id) + 1;
        
        // Calculate conference rank
        const conferenceTeams = data.teams
            .filter(t => t.conference === team.conference.name)
            .sort((a, b) => {
                if (b.record.points !== a.record.points) {
                    return b.record.points - a.record.points;
                }
                return b.record.wins - a.record.wins;
            });
        
        const conferenceRank = conferenceTeams.findIndex(t => t.id === team.id) + 1;
        
        // Store ranks on team object
        team.divisionRank = divisionRank;
        team.conferenceRank = conferenceRank;
        team.divisionTotal = divisionTeams.length;
        team.conferenceTotal = conferenceTeams.length;
        
    } catch (error) {
        console.error('Error loading standings for ranks:', error);
    }
}

function displayTeamDetails(team) {
    const teamHeader = document.getElementById('teamHeader');
    const teamRecordSection = document.getElementById('teamRecordSection');
    const loading = document.getElementById('loading');
    
    // Store team abbreviation for prospects
    currentTeamAbbrev = team.abbreviation;
    
    // Populate shared header (logo/wordmark/name/back link)
    if (window.populateSharedHeader) {
        try { window.populateSharedHeader(team); } catch (e) { console.error('populateSharedHeader error', e); }
    }

    // Set the page title to the team's full name for better UX and sharing
    if (typeof document !== 'undefined') {
        try {
            if (team.name && team.name.trim() !== '') {
                document.title = team.name + ' — Hockey';
            }
        } catch (e) {
            // ignore
        }
    }
    
    // Display division with rank
    const divisionRankText = team.divisionRank === 1 ? 'Leader' : 
                            team.divisionRank === 2 ? '2nd' :
                            team.divisionRank === 3 ? '3rd' :
                            `${team.divisionRank}th`;
    document.getElementById('teamDivision').textContent = `${team.division.name} - ${divisionRankText}`;
    
    // Display conference with rank
    const conferenceRankText = team.conferenceRank === 1 ? 'Leader' : 
                              team.conferenceRank === 2 ? '2nd' :
                              team.conferenceRank === 3 ? '3rd' :
                              `${team.conferenceRank}th`;
    document.getElementById('teamConference').textContent = `${team.conference.name} - ${conferenceRankText}`;

    // Header population handled by shared renderer above
    
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
    
    // teamHeader visibility handled by shared renderer
    loading.classList.add('hidden');
}

function switchTab(tab) {
    const newsTab = document.getElementById('newsTab');
    const transactionsTab = document.getElementById('transactionsTab');
    const newsContent = document.getElementById('newsContent');
    const transactionsContent = document.getElementById('transactionsContent');
    const rosterTab = document.getElementById('rosterTab');
    const prospectsTab = document.getElementById('prospectsTab');
    const rosterContent = document.getElementById('rosterContent');
    const prospectsContent = document.getElementById('prospectsContent');
    const rosterProspectsSection = document.getElementById('rosterProspectsSection');
    // ensure the roster/prospects tab area is visible by default
    if (rosterProspectsSection) rosterProspectsSection.classList.remove('hidden');

    // helper to deactivate a tab element
    const deactivate = (el) => {
        if (!el) return;
        el.classList.remove('border-primary', 'text-primary');
        el.classList.add('border-transparent', 'text-gray-500');
    };

    // deactivate all tabs and hide all content panels
    deactivate(newsTab);
    deactivate(transactionsTab);
    deactivate(rosterTab);
    deactivate(prospectsTab);

    if (newsContent) newsContent.classList.add('hidden');
    if (transactionsContent) transactionsContent.classList.add('hidden');
    if (rosterContent) rosterContent.classList.add('hidden');
    if (prospectsContent) prospectsContent.classList.add('hidden');

    // activate the selected tab and show its content
    if (tab === 'news') {
        if (newsTab) {
            newsTab.classList.add('border-primary', 'text-primary');
            newsTab.classList.remove('border-transparent', 'text-gray-500');
        }
        if (newsContent) newsContent.classList.remove('hidden');
        // hide roster/prospects content panels when viewing news (tabs remain visible)
        if (rosterContent) rosterContent.classList.add('hidden');
        if (prospectsContent) prospectsContent.classList.add('hidden');
        loadTeamNews();
        return;
    }

    if (tab === 'transactions') {
        if (transactionsTab) {
            transactionsTab.classList.add('border-primary', 'text-primary');
            transactionsTab.classList.remove('border-transparent', 'text-gray-500');
        }
        if (transactionsContent) transactionsContent.classList.remove('hidden');
        if (rosterContent) rosterContent.classList.add('hidden');
        if (prospectsContent) prospectsContent.classList.add('hidden');
        loadTransactions();
        return;
    }

    if (tab === 'roster') {
        if (rosterTab) {
            rosterTab.classList.add('border-primary', 'text-primary');
            rosterTab.classList.remove('border-transparent', 'text-gray-500');
        }
        if (rosterContent) rosterContent.classList.remove('hidden');
        return;
    }

    // default to prospects
    if (prospectsTab) {
        prospectsTab.classList.add('border-primary', 'text-primary');
        prospectsTab.classList.remove('border-transparent', 'text-gray-500');
    }
    if (prospectsContent) prospectsContent.classList.remove('hidden');
    if (allProspects.length === 0 && currentTeamAbbrev) {
        loadProspects();
    }
}

async function loadTeamNews() {
    const newsLoading = document.getElementById('newsLoading');
    const newsError = document.getElementById('newsError');
    const newsBody = document.getElementById('newsBody');
    if (!currentTeamId) return;

    try {
        newsLoading.classList.remove('hidden');
        newsError.classList.add('hidden');
        newsBody.innerHTML = '';

        const resp = await fetch(`/api/team-news/${currentTeamId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        renderNewsList(data.stories || []);
        newsLoading.classList.add('hidden');
    } catch (err) {
        console.error('Error loading team news:', err);
        newsLoading.classList.add('hidden');
        newsError.textContent = `Error loading news: ${err.message}`;
        newsError.classList.remove('hidden');
    }
}

function renderNewsList(stories) {
    const newsBody = document.getElementById('newsBody');
    newsBody.innerHTML = '';
    if (!stories || stories.length === 0) {
        newsBody.innerHTML = '<div class="text-center py-8 text-gray-500">No recent news</div>';
        return;
    }

    stories.forEach(story => {
        const card = document.createElement('div');
        card.className = 'p-4 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer';
        const date = new Date(story.contentDate).toLocaleString();
        const firstPart = story.parts && story.parts[0] ? story.parts[0] : null;
        const firstPartContent = firstPart ? normalizeString(firstPart.content) : '';
        const previewText = stripMarkdown(firstPartContent).slice(0,200) || normalizeString(story.summary || '');

        card.innerHTML = `
            <div class="flex gap-4">
                    <div class="w-24 h-16 bg-gray-100 flex-shrink-0">
                    ${story.thumbnail ? `<img src="${story.thumbnail}" alt="" class="w-full h-full object-cover object-top rounded">` : ''}
                </div>
                <div class="flex-1">
                    <div class="font-semibold text-lg">${escapeHtml(story.title)}</div>
                    <div class="text-sm text-gray-500">${date}</div>
                    <div class="mt-2 text-gray-700 text-sm line-clamp-3">${escapeHtml(previewText)}</div>
                </div>
            </div>
        `;
        card.addEventListener('click', () => {
            const nhlUrl = buildNHLStoryURL(story.url || story.Url || story.Url);
            try {
                window.open(nhlUrl, '_blank', 'noopener');
            } catch (e) {
                // fallback
                window.open(nhlUrl, '_blank');
            }
        });
        newsBody.appendChild(card);
    });
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function buildNHLStoryURL(forgeUrl) {
    if (!forgeUrl) return forgeUrl;
    try {
        const u = new URL(forgeUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const slug = parts.length ? parts[parts.length - 1] : '';
        if (!slug) return forgeUrl;
        return `https://www.nhl.com/news/${slug}`;
    } catch (e) {
        const parts = forgeUrl.split('/').filter(Boolean);
        const slug = parts.length ? parts[parts.length - 1] : forgeUrl;
        return `https://www.nhl.com/news/${slug}`;
    }
}

function stripMarkdown(md) {
    if (!md) return '';
    // simple removal of images and links for preview
    return md.replace(/!\[[^\]]*\]\([^\)]+\)/g, '').replace(/\[[^\]]+\]\([^\)]+\)/g, '').replace(/[#_*`>~-]/g, '');
}

function normalizeString(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed === 'null' || trimmed === 'undefined') return '';
        return v;
    }
    try {
        return String(v);
    } catch (e) {
        return '';
    }
}

function openStoryModal(story) {
    const modal = document.getElementById('storyModal');
    const content = document.getElementById('storyModalContent');
    const closeBtn = document.getElementById('storyModalClose');
    content.innerHTML = '';

    // Title
    const titleEl = document.createElement('h3');
    titleEl.className = 'text-2xl font-bold';
    titleEl.textContent = story.title;
    content.appendChild(titleEl);

    // Date
    const dateEl = document.createElement('div');
    dateEl.className = 'text-sm text-gray-500';
    dateEl.textContent = new Date(story.contentDate).toLocaleString();
    content.appendChild(dateEl);

    // Render parts in order
    if (story.parts && story.parts.length > 0) {
        story.parts.forEach(p => {
            const partNode = renderStoryPart(p);
            if (partNode) content.appendChild(partNode);
        });
    }

    modal.classList.remove('hidden');

    closeBtn.onclick = () => { modal.classList.add('hidden'); };
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
}

function renderStoryPart(p) {
    if (!p) return null;
    const wrap = document.createElement('div');
    wrap.className = 'story-part';
    const contentStr = normalizeString(p.content);
    if (p.type === 'image') {
        if (!contentStr) return null;
        const img = document.createElement('img');
        img.src = contentStr;
        img.className = 'w-full rounded';
        wrap.appendChild(img);
        return wrap;
    }
    if (p.type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'w-full rounded';
        // try to detect if content is a JSON with a url
        try {
            const parsed = JSON.parse(contentStr || '""');
            if (typeof parsed === 'string') video.src = parsed;
            else if (parsed.url) video.src = parsed.url;
            else video.src = contentStr;
        } catch (e) {
            video.src = contentStr;
        }
        wrap.appendChild(video);
        return wrap;
    }
    // default: markdown/html
    const md = document.createElement('div');
    md.className = 'prose max-w-none';
    // Use marked to convert markdown/html safely
    try {
        md.innerHTML = marked.parse(contentStr || '');
    } catch (e) {
        md.textContent = contentStr || '';
    }
    wrap.appendChild(md);
    return wrap;
}

async function loadTransactions() {
    const body = document.getElementById('transactionsBody');
    const loading = document.getElementById('transactionsLoading');
    const error = document.getElementById('transactionsError');
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    body.innerHTML = '';
    try {
        if (!currentTeamId) throw new Error('No team selected');
        const resp = await fetch(`/api/team-transactions/${currentTeamId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const txs = data.transactions || [];
        if (!txs || txs.length === 0) {
            body.innerHTML = '<div class="text-center py-8 text-gray-500">No recent transactions</div>';
            loading.classList.add('hidden');
            return;
        }

        // Render each transaction
        txs.forEach(t => {
            const card = document.createElement('div');
            card.className = 'p-4 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer';
            const date = t.date ? new Date(t.date).toLocaleString() : '';
            const summary = normalizeString(t.summary) || '';
            card.innerHTML = `
                <div class="flex gap-4">
                    <div class="w-24 h-16 bg-gray-100 flex-shrink-0">
                        ${t.thumbnail ? `<img src="${t.thumbnail}" alt="" class="w-full h-full object-cover object-top rounded">` : ''}
                    </div>
                    <div class="flex-1">
                        <div class="font-semibold text-lg">${escapeHtml(t.title)}</div>
                        <div class="text-sm text-gray-500">${date}</div>
                        <div class="mt-2 text-gray-700 text-sm line-clamp-3">${escapeHtml(stripMarkdown(summary).slice(0,300))}</div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                const nhlUrl = buildNHLStoryURL(t.url || t.Url || t.Url);
                try { window.open(nhlUrl, '_blank', 'noopener'); } catch (e) { window.open(nhlUrl, '_blank'); }
            });
            body.appendChild(card);
        });
        loading.classList.add('hidden');
    } catch (err) {
        loading.classList.add('hidden');
        error.textContent = `Error loading transactions: ${err.message}`;
        error.classList.remove('hidden');
    }
}

async function loadProspects() {
    const prospectsLoading = document.getElementById('prospectsLoading');
    const prospectsError = document.getElementById('prospectsError');
    const prospectsBody = document.getElementById('prospectsBody');
    
    try {
        prospectsLoading.classList.remove('hidden');
        prospectsError.classList.add('hidden');
        
        // Check cache first
        if (prospectsCache[currentTeamAbbrev]) {
            allProspects = prospectsCache[currentTeamAbbrev];
            displayProspects(allProspects);
            prospectsLoading.classList.add('hidden');
            return;
        }
        
        const response = await fetch(`/api/prospects/${currentTeamAbbrev}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Combine all prospects
        const prospects = [
            ...(data.forwards || []),
            ...(data.defensemen || []),
            ...(data.goalies || [])
        ];
        
        // Display basic prospect info immediately
        allProspects = prospects.map(p => ({ ...p, overallPick: 999999 }));
        displayProspects(allProspects);
        prospectsLoading.textContent = 'Loading draft details...';
        
        // Fetch detailed information in batches with delays to avoid rate limiting
        const batchSize = 5;
        const delayMs = 200; // 200ms delay between batches
        
        for (let i = 0; i < prospects.length; i += batchSize) {
            const batch = prospects.slice(i, i + batchSize);
            
            const batchResults = await Promise.all(
                batch.map(async (prospect, idx) => {
                    try {
                        // Add small delay for each request in batch
                        if (idx > 0) await delay(50);
                        
                        const detailResponse = await fetch(`/api/player/${prospect.id}`);
                        if (detailResponse.ok) {
                            const detailData = await detailResponse.json();
                            return {
                                ...prospect,
                                draftDetails: detailData.draftDetails,
                                overallPick: detailData.draftDetails?.overallPick || 999999
                            };
                        }
                    } catch (err) {
                        console.error(`Error fetching details for prospect ${prospect.id}:`, err);
                    }
                    return { ...prospect, overallPick: 999999 };
                })
            );
            
            // Update allProspects with this batch
            batchResults.forEach((detailedProspect, idx) => {
                const originalIdx = i + idx;
                if (originalIdx < allProspects.length) {
                    allProspects[originalIdx] = detailedProspect;
                }
            });
            
            // Sort and re-display after each batch
            allProspects.sort((a, b) => a.overallPick - b.overallPick);
            displayProspects(allProspects);
            
            // Delay before next batch
            if (i + batchSize < prospects.length) {
                await delay(delayMs);
            }
        }
        
        // Cache the results
        prospectsCache[currentTeamAbbrev] = allProspects;
        
        prospectsLoading.classList.add('hidden');
    } catch (error) {
        console.error('Error loading prospects:', error);
        prospectsLoading.classList.add('hidden');
        prospectsError.textContent = `Error loading prospects: ${error.message}`;
        prospectsError.classList.remove('hidden');
    }
}

function displayProspects(prospects) {
    const prospectsBody = document.getElementById('prospectsBody');
    prospectsBody.innerHTML = '';
    
    if (prospects && prospects.length > 0) {
        prospects.forEach(prospect => {
            const card = createProspectCard(prospect);
            card.addEventListener('click', function() {
                window.location.href = `/player/${prospect.id}`;
            });
            prospectsBody.appendChild(card);
        });
    } else {
        prospectsBody.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">No prospects found</div>';
    }
}

function createProspectCard(prospect) {
    const card = document.createElement('div');
    
    // Fix position display: R -> RW, L -> LW
    let displayPosition = prospect.positionCode || 'F';
    if (displayPosition === 'R') displayPosition = 'RW';
    else if (displayPosition === 'L') displayPosition = 'LW';
    
    card.className = 'player-card roster-card position-' + displayPosition;
    
    const heightFt = prospect.heightInInches ? Math.floor(prospect.heightInInches / 12) : 0;
    const heightIn = prospect.heightInInches ? prospect.heightInInches % 12 : 0;
    
    const name = `${prospect.firstName?.default || ''} ${prospect.lastName?.default || ''}`.trim();
    const birthDate = prospect.birthDate ? new Date(prospect.birthDate) : null;
    const age = birthDate ? Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000)) : '-';
    const overallPick = prospect.overallPick && prospect.overallPick < 999999 ? prospect.overallPick : null;
    
    card.innerHTML = `
        <div class="player-photo">
            <img src="${prospect.headshot || '/static/default-player.png'}" alt="${name}">
        </div>
        <div class="player-info">
            <div class="player-top">
                <span class="player-number">#${prospect.sweaterNumber || '-'}</span>
                <span class="player-name">${name}</span>
                <span class="player-pos">${displayPosition}</span>
            </div>
            <div class="player-stats">
                ${overallPick ? `<div class="stat">
                    <span class="label">Pick</span>
                    <span class="value">#${overallPick}</span>
                </div>` : ''}
                <div class="stat">
                    <span class="label">Age</span>
                    <span class="value">${age}</span>
                </div>
                <div class="stat">
                    <span class="label">Ht</span>
                    <span class="value">${heightFt}'${heightIn}"</span>
                </div>
                <div class="stat">
                    <span class="label">Wt</span>
                    <span class="value">${prospect.weightInPounds || '-'}</span>
                </div>
                <div class="stat">
                    <span class="label">Shoots</span>
                    <span class="value">${prospect.shootsCatches || '-'}</span>
                </div>
                <div class="stat">
                    <span class="label">From</span>
                    <span class="value">${prospect.birthCity?.default || '-'}, ${prospect.birthCountry || ''}</span>
                </div>
            </div>
        </div>
    `;
    
    return card;
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
    const rosterProspectsSection = document.getElementById('rosterProspectsSection');

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
        rosterProspectsSection.classList.remove('hidden');
    } else {
        rosterBody.innerHTML = '<div class="no-players">No players found</div>';
        rosterProspectsSection.classList.remove('hidden');
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
            <div class="stat"><span class="label">GAA</span><span class="value">${stats.gaa !== undefined ? stats.gaa.toFixed(2) : '-'}</span></div>
            <div class="stat"><span class="label">SV%</span><span class="value">${stats.savePercentage !== undefined ? stats.savePercentage.toFixed(3) : '-'}</span></div>
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

// Coach button handler
document.getElementById('coachBtn')?.addEventListener('click', function() {
    if (currentTeamId) {
        window.location.href = `/coach?team=${currentTeamId}`;
    }
});

// Schedule button handler
document.getElementById('scheduleBtn')?.addEventListener('click', function() {
    if (currentTeamId) {
        window.location.href = `/team-schedule/${currentTeamId}`;
    }
});
