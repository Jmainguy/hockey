const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function element(){return {textContent:'',innerHTML:'',dataset:{},style:{},addEventListener(){},classList:{add(){},remove(){},toggle(){}},replaceChildren(...children){this.children=children},append(){},querySelectorAll(){return []}};}
function scope(){const elements=new Map();return {console,URLSearchParams,URL,Date,AbortController,setTimeout,clearTimeout,escapeHTML:s=>String(s??''),document:{hidden:false,addEventListener(){},createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}},location:{search:''},elements};}
test('all browser scripts parse, including inline page scripts',()=>{
 for(const file of fs.readdirSync('static').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync('static/'+file,'utf8'),{filename:file});
 for(const file of fs.readdirSync('templates'))for(const match of fs.readFileSync('templates/'+file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:file});
});
test('missing roster stats are dashes while known zeroes remain zero',()=>{
 const context=vm.createContext({...scope(),window:{}});new vm.Script(fs.readFileSync('static/team.js','utf8')).runInContext(context);
 context.player={id:1,name:'Player',position:'F',stats:null};
 let card=vm.runInContext('createPlayerCard(player)',context);assert.ok(card.innerHTML.includes('>–</span>'));assert.equal(card.href,'/player/1');
 context.player.stats={games:0,goals:0,assists:0,points:0,plusMinus:0};card=vm.runInContext('createPlayerCard(player)',context);assert.ok(card.innerHTML.includes('>0</span>'));assert.ok(card.innerHTML.includes('>+0</span>'));
});
test('a slow old date cannot replace the newly selected scoreboard',async()=>{
 const pending=[];const env=scope();env.hockeyFetch=(url)=>new Promise(resolve=>pending.push({url,resolve}));
 const context=vm.createContext(env);new vm.Script(fs.readFileSync('static/scores.js','utf8')).runInContext(context);
 const first=vm.runInContext("currentDate=new Date('2020-01-01T12:00:00');loadGames()",context);
 const second=vm.runInContext("currentDate=new Date('2020-01-02T12:00:00');loadGames()",context);
 const response=(date,id)=>({json:async()=>({gameWeek:[{date,games:[{id,gameState:'OFF',homeTeam:{abbrev:'CAR'},awayTeam:{abbrev:'BOS'}}]}]})});
 pending[1].resolve(response('2020-01-02',2));await second;
 pending[0].resolve(response('2020-01-01',1));await first;
 assert.equal(env.elements.get('gamesGrid').children[0].href,'/game/2?from=schedule&date=2020-01-02');
});
test('critical live games at zero on the clock are not final',()=>{
 const context=vm.createContext({...scope(),window:{}});new vm.Script(fs.readFileSync('static/game-details.js','utf8')).runInContext(context);
 assert.equal(vm.runInContext("isGameFinal({gameState:'CRIT',clock:{secondsRemaining:0}})",context),false);
 assert.equal(vm.runInContext("isGameFinal({gameState:'OFF'})",context),true);
});
test('playoff champion comes from the final, not a prior-round winner',()=>{
 const env=scope(),context=vm.createContext(env);new vm.Script(fs.readFileSync('static/season-browser.js','utf8')).runInContext(context);
 context.data={seasonId:20242025,series:[{seriesLetter:'A',playoffRound:1,winningTeamId:1,topSeedTeam:{id:1,name:{default:'Other'}},bottomSeedTeam:{id:2}},{seriesLetter:'O',playoffRound:4,winningTeamId:13,topSeedTeam:{id:22,name:{default:'Edmonton Oilers'}},bottomSeedTeam:{id:13,name:{default:'Florida Panthers'}},topSeedWins:2,bottomSeedWins:4}]};
 vm.runInContext('renderSeasonBracket(data)',context);
 assert.match(env.elements.get('championBanner').textContent,/2024–2025 Stanley Cup champion · Florida Panthers/);
 assert.match(env.elements.get('seasonBracket').innerHTML,/\/playoff-series\/20242025\/O/);
 context.data.series[1].winningTeamId=null;vm.runInContext('renderSeasonBracket(data)',context);assert.match(env.elements.get('championBanner').textContent,/Not yet decided/);
});
test('bracket mirrors conferences around the final and respects pre-realignment teams',()=>{
 const context=vm.createContext(scope());new vm.Script(fs.readFileSync('static/season-browser.js','utf8')).runInContext(context);
 context.matches=[{playoffRound:1,seriesLetter:'A',topSeedTeam:{abbrev:'CAR'}},{playoffRound:1,seriesLetter:'E',topSeedTeam:{abbrev:'VGK'}},{playoffRound:4,seriesLetter:'O'}];
 const layout=vm.runInContext('bracketLayout(matches,20252026)',context);
 assert.equal(layout.find(p=>p.match.seriesLetter==='A').col,0);assert.equal(layout.find(p=>p.match.seriesLetter==='E').col,6);assert.equal(layout.find(p=>p.match.seriesLetter==='O').col,3);
 context.matches=[{playoffRound:1,seriesLetter:'E',topSeedTeam:{abbrev:'DET'}}];
 assert.equal(vm.runInContext('bracketLayout(matches,20122013)[0].side',context),'west');
});
test('selected season follows preseason default then switches to regular when metadata changes',()=>{
 const env=scope(),context=vm.createContext(env);new vm.Script(fs.readFileSync('static/season-browser.js','utf8')).runInContext(context);
 vm.runInContext('loadSeasonView=()=>{}',context);
 env.document.getElementById('seasonSelect').value='20262027';
 vm.runInContext("availableSeasons=[{id:20262027,defaultView:'preseason'}];defaultSeasonView()",context);
 assert.equal(vm.runInContext('seasonView',context),'preseason');
 vm.runInContext("availableSeasons[0].defaultView='regular';defaultSeasonView()",context);
 assert.equal(vm.runInContext('seasonView',context),'regular');
});
test('trivia formats NHL player birthplace fields and omits missing ones',()=>{
 const env=scope();env.window={location:{search:'?team=car'}};
 env.hockeyFetch=()=>new Promise(()=>{});
 const context=vm.createContext(env);new vm.Script(fs.readFileSync('static/trivia.js','utf8')).runInContext(context);
 assert.equal(vm.runInContext("playerBirthplace({birthCity:{default:'Raleigh'},birthStateProvince:{default:'NC'},birthCountry:'USA'})",context),'Raleigh, NC, USA');
 assert.equal(vm.runInContext('playerBirthplace({})',context),'');
});
test('trivia loads a player birthplace before allowing reveal',async()=>{
 const env=scope();env.window={location:{search:'?team=car'}};
 let resolvePlayer;
 env.hockeyFetch=()=>new Promise(resolve=>{resolvePlayer=resolve});
 const context=vm.createContext(env);new vm.Script(fs.readFileSync('static/trivia.js','utf8')).runInContext(context);
 vm.runInContext("roster=[{id:7,name:'Player',photo:'/photo.jpg'}]",context);
 const loaded=vm.runInContext('loadPlayer()',context);
 assert.equal(env.elements.get('revealBtn').disabled,true);
 resolvePlayer({json:async()=>({birthCity:{default:'Toronto'},birthStateProvince:{default:'ON'},birthCountry:'CAN'})});
 await loaded;
 assert.equal(env.elements.get('playerBirthplace').textContent,'Toronto, ON, CAN');
 assert.equal(env.elements.get('revealBtn').disabled,false);
});
test('player media keeps interviews separate from highlights and uses NHL images',()=>{
 const context=vm.createContext({...scope(),window:{location:{pathname:'/player/7'},addEventListener(){}}});
 new vm.Script(fs.readFileSync('static/player.js','utf8')).runInContext(context);
 assert.equal(vm.runInContext("isPlayerInterview({title:'POST-RAW | Player',tags:[]})",context),true);
 assert.equal(vm.runInContext("isPlayerInterview({title:'Player scores winning goal',tags:[{slug:'highlight'}]})",context),false);
 assert.equal(vm.runInContext("playerMediaImage({templateUrl:'https://media.d3.nhle.com/image/private/{formatInstructions}/prd/id'})",context),'https://media.d3.nhle.com/image/private/t_ratio4_3-size20/prd/id');
 assert.equal(vm.runInContext("playerMediaImage({templateUrl:'https://media.d3.nhle.com/image/private/{formatInstructions}/prd/id'},20,'16_9')",context),'https://media.d3.nhle.com/image/private/t_ratio16_9-size20/prd/id');
 assert.equal(vm.runInContext("playerMediaImage({templateUrl:'https://other.example/image'})",context),'');
});
test('team media selects player interviews and player photos',()=>{
 const context=vm.createContext({...scope(),window:{}});
 new vm.Script(fs.readFileSync('static/team-media.js','utf8')).runInContext(context);
 assert.equal(vm.runInContext("isTeamPlayerInterview({title:'POST-RAW | Player',tags:[{slug:'playerid-7'}]})",context),true);
 assert.equal(vm.runInContext("isTeamPlayerInterview({title:'POST-RAW | Coach',tags:[{slug:'teamid-22'}]})",context),false);
 assert.equal(vm.runInContext("isTeamPlayerInterview({title:'Player scores',tags:[{slug:'playerid-7'}]})",context),false);
 vm.runInContext("teamPlayerIDs=new Set(['7'])",context);
 assert.equal(vm.runInContext("isTeamPlayerInterview({title:'POST-RAW | Opponent',tags:[{slug:'playerid-8'}]})",context),false);
 assert.equal(vm.runInContext("teamMediaImage({templateUrl:'https://media.d3.nhle.com/image/private/{formatInstructions}/prd/id'},'16_9')",context),'https://media.d3.nhle.com/image/private/t_ratio16_9-size20/prd/id');
});
