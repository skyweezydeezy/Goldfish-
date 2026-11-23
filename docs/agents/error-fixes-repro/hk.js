const fs=require('fs'),path=require('path');const R='/home/user/Goldfish-';
const G=require(R+'/goldfish/static/sim.js');
const Z=JSON.parse(fs.readFileSync(R+'/tests/fixtures/mermaids-loaded.json','utf8'));
const deck=G.buildDeck(Z.cards,Z.tokens);
const O={turns:12,onPlay:false,minLands:2,maxLands:5,freeMulligan:true,minHandSize:5,oppLife:40,prioritizeCommander:true};
let cast=0,miss=0,post=0;
for(let s=1;s<=150;s++){const g=G.newGame(deck,O,s);G.mulligan(g);
 for(let t=0;t<12;t++){const had=g.battlefield.some(p=>/Hakbal/.test(p.card.name));const ev=G.playTurn(g);
  const hk=g.battlefield.find(p=>/Hakbal/.test(p.card.name));
  if(!had&&hk){cast++;const txt=ev.map(e=>e.type+':'+(e.text||(e.card&&e.card.name)||'')).join(' | ');
   const i=ev.findIndex(e=>/Hakbal/.test(JSON.stringify(e.card&&e.card.name||e.text||'')));
   const ex=ev.some(e=>/Hakbal[^:]* explores:/.test(e.text||''));
   if(!ex){miss++; if(miss<4) console.log('seed',s,'turn',g.turn,txt.slice(0,1500));}
   break;}}}
console.log({cast,miss});
