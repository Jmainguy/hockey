let seasonView = 'regular';
let availableSeasons = [];
function defaultSeasonView(){const season=availableSeasons.find(s=>String(s.id)===document.getElementById('seasonSelect').value);seasonView=season?.defaultView || 'regular';loadSeasonView();}
let bracketRequest = 0;
const seasonLabel = id => `${String(id).slice(0,4)}–${String(id).slice(4)}`;
document.addEventListener('DOMContentLoaded', async () => {
    const select = document.getElementById('seasonSelect');
    select.addEventListener('change', () => { if(seasonView==='preseason' || seasonView==='playoffs') loadSeasonView(); else defaultSeasonView(); });
    for (const [id, view] of [['preseasonView','preseason'],['regularView','regular'],['playoffView','playoffs']]) {
        document.getElementById(id).addEventListener('click', () => {seasonView=view; loadSeasonView();});
    }
    try {
        const data = await (await hockeyFetch('/api/standings-seasons')).json();
        // Modern standings use the current W/L/OT format; earlier eras used ties.
        const seasons = data.seasons.filter(s=>s.id>=20052006).sort((a,b)=>b.id-a.id);
        availableSeasons=seasons;
        select.replaceChildren(...seasons.map(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=seasonLabel(s.id);return option;}));
    } catch (_) { /* Latest standings remain usable if season discovery fails. */ }
    defaultSeasonView();
});
function loadSeasonView() {
    const season=document.getElementById('seasonSelect').value;
    document.getElementById('regularViewContent').hidden=seasonView==='playoffs';
    document.getElementById('playoffViewContent').hidden=seasonView!=='playoffs';
    document.getElementById('preseasonView').hidden=false;
    document.getElementById('preseasonView').setAttribute('aria-pressed',seasonView==='preseason');
    document.getElementById('regularView').setAttribute('aria-pressed',seasonView==='regular');
    document.getElementById('playoffView').setAttribute('aria-pressed',seasonView==='playoffs');
    if(seasonView!=='playoffs') {++bracketRequest;loadStandings(season,seasonView);} else loadSeasonBracket(season);
}
function playoffTeamName(team){return team?.name?.default || team?.abbrev || 'To be decided';}
function bracketLayout(series, seasonId) {
    const east = new Set(['BOS','BUF','CAR','CBJ','DET','FLA','MTL','NJD','NYI','NYR','OTT','PHI','PIT','TBL','TOR','WSH','ATL']);
    if(Number(seasonId)<20132014){east.delete("DET");east.delete("CBJ");east.add("WPG");}
    const positions=[];
    for(const side of ['east','west']) {
        for(let round=1;round<=3;round++) {
            const matches=series.filter(s=>s.playoffRound===round && (east.has(s.topSeedTeam?.abbrev)?'east':'west')===side).sort((a,b)=>a.seriesLetter.localeCompare(b.seriesLetter));
            matches.forEach((match,i)=>positions.push({match,side,col:side==='east'?round-1:7-round,y:32+(i+.5)*528/matches.length}));
        }
    }
    series.filter(s=>s.playoffRound===4).forEach(match=>positions.push({match,side:'final',col:3,y:296}));
    return positions;
}
function renderSeasonBracket(data) {
    const series=data.series || [];
    const final=series.find(s=>s.playoffRound===4);
    const champion=final && [final.topSeedTeam,final.bottomSeedTeam].find(t=>t && t.id===final.winningTeamId);
    document.getElementById('championBanner').textContent=champion ? `${seasonLabel(data.seasonId)} Stanley Cup champion · ${playoffTeamName(champion)}` : 'Stanley Cup champion · Not yet decided';
    const positions=bracketLayout(series,data.seasonId), width=160, columns=[0,186,372,558,844,1030,1216];
    const lines=[];
    for(const target of positions){
        const ids=[target.match.topSeedTeam?.id,target.match.bottomSeedTeam?.id].filter(Boolean);
        for(const source of positions.filter(p=>p.match.playoffRound===target.match.playoffRound-1 && ids.includes(p.match.winningTeamId))){
            const right=source.col<target.col;
            const x1=columns[source.col]+(right?(source.col===3?260:width):0), x2=columns[target.col]+(right?0:(target.col===3?260:width)), mid=(x1+x2)/2;
            lines.push(`<path d="M${x1},${source.y} H${mid} V${target.y} H${x2}"/>`);
        }
    }
    const headings=['Round 1','Round 2','East final','','West final','Round 2','Round 1'];
    document.getElementById('seasonBracket').innerHTML=`<div class="conference-label east-label">Eastern Conference</div><div class="conference-label west-label">Western Conference</div><svg class="bracket-lines" viewBox="0 0 1376 580" aria-hidden="true">${lines.join('')}</svg>${headings.map((label,i)=>`<h2 class="tree-heading" style="left:${columns[i]}px">${label}</h2>`).join('')}${positions.map(({match:s,col,y,side})=>`<a class="tree-match ${side==='final'?'cup-match':''}" style="left:${columns[col]}px;top:${y}px" href="/playoff-series/${encodeURIComponent(data.seasonId)}/${encodeURIComponent(s.seriesLetter)}" aria-label="${escapeHTML(playoffTeamName(s.topSeedTeam)+' versus '+playoffTeamName(s.bottomSeedTeam))}">${side==='final'?'<div class="cup-title"><span>STANLEY CUP</span><strong>Final</strong></div>':''}${[[s.topSeedTeam,s.topSeedWins],[s.bottomSeedTeam,s.bottomSeedWins]].map(([t,w])=>{
        const won=t && t.id===s.winningTeamId;
        const logo=t?.logo || (t?.abbrev?`https://assets.nhle.com/logos/nhl/svg/${encodeURIComponent(t.abbrev)}_light.svg`:'');
        return `<div class="tree-team ${won?'series-winner':''}" title="${escapeHTML(playoffTeamName(t))}${won?' · Series winner':''}">${logo?`<img src="${escapeHTML(logo)}" alt="" width="36" height="36">`:'<span></span>'}<span>${escapeHTML(t?.commonName?.default || playoffTeamName(t))}</span><strong>${w ?? '–'}</strong>${won?'<span class="sr-only">Series winner</span>':''}</div>`;
    }).join('')}</a>`).join('')}`;
}
async function loadSeasonBracket(season) {
    const request=++bracketRequest;
    const root=document.getElementById('seasonBracket'),banner=document.getElementById('championBanner');
    banner.textContent='';root.textContent='Loading playoffs…';
    try {
        if(!season) throw new Error('Select a season');
        const data=await(await hockeyFetch('/api/playoff-bracket?season='+season)).json();
        if(request!==bracketRequest)return;
        if(!data.series?.length){root.textContent='No playoff bracket is available for this season.';return;}
        renderSeasonBracket(data);
    }catch(_){if(request===bracketRequest){root.innerHTML='Playoff results are unavailable. <button type="button" id="retryBracket">Retry</button>';document.getElementById('retryBracket').onclick=()=>loadSeasonBracket(season);}}
}
