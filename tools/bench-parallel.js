// T-064: browser bench. Plays the same seeded run on one worker and on ParWorker (several workers), checks the results are identical and prints both times.
//   node tools/bench-parallel.js [sim|match|pod]      needs playwright (npm i playwright) and a Chromium
const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const base=path.join(__dirname,'..'), root=path.join(base,'goldfish/static');
const srv=http.createServer((q,r)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0])); if(q.url==='/')f=root+'/index.html'; if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();} const ext=path.extname(f);r.writeHead(200,{'content-type':ext=='.js'?'text/javascript':ext=='.html'?'text/html':ext=='.json'?'application/json':'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(0);
(async()=>{const port=srv.address().port;const b=await chromium.launch();const pg=await b.newPage();pg.on('pageerror',e=>console.log('PAGEERR',e.message));
await pg.goto('http://localhost:'+port+'/');await pg.waitForTimeout(1500);
const fx=n=>JSON.parse(fs.readFileSync(path.join(base,'tests/fixtures')+'/'+n+'-loaded.json','utf8'));
const A=fx('zul-ashur'),B=fx('death-tax'),C=fx('mermaids'),D=fx('soul-brokers');
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const run=(msg,nopar)=>pg.evaluate(([msg,nopar])=>new Promise((res,rej)=>{window.__noPar=nopar;const t=performance.now();const w=ParWorker();let maxp=0;w.onmessage=e=>{if(e.data.progress!=null)maxp=Math.max(maxp,e.data.progress);if(e.data.result)res({r:JSON.stringify(e.data.result),ms:performance.now()-t,maxp});};w.onerror=e=>rej(e.message);w.postMessage(msg);}),[msg,nopar]);
console.log('cores',await pg.evaluate(()=>navigator.hardwareConcurrency));
const tests={sim:{cards:A.cards,tokens:A.tokens,opts:O,n:2000,seed:5},
 match:{match:{cardsA:A.cards,tokensA:A.tokens,cardsB:B.cards,tokensB:B.tokens},opts:O,n:600,seed:5},
 learn:{learn:{cards:A.cards,tokens:A.tokens,candidates:[{name:'base',policy:{}},{name:'alt',policy:{landDrops:'greedy'}}],mode:'field',cardsB:[{cards:B.cards,tokens:B.tokens},{cards:C.cards,tokens:C.tokens}],tokensB:null},opts:O,n:300,seed:5},
 pod:{pod:{players:[A,B,C,D].map(x=>({cards:x.cards,tokens:x.tokens,policy:{}}))},opts:O,n:240,seed:5}};
for(const [k,m] of Object.entries(tests).filter(x=>!process.argv[2]||x[0]===process.argv[2])){const a=await run(m,true),c=await run(m,false);console.log(k,'identical',a.r===c.r,'single',Math.round(a.ms),'ms','parallel',Math.round(c.ms),'ms',a.r.length,'maxp',c.maxp.toFixed(2));}
await b.close();srv.close();})().catch(e=>{console.log('ERR',e);process.exit(1)});
