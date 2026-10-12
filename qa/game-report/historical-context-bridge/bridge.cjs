'use strict';
// Read-only source/AST bridge. This never launches a browser or edits runtime.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const acorn=require('./acorn/acorn.js');
const root=path.resolve(__dirname,'../../..');
const gate=require(root+'/qa/home-gate.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const oldPath='/workspace/recovery-qa/game-report-before-historical-context.js';
const newPath=root+'/assets/matchup-breakdown.js';
const before=fs.readFileSync(oldPath,'utf8');
const after=fs.readFileSync(newPath,'utf8');
const accepted=JSON.parse(fs.readFileSync(root+'/qa/game-report/final-round1-acceptance.json'));
const current=gate.runtimeManifest();
const expectedOld='f68cc5c94bba4d92e0b80b7ad3d1e635d21d0a49abd43e79bfa7843f2f3f6645';
const expectedNew='44e9fc46e15a68583ef1c1417ed5ee9f7c9f7ceac4456668fff6383d4ed7e0de';
assert.equal(sha(before),expectedOld,'Saved original is the exact Q1 accepted Matchup source');
assert.equal(sha(after),expectedNew,'Current Matchup is the root-frozen historical-context patch');
assert.equal(accepted.source['assets/matchup-breakdown.js'],expectedOld);
const changed=Object.keys(current).filter(file=>current[file]!==accepted.source[file]);
assert.deepEqual(changed,['assets/matchup-breakdown.js'],'Exactly one runtime file changed');
assert.equal(Object.keys(current).length,731);
assert.deepEqual(Object.keys(current).sort(),Object.keys(accepted.source).sort(),'No runtime file added or removed');
const inverses=[
  {reason:'Historical date alone receives its source season year',
    from:"month:'short',...(Number(game.season) !== Number(dataset?.season) ? {year:'numeric'} : {})",
    to:"month:'short'"},
  {reason:'Season badge uses the selected fixture season',
    from:"${fixture()?.season || dataset?.season || ''} REGULAR SEASON",
    to:"${dataset?.season || ''} REGULAR SEASON"},
  {reason:'Historical fixture research is explicitly qualified as the latest dataset snapshot',
    from:"${fixture() && Number(fixture().season) !== Number(dataset.season) ? `Latest ${dataset.season} research snapshot · ` : ''}Last ${state.window}",
    to:"Last ${state.window}"}
];
let inverse=after;
for(const edit of inverses){
  assert.equal(inverse.split(edit.from).length-1,1,'Exactly one occurrence of declared expression: '+edit.reason);
  inverse=inverse.replace(edit.from,edit.to);
}
assert.equal(inverse,before,'Reversing only three declared expressions reproduces every original byte');
const parse=source=>acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
const normalized=value=>Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end','loc','range','raw'].includes(key)).map(([key,v])=>[key,normalized(v)])):value;
const oldAst=parse(before),newAst=parse(after);
assert.deepEqual(normalized(parse(inverse)),normalized(oldAst),'Inverse AST is identical to accepted original AST');
const statements=ast=>ast.body[0].expression.callee.body.body;
const oldStatements=statements(oldAst),newStatements=statements(newAst);
assert.equal(newStatements.length,oldStatements.length,'No controller statement inserted or removed');
const changedStatements=[];
const functions={};
for(let index=0;index<oldStatements.length;index++){
  const a=oldStatements[index],b=newStatements[index];
  if(JSON.stringify(normalized(a))!==JSON.stringify(normalized(b))){
    assert.equal(a.type,'FunctionDeclaration');assert.equal(b.type,'FunctionDeclaration');
    assert.equal(a.id.name,b.id.name);changedStatements.push(a.id.name);
  }else assert.equal(before.slice(a.start,a.end),after.slice(b.start,b.end),'Unchanged controller statement is byte-identical');
  if(a.type==='FunctionDeclaration')functions[a.id.name]=[before.slice(a.start,a.end),after.slice(b.start,b.end)];
}
assert.deepEqual(changedStatements.sort(),['context','dateTime','header']);
const book=JSON.parse(fs.readFileSync(root+'/assets/data/matchup-breakdown.json'));
const club=book.teams.CLE;
const fixtureGames=[...club.games,...(club.headToHeadGames||[])];
const historical=fixtureGames.find(g=>g.id==='2025_02_CLE_BAL');
assert.ok(historical);
const currentFixture=fixtureGames.find(g=>Number(g.season)===Number(book.season));
assert.ok(currentFixture);
const frozenFixture=game=>game?Object.freeze(structuredClone(game)):null;
function output(which,game,stateOverrides={}){
  const selected=frozenFixture(game);
  const state=Object.freeze({team:'CLE',window:5,mode:'average',season:'cross',venue:'all',...stateOverrides});
  const context=vm.createContext({Intl,Date,Number,dataset:Object.freeze({season:book.season}),state,error:null,
    fixture:()=>selected,escape:v=>String(v),icon:name=>'<svg>'+name+'</svg>',city:()=> 'Cleveland',
    panelName:()=> 'Cleveland',fixtureLabel:()=> 'FIXTURE'});
  for(const name of ['dateTime','header','context'])vm.runInContext(functions[name][which],context);
  return {date:vm.runInContext('dateTime(fixture())',context),
    header:vm.runInContext('header()',context),research:vm.runInContext('context()',context)};
}
const semantic=[];
for(const [label,game] of [['current',currentFixture],['current-string-season',{...currentFixture,season:String(book.season)}],
  ['missing-fixture',null],['current-missing-kickoff',{...currentFixture,kickoffUtc:null}],
  ['current-invalid-kickoff',{...currentFixture,kickoffUtc:'not-a-date'}]]){
  const old=output(0,game),fresh=output(1,game);
  assert.deepEqual(fresh,old,'Current/missing fixture rendered strings are byte-identical: '+label);
  semantic.push({case:label,currentStringsUnchanged:true,date:fresh.date});
}
const pastOld=output(0,historical),past=output(1,historical);
assert.ok(past.header.includes(historical.season+' REGULAR SEASON'));
assert.ok(past.date.includes(String(historical.season)));
assert.ok(past.research.includes(`Latest ${book.season} research snapshot · Last 5 team games`));
assert.ok(!pastOld.research.includes('research snapshot'));
semantic.push({case:'2025_02_CLE_BAL',selectedSeason:historical.season,oldDate:pastOld.date,newDate:past.date,
  actualSeasonBadge:true,latestResearchSnapshotQualified:true});
const pastMissing=output(1,{...historical,kickoffUtc:null});
assert.equal(pastMissing.date,'Kickoff unavailable','A source conflict remains unavailable rather than receiving a fabricated date');
semantic.push({case:'historical-unavailable-kickoff',date:pastMissing.date});
assert.deepEqual(gate.runtimeManifest(),current,'Runtime stayed untouched throughout this read-only proof');
const receipt={status:'passed',checkedAt:new Date().toISOString(),browserLaunched:false,runtimeEdited:false,
  parser:{name:'Acorn',version:acorn.version,sha256:sha(fs.readFileSync(__dirname+'/acorn/acorn.js'))},
  old:{path:oldPath,sha256:sha(before)},current:{path:newPath,sha256:sha(after)},
  inverseSourceSha256:sha(inverse),inverseExactlyRestoresOriginal:true,inverseAstIdentical:true,
  changedControllerFunctions:changedStatements,controllerStatements:oldStatements.length,
  unchangedStatements:oldStatements.length-changedStatements.length,declaredEdits:inverses,
  unchangedRuntimeBodies:730,sourceCount:731,source:current,semantic,
  qualification:'Source/AST inverse proof and isolated function-render semantics only. Existing accepted Q1 navigation/control/data proofs bridge via exact unchanged statements and730 unchanged bodies; new historical geometry/native labels await independent QA2 screenshots. No browser or DOM substitution was used.'};
const target=__dirname+'/source-ast-bridge.json';assert.ok(!fs.existsSync(target),'Fresh immutable bridge receipt');
fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,path:target,sha256:sha(fs.readFileSync(target)),semantic}));
