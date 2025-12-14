// Shared game details display functionality

function displayGameDetailsHTML(data) {
    const awayTeam = data.awayTeam;
    const homeTeam = data.homeTeam;
    const isFutureGame = data.gameState === 'FUT' || data.gameState === 'PRE';

    // prettier game summary header: left team / score center / right team
    let statusText = 'Final';
    if (data.gameState === 'LIVE') statusText = 'Live';
    else if (data.gameState === 'PRE') statusText = 'Pregame';
    else if (data.gameState === 'FUT') statusText = 'Scheduled';
    const periodInfo = data.periodDescriptor ? `${data.periodDescriptor.periodType} ${data.periodDescriptor.number || ''}` : '';
    // status badge color
    const statusClass = data.gameState === 'LIVE' ? 'bg-red-100 text-red-700' : (data.gameState === 'FUT' || data.gameState === 'PRE') ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700';
    let detailsHTML = `
        <div class="flex flex-col md:flex-row items-center md:items-stretch gap-4 mb-6 pb-6 border-b">
            <div class="flex-1 flex flex-col items-center md:items-start md:pl-4">
                <a href="/team/${homeTeam.abbrev}" class="inline-block"><img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" alt="${homeTeam.abbrev}" class="w-14 h-14 mb-2"></a>
                <div class="text-lg font-bold text-gray-800">${homeTeam.placeName?.default || homeTeam.abbrev}</div>
                <div class="text-xs text-gray-500 mt-1">${isFutureGame ? (homeTeam.record || 'Record TBD') : 'SOG: ' + (homeTeam.sog || 0)}</div>
            </div>

            <div class="w-full md:w-auto flex flex-col items-center justify-center">
                <div class="inline-flex items-center gap-4">
                    <div class="text-5xl font-extrabold text-gray-900">${homeTeam.score || 0}</div>
                    <div class="text-2xl font-bold text-gray-400">-</div>
                    <div class="text-5xl font-extrabold text-gray-900">${awayTeam.score || 0}</div>
                </div>
                <div class="mt-2 inline-flex items-center gap-3">
                    <span class="text-sm font-semibold ${statusClass} px-3 py-1 rounded-full">${statusText}</span>
                    ${data.clockText ? `<span class="text-sm text-gray-500">• ${data.clockText}</span>` : ''}
                    ${periodInfo ? `<span class="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">${periodInfo}</span>` : ''}
                </div>
                
            </div>

            <div class="flex-1 flex flex-col items-center md:items-end md:pr-4">
                <a href="/team/${awayTeam.abbrev}" class="inline-block"><img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" alt="${awayTeam.abbrev}" class="w-14 h-14 mb-2"></a>
                <div class="text-lg font-bold text-gray-800">${awayTeam.placeName?.default || awayTeam.abbrev}</div>
                <div class="text-xs text-gray-500 mt-1">${isFutureGame ? (awayTeam.record || 'Record TBD') : 'SOG: ' + (awayTeam.sog || 0)}</div>
            </div>
        </div>
    `;
    
    // For future games, show venue, time, and ticket info
    if (isFutureGame) {
        const startTime = data.startTimeUTC ? new Date(data.startTimeUTC).toLocaleString('en-US', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric', 
            minute: '2-digit',
            timeZoneName: 'short'
        }) : 'TBD';
        
        const venue = data.venue?.default || 'Venue TBD';
        const ticketUrl = data.ticketsLink || data.ticketsLinkFr || `https://www.nhl.com/${homeTeam.abbrev?.toLowerCase()}/tickets`;
        
        detailsHTML += `
            <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    📅 Game Information
                </h4>
                <div class="space-y-3">
                    <div class="flex items-start gap-3">
                        <div class="text-2xl">🕐</div>
                        <div>
                            <div class="font-semibold text-gray-700">Start Time</div>
                            <div class="text-gray-600">${startTime}</div>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="text-2xl">🏟️</div>
                        <div>
                            <div class="font-semibold text-gray-700">Venue</div>
                            <div class="text-gray-600">${venue}</div>
                        </div>
                    </div>
                    <div class="mt-4">
                        <a href="${ticketUrl}" target="_blank" rel="noopener noreferrer" 
                           class="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-secondary transition shadow-md">
                            🎟️ Buy Tickets
                        </a>
                    </div>
                </div>
            </div>
        `;
        
        // Show broadcast info if available
        if (data.tvBroadcasts && data.tvBroadcasts.length > 0) {
            detailsHTML += `
                <div class="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 class="text-md font-bold text-gray-800 mb-3">📺 Broadcast Information</h4>
                    <div class="space-y-2">
            `;
            
            data.tvBroadcasts.forEach(broadcast => {
                detailsHTML += `
                    <div class="flex items-center gap-2 text-sm">
                        <span class="font-semibold text-gray-700">${broadcast.market || 'National'}:</span>
                        <span class="text-gray-600">${broadcast.network || 'TBD'}</span>
                    </div>
                `;
            });
            
            detailsHTML += `
                    </div>
                </div>
            `;
        }
        
        // Show team leaders if available
        if (data.matchup?.skaterComparison?.leaders && data.matchup.skaterComparison.leaders.length > 0) {
            const contextLabel = data.matchup.skaterComparison.contextLabel || 'season';
            const displayContext = contextLabel.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            detailsHTML += `
                <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                    <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        🌟 Skater Leaders
                        <span class="text-xs font-normal text-gray-500">(${displayContext})</span>
                    </h4>
                    <div class="space-y-4">
            `;
            
            data.matchup.skaterComparison.leaders.forEach(categoryLeader => {
                const category = categoryLeader.category || '';
                const homeLeader = categoryLeader.homeLeader;
                const awayLeader = categoryLeader.awayLeader;
                
                detailsHTML += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="text-sm font-bold text-gray-600 uppercase mb-3">${category}</div>
                        <div class="grid grid-cols-2 gap-4">
                            <!-- Home Leader -->
                            <div class="flex items-center gap-3">
                                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                                     alt="${homeTeam.abbrev}" 
                                     class="w-5 h-5 flex-shrink-0">
                                  <a href="/player/${homeLeader.playerId || homeLeader.id || ''}" class="inline-block"><img src="${homeLeader.headshot}" alt="${homeLeader.name?.default}" 
                                      class="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"></a>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm truncate">${homeLeader.name?.default || ''}</div>
                                    <div class="text-xs text-gray-600">#${homeLeader.sweaterNumber} ${homeLeader.positionCode || ''}</div>
                                    <div class="text-lg font-bold text-primary">${homeLeader.value || 0}</div>
                                </div>
                            </div>
                            
                            <!-- Away Leader -->
                            <div class="flex items-center gap-3">
                                <img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" 
                                     alt="${awayTeam.abbrev}" 
                                     class="w-5 h-5 flex-shrink-0">
                                  <a href="/player/${awayLeader.playerId || awayLeader.id || ''}" class="inline-block"><img src="${awayLeader.headshot}" alt="${awayLeader.name?.default}" 
                                      class="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"></a>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm truncate">${awayLeader.name?.default || ''}</div>
                                    <div class="text-xs text-gray-600">#${awayLeader.sweaterNumber} ${awayLeader.positionCode || ''}</div>
                                    <div class="text-lg font-bold text-primary">${awayLeader.value || 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            detailsHTML += `
                    </div>
                </div>
            `;
        }
        
        // Show goalie comparison if available
        if (data.matchup?.goalieComparison) {
            const goalieContext = data.matchup.goalieComparison.contextLabel || 'season';
            const displayContext = goalieContext.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const homeGoalies = data.matchup.goalieComparison.homeTeam?.leaders || [];
            const awayGoalies = data.matchup.goalieComparison.awayTeam?.leaders || [];
            
            if (homeGoalies.length > 0 || awayGoalies.length > 0) {
                detailsHTML += `
                    <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            🥅 Goalie Comparison
                            <span class="text-xs font-normal text-gray-500">(${displayContext})</span>
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                `;
                
                // Home Team Goalies
                if (homeGoalies.length > 0) {
                    detailsHTML += `
                        <div>
                            <div class="flex items-center gap-2 mb-3 pb-2 border-b">
                                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                                     alt="${homeTeam.abbrev}" 
                                     class="w-6 h-6">
                                <span class="font-bold text-gray-800">${homeTeam.abbrev}</span>
                            </div>
                            <div class="space-y-3">
                    `;
                    
                    homeGoalies.forEach(goalie => {
                        const savePct = goalie.savePctg ? (goalie.savePctg * 100).toFixed(1) : '0.0';
                        const gaa = goalie.gaa ? goalie.gaa.toFixed(2) : '0.00';
                        
                        detailsHTML += `
                            <div class="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                                <a href="/player/${goalie.playerId || goalie.id || ''}" class="inline-block"><img src="${goalie.headshot}" alt="${goalie.name?.default}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-200"></a>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm">${goalie.name?.default || ''}</div>
                                    <div class="text-xs text-gray-600">#${goalie.sweaterNumber} - ${goalie.record || '0-0-0'}</div>
                                    <div class="flex gap-3 mt-1 text-xs text-gray-700">
                                        <span><strong>${savePct}%</strong> SV%</span>
                                        <span><strong>${gaa}</strong> GAA</span>
                                        <span><strong>${goalie.shutouts || 0}</strong> SO</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                    
                    detailsHTML += `
                            </div>
                        </div>
                    `;
                }
                
                // Away Team Goalies
                if (awayGoalies.length > 0) {
                    detailsHTML += `
                        <div>
                            <div class="flex items-center gap-2 mb-3 pb-2 border-b">
                                <img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" 
                                     alt="${awayTeam.abbrev}" 
                                     class="w-6 h-6">
                                <span class="font-bold text-gray-800">${awayTeam.abbrev}</span>
                            </div>
                            <div class="space-y-3">
                    `;
                    
                    awayGoalies.forEach(goalie => {
                        const savePct = goalie.savePctg ? (goalie.savePctg * 100).toFixed(1) : '0.0';
                        const gaa = goalie.gaa ? goalie.gaa.toFixed(2) : '0.00';
                        
                        detailsHTML += `
                            <div class="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                                  <a href="/player/${goalie.playerId || goalie.id || ''}" class="inline-block"><img src="${goalie.headshot}" alt="${goalie.name?.default}" 
                                     class="w-12 h-12 rounded-full object-cover border-2 border-gray-200">
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm">${goalie.name?.default || ''}</div>
                                    <div class="text-xs text-gray-600">#${goalie.sweaterNumber} - ${goalie.record || '0-0-0'}</div>
                                    <div class="flex gap-3 mt-1 text-xs text-gray-700">
                                        <span><strong>${savePct}%</strong> SV%</span>
                                        <span><strong>${gaa}</strong> GAA</span>
                                        <span><strong>${goalie.shutouts || 0}</strong> SO</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                    
                    detailsHTML += `
                            </div>
                        </div>
                    `;
                }
                
                detailsHTML += `
                        </div>
                    </div>
                `;
            }
        }
        
        // Return early for future games - no stats to show
        return detailsHTML;
    }
    
    // Three Stars
    if (data.summary?.threeStars && data.summary.threeStars.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    ⭐ Three Stars
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        `;
        
        data.summary.threeStars.forEach(player => {
            const starEmoji = player.star === 1 ? '🥇' : player.star === 2 ? '🥈' : '🥉';
            const stats = player.position === 'G' 
                ? `${player.savePctg ? (player.savePctg * 100).toFixed(1) + '% SV' : 'Goalie'}`
                : `${player.goals || 0}G ${player.assists || 0}A ${player.points || 0}P`;
            // Prefer firstName/lastName fields if present; fallback to name.default
            const fname = (player.firstName && player.firstName.default) ? player.firstName.default : '';
            const lname = (player.lastName && player.lastName.default) ? player.lastName.default : '';
            const fullName = (fname || lname) ? `${fname} ${lname}`.trim() : (player.name?.default || '');
            const playerId = player.playerId || player.id || null;
            const teamAbbrev = (player.teamAbbrev && player.teamAbbrev.default) ? player.teamAbbrev.default : (player.teamAbbrev || '');
            const headshot = player.headshot || '';
            
            detailsHTML += `
                <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 flex items-center gap-3">
                    <div class="text-3xl">${starEmoji}</div>
                    <a href="/player/${playerId || ''}" class="block flex-shrink-0">
                      <img src="${headshot}" alt="${fullName}" class="w-12 h-12 rounded-full object-cover">
                    </a>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-sm truncate"><a id="threeStarName-${playerId || ''}" href="/player/${playerId || ''}" class="underline">${fullName}</a></div>
                        <div class="text-xs text-gray-600">${teamAbbrev} #${player.sweaterNo}</div>
                        <div class="text-xs text-gray-500">${stats}</div>
                    </div>
                </div>
            `;
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }

    // Shootout clips (if present) - construct Brightcove player links using discreteClip
    const shootoutData = data.summary?.shootout || data.shootout || null;
    if (shootoutData && Array.isArray(shootoutData) && shootoutData.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">🔔 Shootout Highlights</h4>
                <div class="space-y-2">
        `;

        shootoutData.forEach(s => {
            const clipId = s.discreteClip || s.discreteClipFr || null;
            if (clipId) {
                const playerUrl = `https://players.brightcove.net/6415718365001/EXtG1xJ7H_default/index.html?videoId=${clipId}`;
                const shooter = (s.firstName && s.firstName.default ? s.firstName.default : '') + ' ' + (s.lastName && s.lastName.default ? s.lastName.default : '');
                const team = s.teamAbbrev && s.teamAbbrev.default ? s.teamAbbrev.default : '';
                detailsHTML += `
                    <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                        <div class="text-sm">${shooter.trim()} • ${team} • ${s.result || ''}</div>
                        <div><a href="${playerUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-primary text-white px-3 py-1 rounded">▶ Watch SO</a></div>
                    </div>
                `;
            }
        });

        detailsHTML += `
                </div>
            </div>
        `;
    }

    // Also render any discreteClips attached at top-level (server enrichment)
    const topClips = data.discreteClips || null;
    if (topClips && Array.isArray(topClips) && topClips.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">🔔 Shootout / Extra Clips</h4>
                <div class="space-y-2">
        `;

        topClips.forEach((cid) => {
            if (!cid) return;
            const playerUrl = `https://players.brightcove.net/6415718365001/EXtG1xJ7H_default/index.html?videoId=${cid}`;
            detailsHTML += `
                <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                    <div class="text-sm">Clip ID ${cid}</div>
                    <div><a href="${playerUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-primary text-white px-3 py-1 rounded">▶ Watch</a></div>
                </div>
            `;
        });

        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    // Scoring Summary
    if (data.summary?.scoring && data.summary.scoring.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    🎯 Scoring Summary
                </h4>
                <div class="space-y-3">
        `;
        
        data.summary.scoring.forEach(period => {
            if (period.goals && period.goals.length > 0) {
                detailsHTML += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="font-semibold text-gray-700 mb-3">${period.periodDescriptor?.periodType || 'Period'} ${period.periodDescriptor?.number || ''}</div>
                        <div class="space-y-3">
                `;
                
                period.goals.forEach(goal => {
                    const teamAbbrev = goal.teamAbbrev?.default || '';
                    // Scorer full name: prefer firstName/lastName if provided
                    const scorerFirst = (goal.firstName && goal.firstName.default) ? goal.firstName.default : '';
                    const scorerLast = (goal.lastName && goal.lastName.default) ? goal.lastName.default : '';
                    const scorerName = (scorerFirst || scorerLast) ? `${scorerFirst} ${scorerLast}`.trim() : (goal.name?.default || 'Unknown');
                    const scorerId = goal.scorerId || goal.playerId || null;
                    // Build assists list as HTML with links when player ids are present
                    let assists = '';
                    if (goal.assists && Array.isArray(goal.assists) && goal.assists.length > 0) {
                        assists = goal.assists.map(a => {
                            const aFirst = (a.firstName && a.firstName.default) ? a.firstName.default : '';
                            const aLast = (a.lastName && a.lastName.default) ? a.lastName.default : '';
                            const aName = (aFirst || aLast) ? `${aFirst} ${aLast}`.trim() : (a.name?.default || '');
                            const aId = a.playerId || a.id || null;
                            if (aId) return `<a href="/player/${aId}" class="underline">${aName}</a>`;
                            return aName;
                        }).filter(n => n).join(', ');
                    }
                    const time = goal.timeInPeriod || '';
                    const strength = goal.strength || '';
                    const shotType = goal.shotType || '';
                    const score = `${goal.homeScore}-${goal.awayScore}`;
                    const highlightUrl = goal.highlightClipSharingUrl || '';
                    // Only show the discrete "Watch Clip" for SO scoring period goals
                    const discreteClipId = (period.periodDescriptor && period.periodDescriptor.periodType === 'SO') ? (goal.discreteClip || goal.discreteClipFr || null) : null;
                    const goalModifier = goal.goalModifier || '';
                    
                    let strengthBadge = '';
                    if (strength === 'pp') {
                        strengthBadge = '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">PP</span>';
                    } else if (strength === 'sh') {
                        strengthBadge = '<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-semibold">SH</span>';
                    }
                    
                    if (goalModifier === 'empty-net') {
                        strengthBadge += ' <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">EN</span>';
                    }
                    
                    detailsHTML += `
                        <div class="flex items-start gap-3 text-sm bg-white rounded p-3">
                               <a href="/team/${teamAbbrev}" class="inline-block"><img src="https://assets.nhle.com/logos/nhl/svg/${teamAbbrev}_light.svg" alt="${teamAbbrev}" class="w-8 h-8 flex-shrink-0"></a>
                               <a href="/player/${scorerId || ''}" class="inline-block"><img src="${goal.headshot}" alt="${scorerName}" class="w-10 h-10 rounded-full object-cover flex-shrink-0"></a>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold"><a href="/player/${scorerId || ''}" class="underline">${scorerName}</a> (${goal.goalsToDate || 0}) ${strengthBadge}</div>
                                ${assists ? `<div class="text-gray-600 text-xs mt-1">Assists: ${assists}</div>` : ''}
                                <div class="text-gray-500 text-xs mt-1">${shotType ? shotType + ' shot' : ''}</div>
                                ${highlightUrl ? `<div class="mt-2"><a href="${highlightUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1 rounded hover:bg-secondary transition">🎥 Watch Highlight</a></div>` : ''}
                                ${discreteClipId ? `<div class="mt-2"><a href="https://players.brightcove.net/6415718365001/EXtG1xJ7H_default/index.html?videoId=${discreteClipId}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1 rounded hover:bg-secondary transition">▶ Watch Clip</a></div>` : ''}
                            </div>
                            <div class="text-right flex-shrink-0">
                                <div class="font-mono text-xs text-gray-600">${time}</div>
                                <div class="font-bold text-sm text-primary">${score}</div>
                            </div>
                        </div>
                    `;
                });
                
                detailsHTML += `
                        </div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    // Penalties
    if (data.summary?.penalties && data.summary.penalties.length > 0) {
        detailsHTML += `
            <div class="mb-6">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    🚨 Penalties
                </h4>
                <div class="space-y-3">
        `;
        
        data.summary.penalties.forEach(period => {
            if (period.penalties && period.penalties.length > 0) {
                detailsHTML += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="font-semibold text-gray-700 mb-3">${period.periodDescriptor?.periodType || 'Period'} ${period.periodDescriptor?.number || ''}</div>
                        <div class="space-y-2">
                `;
                
                period.penalties.forEach(penalty => {
                    const teamAbbrev = penalty.teamAbbrev?.default || '';
                    const descKey = penalty.descKey || '';
                    const duration = penalty.duration || 0;
                    const type = penalty.type || '';
                    const penaltyType = type === 'MIN' ? 'Minor' : type === 'MAJ' ? 'Major' : type;
                    const time = penalty.timeInPeriod || '';
                    
                    // Handle bench penalties
                    const isBench = !penalty.committedByPlayer?.sweaterNumber;
                    let playerDisplay, penaltyDescription;
                    
                    if (isBench) {
                        playerDisplay = `Bench Minor`;
                        penaltyDescription = `(${duration} min)`;
                    } else {
                        const player = `${penalty.committedByPlayer?.firstName?.default || ''} ${penalty.committedByPlayer?.lastName?.default || ''}`.trim();
                        const number = penalty.committedByPlayer?.sweaterNumber || '';
                        const pId = penalty.committedByPlayer?.playerId || penalty.committedByPlayer?.id || '';
                        if (pId) {
                            playerDisplay = `<a href="/player/${pId}" class="underline">${player}</a> #${number}`;
                        } else {
                            playerDisplay = `${player} #${number}`;
                        }
                        penaltyDescription = `${penaltyType} (${duration} min)`;
                    }
                    
                    detailsHTML += `
                        <div class="flex items-center gap-3 text-sm bg-white rounded p-2">
                            <img src="https://assets.nhle.com/logos/nhl/svg/${teamAbbrev}_light.svg" 
                                 alt="${teamAbbrev}" 
                                 class="w-6 h-6 flex-shrink-0">
                            <div class="flex-1">
                                <span class="font-semibold">${playerDisplay}</span>
                                <span class="text-gray-600"> - ${penaltyDescription} - ${descKey}</span>
                            </div>
                            <div class="text-gray-500 text-xs font-mono">${time}</div>
                        </div>
                    `;
                });
                
                detailsHTML += `
                        </div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `
                </div>
            </div>
        `;
    }
    
    return detailsHTML;
}

// Hydrate abbreviated three-stars names by fetching player details
async function hydrateThreeStarNames() {
    try {
        const anchors = Array.from(document.querySelectorAll('[id^="threeStarName-"]'));
        if (!anchors || anchors.length === 0) return;
        for (const a of anchors) {
            try {
                const id = a.id.replace('threeStarName-', '') || a.getAttribute('href').split('/').pop();
                if (!id) continue;
                const resp = await fetch(`/api/player/${id}`);
                if (!resp.ok) continue;
                const data = await resp.json();
                const first = (data.firstName && data.firstName.default) ? data.firstName.default : (data.firstName || '');
                const last = (data.lastName && data.lastName.default) ? data.lastName.default : (data.lastName || '');
                const display = (first || last) ? `${first} ${last}`.trim() : (data.playerName || data.playerName?.default || '');
                if (display && display.length > 0) {
                    a.textContent = display;
                }
            } catch (e) { /* ignore individual failures */ }
        }
    } catch (e) { /* ignore */ }
}

// Fetch and render game videos (Condensed + Recap only)
async function renderGameVideos(gameId) {
    try {
        const resp = await fetch(`/api/videos/${gameId}`);
        if (!resp.ok) return;
        const videoData = await resp.json();
        const videosList = document.getElementById('videosList');
        if (!videosList) return;
        videosList.innerHTML = '';

        const items = (videoData.items || []).filter(it => (it.tags || []).some(t => t.slug === 'condensed-game' || t.slug === 'game-recap'));
        items.sort((a,b) => {
            const aTags = (a.tags||[]).map(t=>t.slug);
            const bTags = (b.tags||[]).map(t=>t.slug);
            const aIsCond = aTags.includes('condensed-game');
            const bIsCond = bTags.includes('condensed-game');
            if (aIsCond && !bIsCond) return -1;
            if (bIsCond && !aIsCond) return 1;
            return 0;
        });

        items.forEach(item => {
            const tags = item.tags || [];
            const isCondensed = tags.some(t => t.slug === 'condensed-game');
            const isRecap = tags.some(t => t.slug === 'game-recap');
            if (!isCondensed && !isRecap) return;

            const bcAccount = item.fields && item.fields.brightcoveAccountId ? item.fields.brightcoveAccountId : (item.fields && item.fields.BrightcoveAccountID ? item.fields.BrightcoveAccountID : null);
            const bcId = item.fields && item.fields.brightcoveId ? item.fields.brightcoveId : (item.fields && item.fields.BrightcoveID ? item.fields.BrightcoveID : null);
            if (!bcAccount || !bcId) return;

            const playerUrl = `https://players.brightcove.net/${bcAccount}/EXtG1xJ7H_default/index.html?videoId=${bcId}`;
            const base = item.title || (item.context && item.context.title) || (isCondensed ? 'Condensed Game' : 'Recap');
            const sub = (item.context && item.context.subtitle) || (item.fields && item.fields.sourceTitle) || item.guid || item.id || '';
            const broadcastTag = tags.find(t => t.slug && (t.slug === 'national-broadcast' || t.slug.endsWith('-broadcast')));
            const broadcastLabel = broadcastTag ? ` (${broadcastTag.title || broadcastTag.slug})` : '';
            const meta = sub ? ` — ${sub}` : '';
            const title = `${base}${meta}${broadcastLabel}`;

            const row = document.createElement('div');
            row.className = 'bg-gray-50 rounded p-3 flex items-center justify-between';
            row.innerHTML = `<div class="text-sm truncate">${title}</div><div><a href="${playerUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-primary text-white px-3 py-1 rounded">▶ Watch</a></div>`;
            videosList.appendChild(row);
        });

        if (videosList.children.length > 0) {
            document.getElementById('videosSection').classList.remove('hidden');
        }
    } catch (e) {
        // ignore
    }
}
