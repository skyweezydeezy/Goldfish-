const fs=require('fs'),path=require('path');const G=require(require('path').join(__dirname, '..', '..', 'goldfish', 'static', 'sim.js'));
const DIR=require('path').join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const top=JSON.parse(fs.readFileSync(path.join(DIR,'..','top-cards.json'),'utf8')).cards; const files={};
const setFile=c=>{const f=/^(con|prn|aux|nul|com\d|lpt\d)$/.test(c)?c+'_':c; if(!files[f]) files[f]=JSON.parse(fs.readFileSync(path.join(DIR,f+'.json'),'utf8')); return files[f];};
G.setTribe('Merfolk'); let lines=0,person=0,act=0; const rest=[];
top.forEach((t,i)=>{ const s=setFile(t.set); const c=(s.cards||s).find(x=>x.name===t.name&&!x.ref); if(!c) return; const card=Object.assign({qty:1},c); card.a=G.analyze(card,['W','U','B','R','G']);
  const ig=(card.a.coverage||[]).filter(v=>v.status==='ignored'||v.tag==='dev'); if(!ig.length) return; const ok=new Set(G.otherAbilities(card).map(l=>l.raw));
  for(const v of ig){ lines++; const raw=(v.text||'').replace(/\([^)]*\)/g,'').trim(); if(ok.has(raw)) person++; else { if(/^[^:"]+: ./.test(raw)&&/^(\{|sacrifice|pay|discard|remove|tap |exile)/i.test(raw)) act++; rest.push((i+1)+' '+t.name+' :: '+raw); } } });
console.log({lines,person,otherActivated:act,rest:rest.length}); if (process.argv[2]) fs.writeFileSync(process.argv[2], rest.join('\n'));
