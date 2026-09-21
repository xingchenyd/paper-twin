import assert from 'node:assert/strict';
import {pageBlocks} from './site/text-layout.js';
const items=[];
const left=['The rail transit demand is growing and trans-','port service capacity remains insufficient.','This left column describes passenger demand.'];
const right=['To solve the mismatch problem there are two methods.','Adjust capacity and control passenger demand.','This right column describes operating strategies.'];
for(let i=0;i<3;i++){items.push({text:left[i],x:38,y:100+i*13,w:253,h:14});items.push({text:right[i],x:306,y:100+i*13,w:253,h:14});}
const {blocks}=pageBlocks(items,1);
assert.equal(blocks.length,2);
const a=blocks[0].segments.map(s=>s.source).join(' '),b=blocks[1].segments.map(s=>s.source).join(' ');
assert(a.includes('transport service'));assert(!a.includes('mismatch'));assert(b.includes('mismatch'));assert(!b.includes('insufficient'));
assert(blocks.every(b=>b.w===253));
assert(blocks[0].segments.every(s=>s.sourceRects.every(r=>r[2]<=291)));
assert(blocks[1].segments.every(s=>s.sourceRects.every(r=>r[0]>=306)));
const one=pageBlocks([{text:'A regular line with',x:40,y:50,w:95,h:12},{text:'normal word spaces.',x:138,y:50,w:100,h:12}],1);
assert.equal(one.blocks.length,1);assert.equal(one.blocks[0].segments[0].source,'A regular line with normal word spaces.');
const narrow=items.map(i=>({...i,x:i.x===306?296:i.x,h:30,fontSize:10}));
const separated=pageBlocks(narrow,1).blocks;
assert.equal(separated.length,2);assert(separated.every(b=>b.w===253));
assert(separated[0].segments.map(s=>s.source).join(' ').includes('transport'));
const compound=pageBlocks([{text:'A model with demand-',x:40,y:40,w:180,h:12},{text:'driven service uses trans\u2010',x:40,y:53,w:180,h:12},{text:'port to meet passenger needs.',x:40,y:66,w:180,h:12}],1);
assert.equal(compound.blocks[0].segments.map(s=>s.source).join(' '),'A model with demand-driven service uses transport to meet passenger needs.');
const {request}=await import('./site/api.js');
const original=globalThis.fetch;
try{globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({error:{type:'account_cooling_down'}})});await assert.rejects(request({base:'http://127.0.0.1:8790/v1',key:'fake'},'/models'),/冷却/);}finally{globalThis.fetch=original;}
console.log('PASS: narrow gutter separation, overlapping line boxes, dehyphenation, normal word spaces, 503 classification.');
