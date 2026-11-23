// node pool.js [from] [to]: unread lines among the top cards (ranks from..to), with the current engine
const fs=require('fs'),path=require('path');const G=require(require('path').join(__dirname, '..', '..', 'goldfish', 'static', 'sim.js'));
const DIR=require('path').join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const top=JSON.parse(fs.readFileSync(path.join(DIR,'..','top-cards.json'),'utf8')).cards;
const from=+process.argv[2]||1,to=+process.argv[3]||top.length; const files={};
const setFile=c=>{const f=/^(con|prn|aux|nul|com\d|lpt\d)$/.test(c)?c+'_':c; if(!files[f]) files[f]=JSON.parse(fs.readFileSync(path.join(DIR,f+'.json'),'utf8')); return files[f];};
if(G.setTribe) G.setTribe('Merfolk'); let n=0,bad=0,lines=0; const out=[];
top.forEach((t,i)=>{ if(i+1<from||i+1>to) return; const s=setFile(t.set); const c=(s.cards||s).find(x=>x.name===t.name&&!x.ref); if(!c){out.push('MISSING '+t.name);return;}
  n++; const card=Object.assign({qty:1},c); let a; try{ a=G.analyze(card,['W','U','B','R','G']);}catch(e){out.push('ERR '+t.name+' '+e.message);return;}
  const ig=(a.coverage||[]).filter(v=>v.status==='ignored'||v.tag==='dev'); if(ig.length){bad++;lines+=ig.length;out.push((i+1)+' '+t.name+' :: '+ig.map(v=>v.text).join(' || '));} });
console.log(`cards ${n}, with unread lines ${bad}, unread lines ${lines}`); if(process.argv[4]) console.log(out.join('\n'));
