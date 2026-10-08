'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?null:args[i+1];},output=arg('--output');
assert.ok(output,'Use --output <gallery directory> --runs <comma-separated evidence directories>');
const out=path.resolve(output),runs=(arg('--runs')||'').split(',').filter(Boolean).map(x=>path.resolve(x)),labels=(arg('--labels')||'').split(',');assert.ok(runs.length,'At least one evidence run is required');
fs.mkdirSync(out,{recursive:true});assert.ok(!fs.existsSync(path.join(out,'index.html')),'Gallery output is immutable; choose a new directory');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex'),files=[],sections=[];
function figure(run,shot,label,width){
  if(!shot)return '';
  const file=path.join(run,shot.file);assert.ok(fs.existsSync(file),`Real screenshot exists: ${file}`);assert.equal(SHA(fs.readFileSync(file)),shot.sha256,`Screenshot hash matches browser evidence: ${file}`);
  const relative=path.relative(out,file).split(path.sep).map(part=>part==='..'?'..':encodeURIComponent(part)).join('/');files.push({file:path.relative(out,file),sha256:shot.sha256});
  return `<figure><figcaption>${esc(label)}</figcaption><a href="${relative}"><img src="${relative}" width="${width}" alt="${esc(label)}" loading="lazy"></a></figure>`;
}
for(const [runIndex,run]of runs.entries()){
  const report=JSON.parse(fs.readFileSync(path.join(run,'results.json'),'utf8'));
  const panels=[];
  for(const result of report.results){
    const v=result.viewport,label=`${report.engine} · ${v.width}×${v.height} · ${result.status}`;
    if(result.fullContent)panels.push(figure(run,result.fullContent,label+' · entire internal content (qualified isolated exposure)',Math.min(430,v.width)));
    for(const shot of result.scroll?.shots||[])panels.push(figure(run,shot,label+` · native viewport · scroll ${Math.round(shot.scrollTop)}px`,Math.min(430,v.width)));
    if(result.homeDiamondCapture)panels.push(figure(run,result.homeDiamondCapture,label+' · Home diamond entry',Math.min(430,v.width)));
  }
  sections.push(`<section><h2>${esc(labels[runIndex]||path.basename(run))} · ${esc(report.engine)} · ${esc(report.hosted?'actual hosted website':'local HTTP application')} · ${esc(report.status)}</h2><p>Completed ${esc(report.completedAt||'not completed')}. Source ${esc(report.source.gitHead)}. Team snapshot ${esc(report.source.teamFormHash)}.</p><div class="grid">${panels.join('\n')}</div></section>`);
}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — team details QA evidence</title><style>body{margin:0;background:#050a10;color:#e9f4ff;font:15px/1.6 system-ui;padding:24px}h1{font-size:25px}h2{font-size:20px;margin-top:32px}p{max-width:1100px}.source{border:1px solid #1e8cac;background:#081c28;padding:18px;border-radius:9px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:22px}figure{margin:0;max-width:430px}figcaption{font-size:13px;min-height:45px;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;border:1px solid #29435b}a{color:#55ddff}@media(max-width:380px){body{padding:12px}.grid{grid-template-columns:1fr}}</style><h1>Dallas team details — genuine browser evidence</h1><div class="source"><strong>Approved source: the Dallas team-details / Form render attached in the project chat.</strong><p>The original attachment bytes were unavailable for this gallery. Independent AI-agent visual inspections use that user-approved attachment; this page does not claim an independent human audit or a registered pixel comparison. Screenshot files below are untouched, naturally animated browser captures with verified evidence hashes. Full-content sheets expose the real internal scroller only on a separate app page; top/mid/bottom captures show normal viewport presentation.</p><p>The render’s example scores, record, opponent and venue are illustrative. The app must show verified current source values, with missing information unavailable. Mobile browser emulation does not certify physical iPhone Safari controls or frame rate.</p></div>${sections.join('\n')}</html>`;
fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'gallery-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'Approved Dallas team-details / Form chat attachment',originalSourceBytesAvailable:false,screenshots:files,indexSha256:SHA(Buffer.from(html))},null,2));console.log(path.join(out,'index.html'));
