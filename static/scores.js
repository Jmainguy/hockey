let currentDate = new Date();
let scoresTimer = null;
let scoresRequest = 0;
let scoresAbort = null;
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function formatTime(value) {return new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function gameStatus(game) {
    if (['OFF','FINAL'].includes(game.gameState)) return 'Final';
    if (game.gameScheduleState==='PPD') return 'Postponed';
    if (game.gameScheduleState==='CNCL') return 'Canceled';
    if (['LIVE','CRIT'].includes(game.gameState)) {
        const period=game.periodDescriptor?.number;
        return game.clock?.inIntermission ? 'Intermission' : `Live${period ? ' · Period ' + period : ''}`;
    }
    return game.startTimeUTC ? formatTime(game.startTimeUTC) : 'Time to be announced';
}
function createGameCard(game) {
    const card = document.createElement('a');
    card.className = 'score-row';
    card.href = `/game/${game.id}?from=schedule&date=${formatDate(currentDate)}`;
    const finalOrLive=['OFF','FINAL','LIVE','CRIT'].includes(game.gameState);
    const side = (team,label) => `<div class="score-team"><img src="${escapeHTML(team.logo || `https://assets.nhle.com/logos/nhl/svg/${team.abbrev}_light.svg`)}" alt=""><span>${escapeHTML(team.placeName?.default || team.abbrev)} ${escapeHTML(team.commonName?.default || '')}<small class="block text-gray-500 font-normal text-xs">${label}</small></span><strong>${finalOrLive ? (team.score ?? '–') : '–'}</strong></div>`;
    card.innerHTML = `<div class="score-state ${['LIVE','CRIT'].includes(game.gameState)?'live-label':''}">${escapeHTML(gameStatus(game))}<small>${game.gameType===1?'Preseason':game.gameType===3?'Playoffs':'Regular season'}</small></div>${side(game.awayTeam || {},'Away')}${side(game.homeTeam || {},'Home')}<div class="score-venue">${escapeHTML(game.venue?.default || '')}</div><span aria-hidden="true">→</span>`;
    card.querySelectorAll('img').forEach(img=>{img.onerror=()=>{img.style.visibility='hidden';};});
    return card;
}
async function loadGames(background = false) {
    clearTimeout(scoresTimer);
    scoresAbort?.abort();scoresAbort=new AbortController();
    const request=++scoresRequest;
    const date=formatDate(currentDate);
    document.getElementById('currentDate').textContent=currentDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    if (!background) {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('gamesContainer').classList.add('hidden');
    }
    document.getElementById('error').classList.add('hidden');
    try {
        const response=await hockeyFetch(`/api/schedule/${date}`,{signal:scoresAbort.signal});
        const data=await response.json();
        if(request!==scoresRequest)return;
        const games=(data.gameWeek || []).find(day=>day.date===date)?.games || [];
        const grid=document.getElementById('gamesGrid');grid.replaceChildren(...games.map(createGameCard));
        document.getElementById('noGames').classList.toggle('hidden',games.length>0);
        document.getElementById('gamesContainer').classList.remove('hidden');
        const live=games.some(g=>['LIVE','CRIT'].includes(g.gameState));
        const upcoming=games.some(g=>['FUT','PRE'].includes(g.gameState));
        if(!document.hidden && date===formatDate(new Date()) && (live || upcoming)) scoresTimer=setTimeout(()=>loadGames(true),live?30000:120000);
    } catch(error) {
        if(request!==scoresRequest)return;
        const root=document.getElementById('error');root.textContent='Scores are temporarily unavailable. Please try again shortly.';root.classList.remove('hidden');
        const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>loadGames();root.append(retry);
    } finally {if(request===scoresRequest)document.getElementById('loading').classList.add('hidden');}
}
document.addEventListener('DOMContentLoaded',()=>{
    const date=new URLSearchParams(location.search).get('date');
    if(date && /^\d{4}-\d{2}-\d{2}$/.test(date)) currentDate=new Date(date+'T12:00:00');
    document.getElementById('prevDay').onclick=()=>{currentDate.setDate(currentDate.getDate()-1);loadGames();};
    document.getElementById('nextDay').onclick=()=>{currentDate.setDate(currentDate.getDate()+1);loadGames();};
    document.getElementById('todayBtn').onclick=()=>{currentDate=new Date();loadGames();};
    loadGames();
});
document.addEventListener('visibilitychange',()=>{clearTimeout(scoresTimer);if(!document.hidden)loadGames(true);});
