// Shared game details display functionality

function displayGameDetailsHTML(data) {
    const awayTeam = data.awayTeam;
    const homeTeam = data.homeTeam;
    
    let detailsHTML = `
        <!-- Game Summary -->
        <div class="grid grid-cols-3 gap-4 items-center mb-6 pb-6 border-b">
            <div class="text-center">
                <img src="https://assets.nhle.com/logos/nhl/svg/${homeTeam.abbrev}_light.svg" 
                     alt="${homeTeam.abbrev}" 
                     class="w-24 h-24 mx-auto mb-2">
                <div class="font-bold text-lg">${homeTeam.placeName?.default || homeTeam.abbrev}</div>
                <div class="text-sm text-gray-600 mt-1">SOG: ${homeTeam.sog || 0}</div>
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
                <div class="text-sm text-gray-600 mt-1">SOG: ${awayTeam.sog || 0}</div>
            </div>
        </div>
    `;
    
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
