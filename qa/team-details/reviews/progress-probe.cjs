'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const [target]=await (await fetch('http://127.0.0.1:9229/json/list')).json();
 assert.equal(target.url,'file:///workspace/project-dollers/qa/team-details/run.cjs');
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
 function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
 try{
  const proto=await call('Runtime.evaluate',{expression:"Object.values(process.mainModule.constructor._cache).find(m=>m.filename.endsWith('/client/connection.js')).exports.Connection.prototype",objectGroup:'qa-read-only-probe'});
  assert.ok(proto.result.objectId,'Existing connection prototype is inspectable');
  const objects=await call('Runtime.queryObjects',{prototypeObjectId:proto.result.objectId,objectGroup:'qa-read-only-probe'});
  const state=await call('Runtime.callFunctionOn',{objectId:objects.objects.objectId,functionDeclaration:"function(){return this.map(c=>({objectCount:c._objects.size,closed:c._closed,pending:[...c._callbacks].map(([id,v])=>({id,type:v.type,method:v.method,title:v.title})),pages:[...c._objects.values()].filter(o=>o.constructor.name==='Page').map(p=>({guid:p._guid,url:p._mainFrame?._url}))}));}",returnByValue:true});
  const receipt={at:new Date().toISOString(),ownerPid:218818,qualification:'Read-only owned QA Node inspector. No Debugger domain, pause, native-browser client, app state writes or source/test changes.',connections:state.result.value};
  const out='qa/team-details/reviews/webkit-v2-progress-'+Date.now()+'.json';fs.writeFileSync(out,JSON.stringify(receipt,null,2));console.log(JSON.stringify({file:out,...receipt},null,2));
  await call('Runtime.releaseObjectGroup',{objectGroup:'qa-read-only-probe'});
 }finally{ws.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
