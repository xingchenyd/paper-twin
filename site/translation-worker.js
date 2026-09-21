import {translateBatch} from './api.js?v=0.4.0';
import {get,patch} from './storage.js?v=0.4.0';
let controller;
self.onmessage=async({data})=>{
 if(data.type==='stop'){controller?.abort();return;}
 if(data.type!=='start'||controller)return;
 controller=new AbortController();let failure;
 try{
  const record=await get(data.id);if(!record)throw Error('记录不存在');
  const pending=record.pages.flatMap(p=>p.blocks.flatMap(b=>b.segments)).filter(s=>!s.target),batches=[];
  for(let i=0;i<pending.length;){const batch=[];let length=0;while(i<pending.length&&batch.length<20&&(!batch.length||length+pending[i].source.length<=6000)){const s=pending[i++];batch.push(s);length+=s.source.length;}batches.push(batch);}
  let next=0;
  const run=async()=>{while(!controller.signal.aborted&&next<batches.length){const batch=batches[next++];try{const out=await translateBatch(data.config,batch,controller.signal);await patch(data.id,{translations:out});self.postMessage({type:'batch',translations:out});}catch(e){if(!controller.signal.aborted)failure=e.message;controller.abort();}}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(4,Number(data.config.concurrency)||2))},run));
  self.postMessage({type:'done',error:failure,stopped:controller.signal.aborted});
 }catch(e){self.postMessage({type:'done',error:e.message});}finally{controller=null;}
};
