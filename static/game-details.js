// Shared game details display functionality

function displayGameDetailsHTML(data) {
    const awayTeam = data.awayTeam;
    const homeTeam = data.homeTeam;
    const isFutureGame = data.gameState === 'FUT' || data.gameState === 'PRE';
    
    let detailsHTML = `
        <!-- Game Summary -->
        <div class="grid grid-cols-3 gap-4 items-center mb-6 pb-6 border-b">
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                     alt="${homeTeam.abbrev}" 
                     class="w-24 h-24 mx-auto mb-2">
                <div class="font-bold text-lg">${homeTeam.placeName?.default || homeTeam.abbrev}</div>
                <div class="text-sm text-gray-600 mt-1">${isFutureGame ? (homeTeam.record || 'Record TBD') : 'SOG: ' + (homeTeam.sog || 0)}</div>
            </div>
            <div class="text-center">
                <div class="text-5xl font-bold text-gray-800">${homeTeam.score || 0} - ${awayTeam.score || 0}</div>
                <div class="text-sm text-gray-600 mt-2">${data.gameState === 'FUT' ? 'Scheduled' : data.gameState === 'LIVE' ? 'Live' : 'Final'}</div>
                ${data.periodDescriptor ? `<div class="text-xs text-gray-500 mt-1">${data.periodDescriptor.periodType} - Period ${data.periodDescriptor.number}</div>` : ''}
            </div>
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${awayTeam.abbrev}_light.svg" 
                     alt="${awayTeam.abbrev}" 
                     class="w-24 h-24 mx-auto mb-2">
                <div class="font-bold text-lg">${awayTeam.placeName?.default || awayTeam.abbrev}</div>
                <div class="text-sm text-gray-600 mt-1">${isFutureGame ? (awayTeam.record || 'Record TBD') : 'SOG: ' + (awayTeam.sog || 0)}</div>
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
                                <img src="${homeLeader.headshot}" alt="${homeLeader.name?.default}" 
                                     class="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0">
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
                                <img src="${awayLeader.headshot}" alt="${awayLeader.name?.default}" 
                                     class="w-10 h-10 rounded-full object-cover border-2 border-gray-200 flex-shrink-0">
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
                                <img src="${goalie.headshot}" alt="${goalie.name?.default}" 
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
                                <img src="${goalie.headshot}" alt="${goalie.name?.default}" 
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
            
            detailsHTML += `
                <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 flex items-center gap-3">
                    <div class="text-3xl">${starEmoji}</div>
                    <img src="${player.headshot}" alt="${player.name?.default}" class="w-12 h-12 rounded-full object-cover">
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-sm truncate">${player.name?.default || ''}</div>
                        <div class="text-xs text-gray-600">${player.teamAbbrev} #${player.sweaterNo}</div>
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
                    const scorer = goal.name?.default || 'Unknown';
                    const assists = goal.assists ? goal.assists.map(a => a.name?.default || '').filter(n => n).join(', ') : '';
                    const time = goal.timeInPeriod || '';
                    const strength = goal.strength || '';
                    const shotType = goal.shotType || '';
                    const score = `${goal.homeScore}-${goal.awayScore}`;
                    const highlightUrl = goal.highlightClipSharingUrl || '';
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
                            <img src="https://assets.nhle.com/logos/nhl/svg/${teamAbbrev}_light.svg" 
                                 alt="${teamAbbrev}" 
                                 class="w-8 h-8 flex-shrink-0">
                            <img src="${goal.headshot}" alt="${scorer}" class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="font-bold">${scorer} (${goal.goalsToDate || 0}) ${strengthBadge}</div>
                                ${assists ? `<div class="text-gray-600 text-xs mt-1">Assists: ${assists}</div>` : ''}
                                <div class="text-gray-500 text-xs mt-1">${shotType ? shotType + ' shot' : ''}</div>
                                ${highlightUrl ? `<div class="mt-2"><a href="${highlightUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1 rounded hover:bg-secondary transition">🎥 Watch Highlight</a></div>` : ''}
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
                        playerDisplay = `${player} #${number}`;
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
