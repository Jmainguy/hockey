// Playoff series: games, scores, links to /game/{id}?from=schedule&date= (same as Scores)
(function () {
    'use strict';

    function pathParts() {
        const segs = window.location.pathname.split('/').filter(Boolean);
        if (segs.length < 3 || segs[0] !== 'playoff-series') {
            return null;
        }
        return { seasonId: segs[1], seriesLetter: segs[2] };
    }

    function gameDateParam(startTimeUTC) {
        if (!startTimeUTC || typeof startTimeUTC !== 'string') {
            return '';
        }
        const t = startTimeUTC.indexOf('T');
        if (t > 0) {
            return startTimeUTC.slice(0, 10);
        }
        return '';
    }

    function gameUrl(gameId, startTimeUTC) {
        const u = new URL(window.location.origin + '/game/' + gameId);
        u.searchParams.set('from', 'schedule');
        const d = gameDateParam(startTimeUTC);
        if (d) {
            u.searchParams.set('date', d);
        }
        return u.toString();
    }

    function teamPageUrl(abbrev) {
        if (!abbrev) {
            return '/';
        }
        return '/team/' + String(abbrev).toLowerCase();
    }

    /**
     * Top-of-page card: same 3-column idea as per-game cards (top seed | series | bottom seed).
     * Logos and names link to /team/{abbr}.
     */
    function buildSeriesHeroHTML(data) {
        const top = data.topSeedTeam || {};
        const bot = data.bottomSeedTeam || {};
        const tAb = abbrFor(top);
        const bAb = abbrFor(bot);
        const tUrl = teamPageUrl(tAb);
        const bUrl = teamPageUrl(bAb);
        const tLogo = teamLogoSrc(top);
        const bLogo = teamLogoSrc(bot);
        const tLines = teamNameLinesForColumn(top, tAb);
        const bLines = teamNameLinesForColumn(bot, bAb);
        const tw = top.seriesWins;
        const bw = bot.seriesWins;
        const h1 = (() => {
            const tf = fullNameFor(top);
            const bf = fullNameFor(bot);
            if (tf && bf) {
                return '<h1 class="text-center text-lg sm:text-2xl font-extrabold text-white mb-2 text-balance drop-shadow-sm">' + esc(tf) + ' vs ' + esc(bf) + '</h1>';
            }
            if (tAb && bAb) {
                return (
                    '<h1 class="text-center text-lg sm:text-2xl font-extrabold text-white mb-2 text-balance drop-shadow-sm">' +
                    esc(tAb) +
                    ' vs ' +
                    esc(bAb) +
                    '</h1>'
                );
            }
            return '<h1 class="text-center text-lg font-extrabold text-white mb-2 drop-shadow-sm">Playoff series</h1>';
        })();

        let statusLine = '';
        if (data.roundLabel) {
            statusLine =
                '<div class="text-center text-sm font-semibold text-blue-100 mb-3">' + esc(String(data.roundLabel).replace(/-/g, ' ')) + '</div>';
        } else if (data.round) {
            statusLine = '<div class="text-center text-sm font-semibold text-blue-100 mb-3">Round ' + esc(String(data.round)) + '</div>';
        }

        let scoreMid = '';
        if (tw != null && bw != null) {
            const nTw = Number(tw);
            const nBw = Number(bw);
            const needWins =
                data.neededToWin != null && !isNaN(Number(data.neededToWin)) && Number(data.neededToWin) > 0
                    ? Number(data.neededToWin)
                    : 4;
            const topWinsSeries = nTw >= needWins && nTw > nBw;
            const bottomWinsSeries = nBw >= needWins && nBw > nTw;
            const seriesComplete = topWinsSeries || bottomWinsSeries;

            let lead = '';
            if (topWinsSeries) {
                const by = fullNameFor(top) || tAb;
                const name = String(by);
                const withArticle = /^the\s/i.test(name) ? name : 'The ' + name;
                lead = esc(withArticle) + ' win the series, ' + nTw + '–' + nBw;
            } else if (bottomWinsSeries) {
                const by = fullNameFor(bot) || bAb;
                const name = String(by);
                const withArticle = /^the\s/i.test(name) ? name : 'The ' + name;
                lead = esc(withArticle) + ' win the series, ' + nTw + '–' + nBw;
            } else if (nTw > nBw) {
                lead = esc(tAb) + ' leads ' + nTw + '–' + nBw;
            } else if (nBw > nTw) {
                lead = esc(bAb) + ' leads ' + nBw + '–' + nTw;
            } else {
                lead = 'Series tied ' + nTw + '–' + nBw;
            }
            const topS = 'text-5xl font-bold ' + (nTw > nBw ? 'text-white' : nTw < nBw ? 'text-white/40' : 'text-white/90');
            const botS = 'text-5xl font-bold ' + (nBw > nTw ? 'text-white' : nBw < nTw ? 'text-white/40' : 'text-white/90');
            const topLabel = seriesComplete ? 'Final' : 'Series';
            const leadP = seriesComplete
                ? 'text-base font-bold text-amber-200 mt-2 text-center max-w-md leading-snug'
                : 'text-sm text-blue-100 mt-2 text-center max-w-xs leading-snug';
            scoreMid =
                '<div class="text-center flex flex-col items-center justify-center">' +
                '<div class="text-xs font-semibold uppercase tracking-wide ' +
                (seriesComplete ? 'text-amber-200' : 'text-white/80') +
                ' mb-1">' +
                topLabel +
                '</div>' +
                '<div class="flex items-center justify-center gap-8 py-1">' +
                '<div class="' +
                topS +
                '">' +
                nTw +
                '</div>' +
                '<div class="text-2xl font-bold text-white/50" aria-hidden="true">-</div>' +
                '<div class="' +
                botS +
                '">' +
                nBw +
                '</div></div>' +
                '<p class="' +
                leadP +
                '">' +
                lead +
                '</p></div>';
        } else {
            scoreMid = '<div class="text-center text-white/80 text-sm py-2">Series score not available</div>';
        }

        const colT =
            '<a href="' +
            tUrl +
            '" class="block text-center rounded-xl p-2 -m-2 text-inherit no-underline hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-white/40">' +
            '<img src="' +
            String(tLogo).replace(/"/g, '') +
            '" alt="' +
            esc(tAb || '') +
            '" class="w-20 h-20 mx-auto mb-2 drop-shadow-md" onerror="this.onerror=null;this.src=\'https://assets.nhle.com/logos/nhl/svg/TBD_light.svg\'">' +
            '<div class="font-bold text-white">' +
            esc(tLines.line1) +
            '</div>' +
            (tLines.line2
                ? '<div class="text-sm text-blue-100">' + esc(tLines.line2) + '</div>'
                : '<div class="text-sm text-blue-100"></div>') +
            (top.record
                ? '<div class="text-xs text-white/60 mt-1">' + esc(String(top.record)) + '</div>'
                : '') +
            '</a>';
        const colB =
            '<a href="' +
            bUrl +
            '" class="block text-center rounded-xl p-2 -m-2 text-inherit no-underline hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-white/40">' +
            '<img src="' +
            String(bLogo).replace(/"/g, '') +
            '" alt="' +
            esc(bAb || '') +
            '" class="w-20 h-20 mx-auto mb-2 drop-shadow-md" onerror="this.onerror=null;this.src=\'https://assets.nhle.com/logos/nhl/svg/TBD_light.svg\'">' +
            '<div class="font-bold text-white">' +
            esc(bLines.line1) +
            '</div>' +
            (bLines.line2
                ? '<div class="text-sm text-blue-100">' + esc(bLines.line2) + '</div>'
                : '<div class="text-sm text-blue-100"></div>') +
            (bot.record
                ? '<div class="text-xs text-white/60 mt-1">' + esc(String(bot.record)) + '</div>'
                : '') +
            '</a>';

        return (
            h1 +
            statusLine +
            '<div class="grid grid-cols-3 gap-4 items-center mb-2">' +
            '<div>' +
            colT +
            '</div><div>' +
            scoreMid +
            '</div><div>' +
            colB +
            '</div></div>'
        );
    }

    function isFinalState(gameState) {
        const s = (gameState || '').toString().toUpperCase();
        if (s === 'OFF') {
            return true;
        }
        if (s.startsWith('FINAL')) {
            return true;
        }
        return false;
    }

    function abbrFor(side) {
        if (!side) {
            return '';
        }
        if (side.abbrev) {
            return String(side.abbrev).toUpperCase();
        }
        if (side.commonName && side.commonName.default) {
            return String(side.commonName.default).toUpperCase();
        }
        return '';
    }

    /** Full city + team name when the API provides place + name/common (e.g. Buffalo Sabres). */
    function fullNameFor(side) {
        if (!side) {
            return '';
        }
        const place = side.placeName && (side.placeName.default || side.placeName);
        const nick = side.name && (side.name.default || side.name);
        const common = side.commonName && (side.commonName.default || side.commonName);
        if (place && nick) {
            return String(place) + ' ' + String(nick);
        }
        if (place && common) {
            return String(place) + ' ' + String(common);
        }
        if (nick) {
            return String(nick);
        }
        if (common) {
            return String(common);
        }
        return abbrFor(side);
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    // --- Match /scores (scores.js `createGameCard`) layout & classes for each game row ---
    function formatTime(isoString) {
        if (!isoString) {
            return 'TBD';
        }
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    }

    function buildStatusBadge(isLiveOrCrit, isIntermission, stateText) {
        if (isIntermission) {
            return (
                '<span class="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">' +
                (isLiveOrCrit ? '<span class="animate-pulse">🟣</span> ' : '') +
                esc(stateText) +
                '</span>'
            );
        }
        if (isLiveOrCrit) {
            return (
                '<span class="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">' +
                '<span class="animate-pulse">🔴</span> ' +
                esc(stateText) +
                '</span>'
            );
        }
        return (
            '<span class="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 text-gray-700 rounded-full text-sm font-semibold">' +
            esc(stateText) +
            '</span>'
        );
    }

    function teamLogoSrc(side) {
        if (!side) {
            return '';
        }
        const a = (side.abbrev || 'TBD').toString();
        return teamLogoFor(side) || 'https://assets.nhle.com/logos/nhl/svg/' + a + '_light.svg';
    }

    function placeDisplayName(side) {
        if (!side) {
            return '';
        }
        const p = side.placeName && (side.placeName.default || side.placeName);
        const c = side.commonName && (side.commonName.default || side.commonName);
        if (p) {
            return String(p);
        }
        if (c) {
            return String(c);
        }
        return (side.abbrev && String(side.abbrev)) || '';
    }

    function commonNameLine(side) {
        if (!side || !side.commonName) {
            return '';
        }
        const c = side.commonName.default != null ? side.commonName.default : side.commonName;
        return c != null ? String(c) : '';
    }

    /**
     * City + nickname on two lines (like game cards). Playoff series teams may have
     * `name` but not `commonName` — we split "Carolina Hurricanes" when `placeName` is Carolina.
     */
    function teamNameLinesForColumn(side, abbrevFallback) {
        if (!side) {
            return { line1: String(abbrevFallback || ''), line2: '' };
        }
        const place = placeDisplayName(side) || abbrevFor(side) || String(abbrevFallback || '');
        const comm = commonNameLine(side);
        if (comm) {
            return { line1: place, line2: comm };
        }
        if (side.name) {
            const raw = side.name.default != null ? side.name.default : side.name;
            if (raw) {
                const full = String(raw).trim();
                const pRaw = side.placeName && (side.placeName.default != null ? side.placeName.default : side.placeName);
                const pStr = pRaw != null ? String(pRaw).trim() : '';
                if (pStr) {
                    const pLow = pStr.toLowerCase();
                    const fLow = full.toLowerCase();
                    if (fLow === pLow) {
                        return { line1: place, line2: '' };
                    }
                    if (fLow.startsWith(pLow + ' ')) {
                        return { line1: pStr, line2: full.slice(pStr.length).trim() };
                    }
                } else {
                    // No placeName: full name only (one line, like h1)
                    return { line1: full, line2: '' };
                }
            }
        }
        const one = fullNameFor(side);
        if (one && one !== place) {
            return { line1: one, line2: '' };
        }
        return { line1: place, line2: '' };
    }

    /**
     * HTML inside one game card (same structure as static/scores.js `createGameCard`).
     * Order: home team | score | away team (grid-cols-3).
     */
    function buildPlayoffGameCardInner(g, opts) {
        opts = opts || {};
        const largeCtx = !!opts.largeContextLine;
        const homeTeam = g.homeTeam || {};
        const awayTeam = g.awayTeam || {};
        const homeLogoSrc = teamLogoSrc(homeTeam);
        const awayLogoSrc = teamLogoSrc(awayTeam);
        const homeDisplayName = placeDisplayName(homeTeam) || abbrFor(homeTeam);
        const awayDisplayName = placeDisplayName(awayTeam) || abbrFor(awayTeam);
        const homeCommon = commonNameLine(homeTeam);
        const awayCommon = commonNameLine(awayTeam);
        const gnum = g.gameNumber != null ? 'Game ' + g.gameNumber : 'Game';
        const dateLine = g.startTimeUTC ? formatGameDateLong(g.startTimeUTC) : '';
        const contextClass = largeCtx
            ? 'text-center text-base sm:text-lg font-bold text-gray-800 mb-3'
            : 'text-center text-xs text-gray-500 mb-2';
        const between = largeCtx ? ' - ' : ' · ';
        const contextLine = dateLine
            ? '<div class="' + contextClass + '">' + esc(gnum) + between + esc(dateLine) + '</div>'
            : '<div class="' + contextClass + '">' + esc(gnum) + '</div>';

        const homeScore = homeTeam.score != null ? homeTeam.score : 0;
        const awayScore = awayTeam.score != null ? awayTeam.score : 0;
        const gameState = g.gameState || '';
        const gameScheduleState = g.gameScheduleState || '';
        // Same as scores.js: higher score in primary, other in gray (ties: both gray)
        const homeWonStyle = 'text-5xl font-bold ' + (homeScore > awayScore ? 'text-primary' : 'text-gray-400');
        const awayWonStyle = 'text-5xl font-bold ' + (awayScore > homeScore ? 'text-primary' : 'text-gray-400');

        let statusHTML = '';
        let scoreHTML = '';

        if (gameState === 'PRE') {
            const startTime = g.startTimeUTC ? formatTime(g.startTimeUTC) : 'TBD';
            statusHTML =
                '<div class="text-center mb-2">' +
                '<span class="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-semibold">' +
                '<span class="text-sm">⏳</span> Pregame • ' +
                esc(startTime) +
                '</span></div>';
            scoreHTML = '<div class="text-center py-4"><div class="text-4xl font-bold text-gray-300">VS</div></div>';
        } else if (gameState === 'FUT' || gameScheduleState === 'TBD') {
            const startTime = g.startTimeUTC ? formatTime(g.startTimeUTC) : 'TBD';
            statusHTML = '<div class="text-center text-sm font-semibold text-gray-600 mb-2">' + esc(startTime) + '</div>';
            scoreHTML = '<div class="text-center py-4"><div class="text-4xl font-bold text-gray-300">VS</div></div>';
        } else if (gameState === 'LIVE' || gameState === 'CRIT') {
            const pd = g.periodDescriptor || {};
            const periodType = pd.periodType || '';
            const periodNum = pd.number != null ? pd.number : '';
            const clockObj = g.clock || {};
            const isIntermission = !!clockObj.inIntermission;
            let clock = '';
            const secs = typeof clockObj.secondsRemaining === 'number' && !isNaN(clockObj.secondsRemaining) ? clockObj.secondsRemaining : null;
            if (typeof secs === 'number') {
                const mins = Math.floor(secs / 60);
                const s2 = Math.floor(secs % 60).toString().padStart(2, '0');
                clock = mins + ':' + s2;
            } else {
                clock = clockObj.timeRemaining || clockObj.TimeRemaining || g.clockText || '';
            }
            let stateText = '';
            if (isIntermission) {
                stateText = clock ? (periodNum ? 'Intermission ' + periodNum + ' • ' + clock : 'Intermission • ' + clock) : (periodNum ? 'Intermission ' + periodNum : 'Intermission');
            } else if (clock) {
                stateText = (periodType + ' ' + periodNum + ' • ' + clock).trim();
            } else if (periodType || periodNum) {
                stateText = (periodType + ' ' + periodNum).trim();
            } else {
                stateText = 'Live';
            }
            statusHTML = '<div class="text-center mb-2">' + buildStatusBadge(true, isIntermission, stateText) + '</div>';
            scoreHTML =
                '<div class="flex items-center justify-center gap-8 py-4">' +
                '<div class="' + homeWonStyle + '"><span>' + (homeTeam.score != null ? homeTeam.score : 0) + '</span></div>' +
                '<div class="text-2xl font-bold text-gray-400">-</div>' +
                '<div class="' + awayWonStyle + '"><span>' + (awayTeam.score != null ? awayTeam.score : 0) + '</span></div>' +
                '</div>';
        } else if (isFinalState(gameState)) {
            let finalText = 'Final';
            if (g.periodDescriptor) {
                const pt = g.periodDescriptor.periodType;
                if (pt === 'OT') {
                    finalText = 'Final/OT';
                } else if (pt === 'SO') {
                    finalText = 'Final/SO';
                }
            }
            statusHTML = '<div class="text-center text-sm font-semibold text-gray-600 mb-2">' + esc(finalText) + '</div>';
            scoreHTML =
                '<div class="flex items-center justify-center gap-8 py-4">' +
                '<div class="' + homeWonStyle + '">' + (homeTeam.score != null ? homeTeam.score : 0) + '</div>' +
                '<div class="text-2xl font-bold text-gray-400">-</div>' +
                '<div class="' + awayWonStyle + '">' + (awayTeam.score != null ? awayTeam.score : 0) + '</div></div>';
        } else {
            const startTime = g.startTimeUTC ? formatTime(g.startTimeUTC) : 'TBD';
            statusHTML = '<div class="text-center text-sm font-semibold text-gray-600 mb-2">' + esc(startTime) + '</div>';
            scoreHTML = '<div class="text-center py-4"><div class="text-4xl font-bold text-gray-300">VS</div></div>';
        }

        let broadcastHTML = '';
        if (g.tvBroadcasts && g.tvBroadcasts.length > 0) {
            const broadcasts = g.tvBroadcasts
                .map(function (b) {
                    return b.network;
                })
                .join(', ');
            broadcastHTML =
                '<div class="text-center text-xs text-gray-500 mt-3 flex items-center justify-center gap-2"><span>📺</span><span>' + esc(broadcasts) + '</span></div>';
        }

        let venueHTML = '';
        if (g.venue && g.venue.default) {
            venueHTML = '<div class="text-center text-xs text-gray-500 mt-1">📍 ' + esc(String(g.venue.default)) + '</div>';
        }

        return (
            contextLine +
            statusHTML +
            '<div class="grid grid-cols-3 gap-4 items-center mb-4">' +
            '<div class="text-center">' +
            '<img src="' +
            String(homeLogoSrc).replace(/"/g, '') +
            '" alt="' +
            esc(homeTeam.abbrev || '') +
            '" class="w-20 h-20 mx-auto mb-2 drop-shadow-md" onerror="this.onerror=null;this.src=\'https://assets.nhle.com/logos/nhl/svg/TBD_light.svg\'">' +
            '<div class="font-bold text-gray-800">' +
            esc(homeDisplayName) +
            '</div>' +
            (homeCommon
                ? '<div class="text-sm text-gray-600">' + esc(homeCommon) + '</div>'
                : '<div class="text-sm text-gray-600"></div>') +
            (homeTeam.record
                ? '<div class="text-xs text-gray-500 mt-1">' + esc(String(homeTeam.record)) + '</div>'
                : '') +
            '</div>' +
            '<div>' +
            scoreHTML +
            '</div>' +
            '<div class="text-center">' +
            '<img src="' +
            String(awayLogoSrc).replace(/"/g, '') +
            '" alt="' +
            esc(awayTeam.abbrev || '') +
            '" class="w-20 h-20 mx-auto mb-2 drop-shadow-md" onerror="this.onerror=null;this.src=\'https://assets.nhle.com/logos/nhl/svg/TBD_light.svg\'">' +
            '<div class="font-bold text-gray-800">' +
            esc(awayDisplayName) +
            '</div>' +
            (awayCommon
                ? '<div class="text-sm text-gray-600">' + esc(awayCommon) + '</div>'
                : '<div class="text-sm text-gray-600"></div>') +
            (awayTeam.record
                ? '<div class="text-xs text-gray-500 mt-1">' + esc(String(awayTeam.record)) + '</div>'
                : '') +
            '</div></div>' +
            broadcastHTML +
            venueHTML
        );
    }

    function teamLogoFor(side) {
        if (!side) {
            return '';
        }
        if (side.logo) {
            return String(side.logo);
        }
        const a = abbrFor(side);
        if (a) {
            return 'https://assets.nhle.com/logos/nhl/svg/' + a + '_light.svg';
        }
        return '';
    }

    function formatGameDateLong(iso) {
        if (!iso) {
            return '';
        }
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) {
                return '';
            }
            return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return '';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const p = pathParts();
        const loading = document.getElementById('seriesLoading');
        const errEl = document.getElementById('seriesError');
        const content = document.getElementById('seriesContent');
        if (!p) {
            if (loading) {
                loading.classList.add('hidden');
            }
            if (errEl) {
                errEl.textContent = 'Invalid URL. Use /playoff-series/20252026/A (season id + series letter).';
                errEl.classList.remove('hidden');
            }
            return;
        }

        const apiUrl = '/api/schedule/playoff-series/' + encodeURIComponent(p.seasonId) + '/' + encodeURIComponent(p.seriesLetter);

        fetch(apiUrl)
            .then((r) => {
                if (!r.ok) {
                    throw new Error('HTTP ' + r.status);
                }
                return r.json();
            })
            .then((data) => {
                if (loading) {
                    loading.classList.add('hidden');
                }

                const top = data.topSeedTeam;
                const bot = data.bottomSeedTeam;
                const tAb = top && abbrFor(top);
                const bAb = bot && abbrFor(bot);
                const tFull = top && fullNameFor(top);
                const bFull = bot && fullNameFor(bot);
                if (tFull && bFull) {
                    document.title = tFull + ' vs ' + bFull + ' — NHL Fan Hub';
                } else if (tAb && bAb) {
                    document.title = tAb + ' vs ' + bAb + ' — NHL Fan Hub';
                }
                const hero = document.getElementById('seriesPageHero');
                if (hero) {
                    hero.innerHTML = buildSeriesHeroHTML(data);
                    hero.classList.remove('hidden');
                }

                const games = Array.isArray(data.games) ? data.games.slice() : [];
                games.sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0));

                const listEl = document.getElementById('seriesGameList');
                if (listEl) {
                    listEl.innerHTML = games
                        .map(function (g) {
                            const href = gameUrl(g.id, g.startTimeUTC);
                            return (
                                '<a href="' +
                                href +
                                '" class="block bg-white rounded-2xl shadow-md hover:shadow-xl transition p-6 cursor-pointer">' +
                                buildPlayoffGameCardInner(g) +
                                '</a>'
                            );
                        })
                        .join('');
                }

                const upSec = document.getElementById('seriesUpNext');
                const upBody = document.getElementById('seriesUpNextBody');
                if (upSec && upBody) {
                    const nextGame = games.find(function (g) {
                        return g && !isFinalState(g.gameState);
                    });
                    if (nextGame) {
                        const href = gameUrl(nextGame.id, nextGame.startTimeUTC);
                        upBody.innerHTML =
                            '<a href="' +
                            href +
                            '" class="block bg-white rounded-2xl shadow-md hover:shadow-xl transition p-6 cursor-pointer">' +
                            buildPlayoffGameCardInner(nextGame, { largeContextLine: true }) +
                            '</a>';
                        upSec.classList.remove('hidden');
                    } else {
                        upSec.classList.add('hidden');
                    }
                }

                if (content) {
                    content.classList.remove('hidden');
                }
            })
            .catch((e) => {
                if (loading) {
                    loading.classList.add('hidden');
                }
                if (errEl) {
                    errEl.textContent =
                        'Could not load this series. ' + (e.message || e);
                    errEl.classList.remove('hidden');
                }
            });
    });
})();
