// Player page JS - fetches landing data and displays it

function getPlayerIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
}

function computeAge(birthDateStr) {
    if (!birthDateStr) return '';
    const bd = new Date(birthDateStr);
    if (isNaN(bd)) return '';
    const diff = Date.now() - bd.getTime();
    const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return age;
}

const teamColorMap = {
    'CAR': { primary: '#a80000', accent: '#e4002b' },
    'PIT': { primary: '#000000', accent: '#ffb81c' },
    'NYR': { primary: '#0033a0', accent: '#ce1126' },
    'TOR': { primary: '#00205b', accent: '#003e7e' },
    'MTL': { primary: '#AF1E2D', accent: '#192168' }
};

function applyTeamTheme(abbrev) {
    const hero = document.getElementById('playerHero');
    if (!hero) return;
    const actionShot = hero.dataset.actionShot || '';
    const overlay = document.getElementById('heroOverlay');
    
    const map = abbrev ? teamColorMap[abbrev.toUpperCase()] : null;
    const gradient = map ? `linear-gradient(135deg, ${map.primary}55, ${map.accent}55)` : 'linear-gradient(135deg,#ffffff,#f5f8fa)';
    const imageLayer = actionShot ? `, url(${actionShot})` : '';
    hero.style.background = gradient + imageLayer;
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
    if (map) hero.style.borderColor = map.primary + '40';
    
    // Always show overlay for text visibility (white text on all backgrounds)
    if (overlay) {
        overlay.style.opacity = '1';
    }
}

function computeDelta(curr, prev) {
    if (prev === undefined || prev === null) return null;
    if (curr === undefined || curr === null) return null;
    const d = curr - prev;
    return { value: d, sign: d > 0 ? '+' : (d < 0 ? '−' : '') };
}

function pinStat(label, value) {
    const bar = document.getElementById('playerPinnedStats');
    if (!bar) return;
    if ([...bar.children].some(c => c.dataset.label === label)) return;
    const pin = document.createElement('div');
    pin.className = 'pin';
    pin.dataset.label = label;
    pin.innerHTML = `${label}: <strong>${value}</strong> <span class="remove" title="Unpin">×</span>`;
    pin.querySelector('.remove').addEventListener('click', () => pin.remove());
    bar.appendChild(pin);
}

function initStickyNav() {
    const nav = document.getElementById('playerStickyNav');
    if (!nav) return;
    nav.classList.remove('hidden');
    nav.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            nav.querySelectorAll('button').forEach(b => {
                b.classList.remove('bg-primary', 'text-white');
                b.classList.add('hover:bg-gray-100');
            });
            btn.classList.add('bg-primary', 'text-white');
            btn.classList.remove('hover:bg-gray-100');
            const target = btn.dataset.target;
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            const panel = document.querySelector(`#tab-${target}`);
            if (panel) panel.classList.remove('hidden');
        });
    });
}

async function loadPlayer() {
    const id = getPlayerIdFromPath();
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('playerError');
    const main = document.getElementById('playerMain');

    try {
        const resp = await fetch(`/api/player/${id}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Helper to safely extract string values from nested structures
        const resolve = (val) => {
            if (val === null || val === undefined) return '';
            const t = typeof val;
            if (t === 'string' || t === 'number' || t === 'boolean') return String(val);
            if (Array.isArray(val)) return val.map(resolve).filter(Boolean).join(', ');
            if (t === 'object') {
                if ('default' in val) return resolve(val.default);
                if ('Default' in val) return resolve(val.Default);
                if ('value' in val) return resolve(val.value);
                // Fallback: join object primitive values
                return Object.values(val).map(resolve).filter(Boolean).join(' ');
            }
            return '';
        };

        // Basic info (headshot + action shot background)
        const actionShot = resolve(data.heroImage) || '';
        const headshot = resolve(data.headshot) || resolve(data.picture) || actionShot || '';
        document.getElementById('playerPhoto').src = headshot || '/static/img/placeholder-player.png';
        const heroEl = document.getElementById('playerHero');
        if (heroEl && actionShot) heroEl.dataset.actionShot = actionShot;

        const first = resolve(data.firstName).trim();
        const last = resolve(data.lastName).trim();
        let displayName = '';
        if (first || last) {
            displayName = [first, last].filter(Boolean).join(' ');
        } else if (resolve(data.playerName)) {
            displayName = resolve(data.playerName);
        } else {
            const slug = resolve(data.playerSlug);
            if (slug) {
                displayName = slug
                    .split('-')
                    .filter(part => !/^[0-9]+$/.test(part))
                    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' ');
            }
        }
        document.getElementById('playerName').textContent = displayName;

        // Set back to team link using team ID
        const teamId = resolve(data.currentTeamId) || resolve(data.teamId) || resolve(data.currentTeamAbbrev) || resolve(data.teamAbbrev) || '';
        const backToTeamLink = document.getElementById('backToTeam');
        if (backToTeamLink && teamId) {
            backToTeamLink.href = `/team/${teamId}`;
            backToTeamLink.classList.remove('hidden');
        }

        let position = data.position || data.primaryPosition || '';
        const shoots = data.shootsCatches || data.shoots || data.catches || '';

        // Transform position display to full names
        if (position === 'R' || position === 'RW') {
            position = 'Right Wing';
        } else if (position === 'L' || position === 'LW') {
            position = 'Left Wing';
        } else if (position === 'C') {
            position = 'Center';
        } else if (position === 'D') {
            position = 'Defenseman';
        } else if (position === 'G') {
            position = 'Goalie';
        }

        // Determine shoots/catches label based on position
        const isGoalie = position === 'Goalie' || position.toLowerCase().includes('goalie');
        const shootsLabel = isGoalie ? 'Catches' : 'Shoots';

        const heightInches = data.heightInInches || data.heightInInches;
        const heightCM = data.heightInCentimeters || data.heightInCentimeters;
        const weightLb = data.weightInPounds || data.weightInPounds;
        const weightKg = data.weightInKilograms || data.weightInKilograms;

        const birthDate = data.birthDate || '';
        const age = computeAge(birthDate);
        const birthPlace = [resolve(data.birthCity), resolve(data.birthStateProvince), resolve(data.birthCountry)].filter(Boolean).join(', ');

        const meta = document.getElementById('playerMeta');
        meta.innerHTML = '';
        const addMeta = (k, v) => {
            const d = document.createElement('div');
            const value = resolve(v);
            d.innerHTML = `<strong>${k}:</strong> ${value || '-'} `;
            meta.appendChild(d);
        };

        addMeta('Position', position);
        addMeta(shootsLabel, shoots);
        addMeta('Age', age ? age + ' yrs' : '-');
        addMeta('Birth Date', birthDate);
        addMeta('Birth Place', birthPlace);
        
        // Format height as feet'inches"
        let heightDisplay = '-';
        if (heightInches) {
            const feet = Math.floor(heightInches / 12);
            const inches = heightInches % 12;
            heightDisplay = `${feet}'${inches}"${heightCM ? ` (${heightCM} cm)` : ''}`;
        } else if (heightCM) {
            heightDisplay = `${heightCM} cm`;
        }
        addMeta('Height', heightDisplay);
        addMeta('Weight', weightLb ? `${weightLb} lb (${weightKg} kg)` : (weightKg ? `${weightKg} kg` : '-'));
        addMeta('Current Team', data.currentTeamAbbrev || data.teamCommonName || data.currentTeamRoster || '-');
        addMeta('Jersey #', data.sweaterNumber || data.sweaterNumber || '-');
        addMeta('Status', data.isActive ? 'Active' : (data.inHHOF ? 'Hall of Fame' : 'Retired'));
        if (data.draftDetails) {
            const d = data.draftDetails;
            const overall = d.overallPick || d.pickOverall || d.overallSelection || d.overall || d.pick || '-';
            const roundPick = d.pickInRound || d.roundPick || d.pickRound || d.pick; // fallback to generic pick
            const draftStr = `${d.year || '-'} Round ${d.round || '-'} Pick ${roundPick || '-'} (Overall ${overall || '-'}) (${d.teamName || d.teamAbbrev || '-'})`;
            addMeta('Draft', draftStr);
        }

        // Display jersey number and position in hero
        const numberEl = document.getElementById('playerNumber');
        const sweaterNum = data.sweaterNumber || data.sweaterNumber;
        if (numberEl && sweaterNum) {
            numberEl.textContent = `#${sweaterNum}`;
        } else if (numberEl) {
            numberEl.textContent = '';
        }
        
        const positionEl = document.getElementById('playerPosition');
        if (positionEl && position) {
            positionEl.textContent = position;
        } else if (positionEl) {
            positionEl.textContent = '';
        }

        // Remove bio and hero meta (no longer displayed in hero)
        const bioEl = document.getElementById('playerBio');
        if (bioEl) bioEl.innerHTML = '';
        const heroMeta = document.getElementById('playerHeroMeta');
        if (heroMeta) heroMeta.innerHTML = '';
        const careerSummary = document.getElementById('careerSummaryBand');
        if (careerSummary) {
            careerSummary.innerHTML = '';
        }
        const badgesInline = document.getElementById('playerBadgesInline');
        if (badgesInline) badgesInline.innerHTML = '';

        function renderFeaturedStats() {
            const statsDiv = document.getElementById('playerStats');
            statsDiv.innerHTML = '';
            if (data.featuredStats && data.featuredStats.regularSeason && data.featuredStats.regularSeason.subSeason) {
                const s = data.featuredStats.regularSeason.subSeason;
                const list = [];
                if (s.gamesPlayed !== undefined) list.push({ k: 'GP', v: s.gamesPlayed });
                const toiVal = resolve(s.timeOnIce) || resolve(s.timeOnIcePerGame) || resolve(s.totalTimeOnIce) || resolve(s.avgTimeOnIce) || resolve(s.timeOnIcePerGameFormatted) || resolve(s.toi);
                if (toiVal) list.push({ k: 'TOI', v: toiVal });
                if (s.goals !== undefined) list.push({ k: 'G', v: s.goals });
                if (s.assists !== undefined) list.push({ k: 'A', v: s.assists });
                if (s.points !== undefined) list.push({ k: 'PTS', v: s.points });
                if (s.plusMinus !== undefined) list.push({ k: '+/-', v: s.plusMinus });
                if (s.pim !== undefined) list.push({ k: 'PIM', v: s.pim });
                if (s.shots !== undefined) list.push({ k: 'SH', v: s.shots });
                if (s.wins !== undefined) list.push({ k: 'W', v: s.wins });
                if (s.losses !== undefined) list.push({ k: 'L', v: s.losses });
                if (s.gaa !== undefined) list.push({ k: 'GAA', v: s.gaa });
                if (s.savePercentage !== undefined) list.push({ k: 'SV%', v: s.savePercentage });
                statsDiv.innerHTML = `<div class="player-detail-stats">${list.map(obj => `<button class="stat" data-pin="${obj.k}" title="Pin ${obj.k}">${obj.k}: ${obj.v}</button>`).join('')}</div>`;
                statsDiv.querySelectorAll('[data-pin]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const parts = btn.textContent.split(':');
                        pinStat(parts[0].trim(), parts[1].trim());
                    });
                });
            } else {
                statsDiv.textContent = 'No featured stats available.';
            }
        }
        renderFeaturedStats();

        // Career & season totals - format seasonTotals into a Wikipedia-style table
        const careerDiv = document.getElementById('playerCareer');
        careerDiv.innerHTML = '';

        function formatSeasonLabel(seasonVal) {
            if (!seasonVal && seasonVal !== 0) return '';
            const s = String(seasonVal);
            if (s.length === 8) {
                const a = s.slice(0, 4);
                const b = s.slice(4);
                return `${a}-${b.slice(2)}`; // e.g., 20162017 -> 2016-17
            }
            return s;
        }

        function getTeamLogoUrl(teamAbbrev) {
            if (!teamAbbrev) return '';
            const abbr = String(teamAbbrev).toUpperCase().trim();
            // NHL team logos follow a predictable pattern
            return `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
        }

        // Build NHL career totals summary cards
        if (Array.isArray(data.seasonTotals) && data.seasonTotals.length) {
            const nhlSeasons = data.seasonTotals.filter(s => (resolve(s.leagueAbbrev) || '').toUpperCase() === 'NHL');
            if (nhlSeasons.length) {
                const totals = { gp: 0, g: 0, a: 0, pts: 0, pm: 0, pim: 0 };
                nhlSeasons.forEach(s => {
                    totals.gp += s.gamesPlayed || 0;
                    totals.g += s.goals || 0;
                    totals.a += s.assists || 0;
                    totals.pts += s.points || 0;
                    totals.pm += s.plusMinus || 0;
                    totals.pim += s.pim || 0;
                });

                const summaryGrid = document.createElement('div');
                summaryGrid.className = 'career-summary-cards';
                summaryGrid.innerHTML = `
                    <div class="career-summary-card"><div class="label">NHL Games</div><div class="value">${totals.gp}</div></div>
                    <div class="career-summary-card"><div class="label">Goals</div><div class="value">${totals.g}</div></div>
                    <div class="career-summary-card"><div class="label">Assists</div><div class="value">${totals.a}</div></div>
                    <div class="career-summary-card"><div class="label">Points</div><div class="value">${totals.pts}</div></div>
                    <div class="career-summary-card"><div class="label">+/-</div><div class="value">${totals.pm > 0 ? '+' : ''}${totals.pm}</div></div>
                `;
                careerDiv.appendChild(summaryGrid);
            }
        }

        if (Array.isArray(data.seasonTotals) && data.seasonTotals.length) {
            // We'll render a table: Season | Team | League | GP | G | A | PTS | +/- | PIM | S
            const bySeason = {};
            data.seasonTotals.forEach(entry => {
                const seasonKey = entry.season || entry.seqSeason || 'unknown';
                if (!bySeason[seasonKey]) bySeason[seasonKey] = [];
                bySeason[seasonKey].push(entry);
            });

            // Ensure chronological ordering within each season: regular season entries before playoff entries
            Object.keys(bySeason).forEach(sk => {
                bySeason[sk].sort((a,b) => {
                    const getGameType = (ent) => {
                        const gt = ent.gameTypeId || ent.gameTypeID || ent.gameType || ent.game_type_id;
                        if (gt === undefined || gt === null) return null;
                        const num = Number(gt);
                        return isNaN(num) ? gt : num;
                    };
                    const aGT = getGameType(a);
                    const bGT = getGameType(b);
                    const isPlayoffs = (gt) => {
                        if (gt === null || gt === undefined) return false;
                        if (typeof gt === 'number') return gt === 3; // NHL API playoffs gameTypeId=3
                        if (typeof gt === 'string') return /playoff/i.test(gt) || gt.trim() === '3';
                        return false;
                    };
                    const aPO = isPlayoffs(aGT);
                    const bPO = isPlayoffs(bGT);
                    if (aPO === bPO) return 0; // same phase
                    return aPO ? -1 : 1; // playoffs first, then regular
                });
            });

            // Sort seasons newest-first (descending)
            const seasons = Object.keys(bySeason).map(k => ({k, n: Number(k)})).sort((a,b)=> (isNaN(b.n)?0:b.n) - (isNaN(a.n)?0:a.n)).map(x=>x.k);

            // Find career bests for highlighting
            const careerBests = { gp: 0, g: 0, a: 0, pts: 0, pm: -999, pim: 0, sh: 0 };
            data.seasonTotals.forEach(ent => {
                if ((ent.gamesPlayed || 0) > careerBests.gp) careerBests.gp = ent.gamesPlayed;
                if ((ent.goals || 0) > careerBests.g) careerBests.g = ent.goals;
                if ((ent.assists || 0) > careerBests.a) careerBests.a = ent.assists;
                if ((ent.points || 0) > careerBests.pts) careerBests.pts = ent.points;
                if ((ent.plusMinus || -999) > careerBests.pm) careerBests.pm = ent.plusMinus;
                if ((ent.pim || 0) > careerBests.pim) careerBests.pim = ent.pim;
                if ((ent.shots || 0) > careerBests.sh) careerBests.sh = ent.shots;
            });

            // Recompute best stats among visible cards (per active league filter)
            function recomputeVisibleBest(seasonsListEl) {
                if (!seasonsListEl) return;
                // Remove existing best markers
                seasonsListEl.querySelectorAll('.stat-pill.best').forEach(p => p.classList.remove('best'));
                const visibleCards = [...seasonsListEl.querySelectorAll('.season-row-card')].filter(c => !c.classList.contains('hidden'));
                const maxMap = {};
                visibleCards.forEach(card => {
                    card.querySelectorAll('.season-row-stats .stat-pill').forEach(pill => {
                        const stat = pill.dataset.stat;
                        const raw = pill.dataset.value;
                        const num = Number(raw);
                        if (!stat || isNaN(num)) return;
                        if (maxMap[stat] === undefined || num > maxMap[stat]) maxMap[stat] = num;
                    });
                });
                visibleCards.forEach(card => {
                    card.querySelectorAll('.season-row-stats .stat-pill').forEach(pill => {
                        const stat = pill.dataset.stat;
                        const num = Number(pill.dataset.value);
                        if (!stat || isNaN(num)) return;
                        if (maxMap[stat] !== undefined && num === maxMap[stat]) pill.classList.add('best');
                    });
                });
            }

            // Detect which columns have any non-empty values
            const hasData = {gp:false, g:false, a:false, pts:false, pm:false, pim:false, sh:false};
            data.seasonTotals.forEach(ent => {
                if (ent.gamesPlayed !== undefined && ent.gamesPlayed !== null && ent.gamesPlayed !== '') hasData.gp = true;
                if (ent.goals !== undefined && ent.goals !== null && ent.goals !== '') hasData.g = true;
                if (ent.assists !== undefined && ent.assists !== null && ent.assists !== '') hasData.a = true;
                if (ent.points !== undefined && ent.points !== null && ent.points !== '') hasData.pts = true;
                if (ent.plusMinus !== undefined && ent.plusMinus !== null && ent.plusMinus !== '') hasData.pm = true;
                if (ent.pim !== undefined && ent.pim !== null && ent.pim !== '') hasData.pim = true;
                if (ent.shots !== undefined && ent.shots !== null && ent.shots !== '') hasData.sh = true;
            });

            // Get current season (most recent)
            const currentSeasonId = seasons.length ? seasons[0] : null;
            const seasonPointsMap = {};
            data.seasonTotals.forEach(ent => { const sk = ent.season || ent.seqSeason; if (!sk) return; seasonPointsMap[sk] = ent.points || 0; });

            // New flex-based season cards list for improved readability
            const seasonsList = document.createElement('div');
            seasonsList.className = 'seasons-list';

                // Build filters (league buttons)
                const filtersEl = document.getElementById('seasonFilters');
                if (filtersEl) {
                    const leagues = new Set(data.seasonTotals.map(ent => (resolve(ent.leagueAbbrev)||'').toUpperCase()).filter(Boolean));
                    const allBtn = document.createElement('button'); allBtn.textContent='All'; allBtn.className='active'; allBtn.dataset.league=''; filtersEl.appendChild(allBtn);
                    leagues.forEach(l => { const b=document.createElement('button'); b.textContent=l; b.dataset.league=l; filtersEl.appendChild(b); });
                    filtersEl.querySelectorAll('button').forEach(btn => {
                        btn.addEventListener('click', () => {
                            filtersEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            const targetLeague = btn.dataset.league;
                            seasonsList.querySelectorAll('.season-row-card').forEach(card => {
                                const lg = card.dataset.league;
                                if (!targetLeague) {
                                    card.classList.remove('hidden');
                                } else {
                                    card.classList.toggle('hidden', lg !== targetLeague);
                                }
                            });
                            // Recompute best markers among visible cards (per selected league)
                            recomputeVisibleBest(seasonsList);
                        });
                    });
                }

            seasons.forEach((seasonKey, idx) => {
                bySeason[seasonKey].forEach((ent, entIdx) => {
                    const seasonLabel = formatSeasonLabel(seasonKey) || '';
                    
                    // Team abbreviation is now injected by backend as a simple string
                    const teamAbbrev = (ent.teamAbbrev || '').toString().toUpperCase().trim();
                    const teamName = resolve(ent.teamName) || resolve(ent.teamCommonName) || teamAbbrev;
                    const leagueAbbrev = resolve(ent.leagueAbbrev) || '';
                    const isNHL = leagueAbbrev.toUpperCase() === 'NHL';
                    
                    const logoUrl = isNHL && teamAbbrev ? getTeamLogoUrl(teamAbbrev) : '';

                    const card = document.createElement('div');
                    card.className = 'season-row-card';
                    if (seasonKey === currentSeasonId) card.classList.add('current-season');
                        card.dataset.league = leagueAbbrev.toUpperCase();

                    // Team logo with fallback to _dark variant then fallback text (only for NHL teams)
                    let logoHTML = '';
                    if (logoUrl && isNHL && teamAbbrev) {
                        logoHTML = `<img src="${logoUrl}" alt="${teamAbbrev}" class="season-team-logo" onerror="if(!this.dataset.alt){this.dataset.alt='1';this.src=this.src.replace('_light','_dark');}else{this.style.display='none';this.nextElementSibling?.classList.remove('hidden');}" /><div class="season-team-fallback hidden">${teamAbbrev.substring(0,3)}</div>`;
                    } else {
                        const fallbackText = (teamAbbrev || teamName || '?').substring(0,3).toUpperCase();
                        logoHTML = `<div class="season-team-fallback">${fallbackText}</div>`;
                    }

                    // Regular season vs playoffs indicator
                    const gameTypeId = ent.gameTypeId || ent.gameTypeID || ent.gameType || ent.game_type_id || null;
                    // NHL API: Regular season usually gameTypeId=2, Playoffs=3
                    const isPlayoffs = Number(gameTypeId) === 3 || (typeof gameTypeId === 'string' && /playoff/i.test(gameTypeId));
                    const phaseBadge = `<span class="season-phase ${isPlayoffs ? 'playoffs' : 'regular'}" title="${isPlayoffs ? 'Playoffs' : 'Regular Season'}">${isPlayoffs ? 'Playoffs' : 'Regular Season'}</span>`;

                    // Stats pills
                    const statPills = [];
                    // Detect average TOI (various possible keys) and format
                    const rawAvgToi = resolve(ent.timeOnIcePerGameFormatted) || resolve(ent.timeOnIcePerGame) || resolve(ent.avgTimeOnIce) || resolve(ent.averageTimeOnIce) || resolve(ent.avgToi) || '';
                    function formatToi(val) {
                        if (!val) return '';
                        if (typeof val === 'number') {
                            const mins = Math.floor(val / 60); const secs = Math.floor(val % 60); return `${mins}:${secs.toString().padStart(2,'0')}`;
                        }
                        const s = String(val).trim();
                        if (/^\d+:\d{1,2}$/.test(s)) return s.includes(':') ? (s.split(':')[0]+':'+s.split(':')[1].padStart(2,'0')) : s;
                        // If seconds integer inside string
                        if (/^\d+$/.test(s)) { const num = Number(s); const mins = Math.floor(num/60); const secs = num%60; return `${mins}:${secs.toString().padStart(2,'0')}`; }
                        // Sometimes comes like '15:32 Avg' -> extract first mm:ss
                        const match = s.match(/(\d{1,2}:\d{1,2})/); if (match) { const parts = match[1].split(':'); return parts[0]+':'+parts[1].padStart(2,'0'); }
                        return s; // fallback
                    }
                    let avgToi = formatToi(rawAvgToi);
                    // Normalize if appears to be season total (>= 60 minutes) by dividing by GP
                    if (avgToi && /^(\d+):(\d{2})$/.test(avgToi)) {
                        const parts = avgToi.split(':');
                        const mins = parseInt(parts[0],10);
                        const secs = parseInt(parts[1],10) || 0;
                        const totalSeconds = mins*60 + secs;
                        const gpForToi = ent.gamesPlayed || 0;
                        if (mins >= 60 && gpForToi > 0) {
                            const perGameSeconds = Math.round(totalSeconds / gpForToi);
                            const m = Math.floor(perGameSeconds/60);
                            const s = perGameSeconds % 60;
                            avgToi = `${m}:${String(s).padStart(2,'0')}`;
                        }
                    }
                    if (hasData.gp) statPills.push(`<span class="stat-pill${ent.gamesPlayed === careerBests.gp && careerBests.gp > 0 ? ' best' : ''}" data-stat="GP" data-value="${ent.gamesPlayed ?? ''}">GP ${ent.gamesPlayed ?? '-'}</span>`);
                    if (hasData.g) statPills.push(`<span class="stat-pill${ent.goals === careerBests.g && careerBests.g > 0 ? ' best' : ''}" data-stat="G" data-value="${ent.goals ?? ''}">G ${ent.goals ?? '-'}</span>`);
                    if (hasData.a) statPills.push(`<span class="stat-pill${ent.assists === careerBests.a && careerBests.a > 0 ? ' best' : ''}" data-stat="A" data-value="${ent.assists ?? ''}">A ${ent.assists ?? '-'}</span>`);
                    if (hasData.pts) statPills.push(`<span class="stat-pill${ent.points === careerBests.pts && careerBests.pts > 0 ? ' best' : ''}" data-stat="PTS" data-value="${ent.points ?? ''}">PTS ${ent.points ?? '-'}</span>`);
                    if (hasData.pm) statPills.push(`<span class="stat-pill${ent.plusMinus === careerBests.pm && careerBests.pm > -999 ? ' best' : ''}" data-stat="PM" data-value="${ent.plusMinus ?? ''}">+/- ${ent.plusMinus ?? '-'}</span>`);
                    if (hasData.pim) statPills.push(`<span class="stat-pill" data-stat="PIM" data-value="${ent.pim ?? ''}">PIM ${ent.pim ?? '-'}</span>`);
                    if (hasData.sh) statPills.push(`<span class="stat-pill${ent.shots === careerBests.sh && careerBests.sh > 0 ? ' best' : ''}" data-stat="SH" data-value="${ent.shots ?? ''}">SH ${ent.shots ?? '-'}</span>`);
                    if (avgToi) statPills.push(`<span class="stat-pill" data-stat="ATOI" data-value="${avgToi}">ATOI ${avgToi}</span>`);
                    // Faceoff win percentage (skaters only, >0) - normalize to percentage if value <=1
                    const rawFo = ent.faceoffWinningPctg || ent.faceoffWinPctg || ent.faceoffPctg || ent.faceoffPct || ent.faceoffPercentage || ent.faceoffWinPercent || null;
                    if (rawFo !== null && rawFo !== undefined) {
                        let foNum = Number(rawFo);
                        if (!isNaN(foNum) && foNum > 0) {
                            if (foNum <= 1) foNum = foNum * 100; // convert fraction to percent
                            const foDisp = foNum.toFixed(1);
                            statPills.push(`<span class="stat-pill" data-stat="FO" data-value="${foNum.toFixed(1)}">FO% ${foDisp}</span>`);
                        }
                    }

                    // Removed delta HTML (PTS +/- comparison) per user request
                    let deltaHTML = '';
                    card.innerHTML = `
                        <div class="season-row-left">
                            <div class="season-year">${seasonLabel}</div>
                            <div class="season-team-block">
                                ${logoHTML}
                                <div class="season-team-meta">
                                    <div class="season-team-name">${teamName}</div>
                                    <div class="season-league">${leagueAbbrev} ${phaseBadge}</div>
                                </div>
                            </div>
                        </div>
                        <div class="season-row-stats">${statPills.join('')}</div>
                       
                        <button class="season-expand-btn" type="button" aria-expanded="false">More ▾</button>
                        <div class="season-extra"></div>
                    `;
                    const expandBtn = card.querySelector('.season-expand-btn');
                    const extra = card.querySelector('.season-extra');

                    // Build advanced stats (computed on demand)
                    const buildExtra = () => {
                        if (!extra) return;
                        if (extra.dataset.built === '1') return; // only build once
                        const gp = ent.gamesPlayed || 0;
                        const goals = ent.goals || 0;
                        const assists = ent.assists || 0;
                        const points = ent.points || 0;
                        const shots = ent.shots || 0;
                        const pim = ent.pim || 0;
                        const plusMinus = (ent.plusMinus || ent.plusMinus === 0) ? ent.plusMinus : null;
                        const wins = ent.wins || 0;
                        const losses = ent.losses || 0;
                        const gaa = ent.gaa || ent.GAA || null;
                        const svpct = ent.savePercentage || ent.savePctg || null;

                        const isGoalie = svpct !== null || gaa !== null || (wins > 0 || losses > 0);

                        const perGame = (val) => gp ? (val / gp).toFixed(2) : '-';
                        const shootingPct = shots ? ((goals / shots) * 100).toFixed(1) + '%' : '-';

                        const pills = [];
                        // Skater advanced
                        if (!isGoalie) {
                            pills.push(`<span class='stat-pill'>G/GP ${perGame(goals)}</span>`);
                            pills.push(`<span class='stat-pill'>A/GP ${perGame(assists)}</span>`);
                            pills.push(`<span class='stat-pill'>PTS/GP ${perGame(points)}</span>`);
                            pills.push(`<span class='stat-pill'>SH/GP ${perGame(shots)}</span>`);
                            pills.push(`<span class='stat-pill'>PIM/GP ${perGame(pim)}</span>`);
                            pills.push(`<span class='stat-pill'>S% ${shootingPct}</span>`);
                            if (plusMinus !== null) pills.push(`<span class='stat-pill'>+/- ${plusMinus}</span>`);
                        } else {
                            // Goalie advanced
                            pills.push(`<span class='stat-pill'>Record ${wins}-${losses}</span>`);
                            if (svpct !== null) pills.push(`<span class='stat-pill'>SV% ${svpct}</span>`);
                            if (gaa !== null) pills.push(`<span class='stat-pill'>GAA ${gaa}</span>`);
                            if (gp) pills.push(`<span class='stat-pill'>Wins/GP ${perGame(wins)}</span>`);
                        }
                        extra.innerHTML = pills.join('');
                        extra.dataset.built = '1';
                    };

                    expandBtn.addEventListener('click', () => {
                        const expanded = card.classList.toggle('expanded');
                        expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                        expandBtn.textContent = expanded ? 'Less ▴' : 'More ▾';
                        if (expanded) buildExtra();
                    });

                    seasonsList.appendChild(card);
                });
            });

            careerDiv.appendChild(seasonsList);
            const summaryBand = document.getElementById('careerSummaryBand');
            if (summaryBand) {
                const nhlSeasons = data.seasonTotals.filter(s => (resolve(s.leagueAbbrev) || '').toUpperCase() === 'NHL');
                if (nhlSeasons.length) {
                    const totals = nhlSeasons.reduce((acc, s) => { acc.gp += s.gamesPlayed||0; acc.g += s.goals||0; acc.a += s.assists||0; acc.pts += s.points||0; acc.pm += s.plusMinus||0; return acc; }, {gp:0,g:0,a:0,pts:0,pm:0});
                    summaryBand.innerHTML='';
                    ['GP','G','A','PTS','+/-'].forEach(k => {
                        let v = totals[k.toLowerCase()] ?? (k==='+/-'?(totals.pm>0?'+':'')+totals.pm:'');
                        if (k==='+/-') v = (totals.pm>0?'+':'')+totals.pm;
                        const cell=document.createElement('div');
                        cell.className='career-cell';
                        cell.innerHTML=`<div class='lbl'>${k}</div><div class='val'>${v}</div>`;
                        cell.addEventListener('click',()=>pinStat(k,v));
                        summaryBand.appendChild(cell);
                    });
                }
            }
        } else {
            careerDiv.innerHTML = '<div>No season totals available.</div>';
        }

        function renderAwards() {
            const awardsRoot = document.getElementById('playerAwards');
            if (!awardsRoot) return; awardsRoot.innerHTML='';

            const awardsList = Array.isArray(data.awards) ? data.awards : [];
            const badgesList = Array.isArray(data.badges) ? data.badges : [];

            if (!awardsList.length && !badgesList.length) {
                awardsRoot.innerHTML = '<div class="muted">No awards or badges available.</div>'; return;
            }

            const formatSeasonId = (sid) => {
                if (!sid && sid !== 0) return '';
                const s = String(sid);
                if (/^\d{8}$/.test(s)) return s.slice(0,4)+'-'+s.slice(6); // 20162017 -> 2016-17
                return s;
            };

            // Awards section
            if (awardsList.length) {
                const header = document.createElement('h4'); header.textContent='Awards'; awardsRoot.appendChild(header);
                awardsList.forEach(aw => {
                    const trophyName = (aw.trophy && (aw.trophy.default || aw.trophy.Default)) ? (aw.trophy.default || aw.trophy.Default) : 'Trophy';
                    const seasons = Array.isArray(aw.seasons) ? aw.seasons : [];
                    if (!seasons.length) {
                        const row = document.createElement('div'); row.className='award-row';
                        row.innerHTML = `<div class='award-meta'><div class='award-name'>${trophyName}</div></div>`;
                        awardsRoot.appendChild(row);
                    } else {
                        seasons.forEach(sea => {
                            const seasonStr = formatSeasonId(sea.seasonId || sea.seasonID || sea.seasonid || sea.SeasonID);
                            const row = document.createElement('div'); row.className='award-row';
                            row.innerHTML = `<div class='award-meta'><div class='award-name'>${seasonStr ? seasonStr+' — ' : ''}${trophyName}</div></div>`;
                            awardsRoot.appendChild(row);
                        });
                    }
                });
            }

            // Badges section
            if (badgesList.length) {
                const header = document.createElement('h4'); header.textContent='Badges'; awardsRoot.appendChild(header);
                badgesList.forEach(b => {
                    const title = (b.title && (b.title.default || b.title.Default)) ? (b.title.default || b.title.Default) : 'Badge';
                    const logo = (b.logoUrl && (b.logoUrl.default || b.logoUrl.Default)) ? (b.logoUrl.default || b.logoUrl.Default) : '';
                    const row = document.createElement('div'); row.className='award-row';
                    row.innerHTML = `${logo?`<img class='award-icon' src='${logo}' alt='${title}' onerror="this.style.display='none'">`:''}<div class='award-meta'><div class='award-name'>${title}</div></div>`;
                    awardsRoot.appendChild(row);
                });
            }

            const badgeSec = document.getElementById('playerBadgesSection'); if (badgeSec) badgeSec.classList.remove('hidden');
        }
        renderAwards();

        // seasonTotalsByTeam and careerTotals: keep small summaries below the table
        if (Array.isArray(data.seasonTotalsByTeam) && data.seasonTotalsByTeam.length) {
            const sec = document.createElement('div');
            sec.innerHTML = `<h4>Season Totals By Team</h4>`;
            data.seasonTotalsByTeam.forEach(item => {
                const name = resolve(item.teamName) || resolve(item.teamAbbrev) || '';
                const vals = [];
                if (item.gamesPlayed !== undefined) vals.push(`GP ${item.gamesPlayed}`);
                if (item.goals !== undefined) vals.push(`G ${item.goals}`);
                if (item.assists !== undefined) vals.push(`A ${item.assists}`);
                if (item.points !== undefined) vals.push(`PTS ${item.points}`);
                const p = document.createElement('div');
                p.innerHTML = `<strong>${name}</strong> — ${vals.join(' • ')}`;
                sec.appendChild(p);
            });
            careerDiv.appendChild(sec);
        }

        if (Array.isArray(data.careerTotals) && data.careerTotals.length) {
            const sec = document.createElement('div');
            sec.innerHTML = `<h4>Career Totals</h4>`;
            data.careerTotals.forEach(item => {
                const vals = [];
                if (item.gamesPlayed !== undefined) vals.push(`GP ${item.gamesPlayed}`);
                if (item.goals !== undefined) vals.push(`G ${item.goals}`);
                if (item.assists !== undefined) vals.push(`A ${item.assists}`);
                if (item.points !== undefined) vals.push(`PTS ${item.points}`);
                const p = document.createElement('div');
                p.textContent = vals.join(' • ');
                sec.appendChild(p);
            });
            careerDiv.appendChild(sec);
        }

        // (Teams list removed - Career & Season totals occupy this area)

        // (legacy badges block removed; awards handled earlier)

        // Finalize: hide loader, show main content, init sticky nav & theme
        if (loading) loading.classList.add('hidden');
        if (main) main.classList.remove('hidden');
        initStickyNav();
        const teamAbbrevForTheme = data.currentTeamAbbrev || data.teamAbbrev || '';
        applyTeamTheme(teamAbbrevForTheme);
        // Page-wide background using action shot
        if (actionShot) {
            document.body.classList.add('action-bg');
            document.body.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.85)), url(${actionShot})`;
        }
        // Hide season filters until Seasons tab selected
        const filtersRoot = document.getElementById('seasonFilters');
        if (filtersRoot) filtersRoot.classList.add('hidden');
        const nav = document.getElementById('playerStickyNav');
        if (nav && filtersRoot) {
            nav.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const activeTab = btn.dataset.target;
                    filtersRoot.classList.toggle('hidden', activeTab !== 'seasons');
                });
            });
        }

    } catch (e) {
        loading.classList.add('hidden');
        errorDiv.classList.remove('hidden');
        errorDiv.textContent = 'Failed to load player data.';
    }
}

window.addEventListener('DOMContentLoaded', loadPlayer);
