// Spatial paragraph extraction. Never join columns just because baselines match.
export const PARSER_VERSION=3;
const words=text=>(text.match(/[a-zA-Z]{2,}/g)||[]).length;
export function pageBlocks(items,pageNumber,{bibliography=false}={}){
 const rows=[];
 for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){
  let row=rows.findLast(r=>Math.abs(r.y-item.y)<Math.min(r.h,item.h)*.3);
  if(!row){row={y:item.y,h:item.h,items:[]};rows.push(row);}row.items.push(item);
 }
 // Find a persistent vertical gutter before combining items into lines. Font
 // bounding boxes are not reliable measures of column spacing (Type3 fonts in
 // particular can report much larger heights than the actual text).
 const left=Math.min(...items.map(i=>i.x)),right=Math.max(...items.map(i=>i.x+i.w));
 const candidates=[];
 for(const row of rows){row.items.sort((a,b)=>a.x-b.x);for(let i=1;i<row.items.length;i++){const a=row.items[i-1],b=row.items[i],lo=a.x+a.w,hi=b.x;if(hi-lo>=3&&lo>left+(right-left)*.25&&hi<left+(right-left)*.75)candidates.push((lo+hi)/2);}}
 let seam=null,best=0;
 for(const x of candidates){let support=0,crossed=0;for(const row of rows){if(row.items.some(i=>i.x<x-1&&i.x+i.w>x+1)){crossed++;continue;}const a=row.items.filter(i=>i.x+i.w<=x),b=row.items.filter(i=>i.x>=x);if(a.length&&b.length&&x-a[0].x>(right-left)*.22&&b.at(-1).x+b.at(-1).w-x>(right-left)*.22)support++;}if(support>=3&&support>=rows.length*.3&&crossed<support*.6&&support>best){best=support;seam=x;}}
 const runs=[];
 for(const row of rows){
  row.items.sort((a,b)=>a.x-b.x);let run;
  for(const item of row.items){
   const gap=run?item.x-run.right:Infinity;
   // Word spacing is much narrower than a gutter; the former 2em threshold
   // swallowed typical 10–16pt journal gutters and interleaved whole columns.
   const column=seam===null?0:item.x+item.w<=seam?1:item.x>=seam?2:0;
   if(!run||run.column!==column||gap>Math.max(4,Math.min(item.fontSize||item.h,run.fontSize||run.h)*.65)){
    run={...item,column,right:item.x+item.w};runs.push(run);
   }else{run.text+=(gap>item.h*.12?' ':'')+item.text;run.right=Math.max(run.right,item.x+item.w);run.w=run.right-run.x;run.h=Math.max(run.h,item.h);run.rotated ||= item.rotated;}
  }
 }
 const blocks=[];
 for(const line of runs.sort((a,b)=>a.y-b.y||a.x-b.x)){
  if(/^references\s*$/i.test(line.text.trim()))bibliography=true;
  if(bibliography||line.rotated||(line.text.match(/[=∑∫≤≥±∂]/g)||[]).length>=2)continue;
  let block=blocks.findLast(b=>{
   const dy=line.y-b.lastY;
   const indent=line.x-b.x;
   const size=line.fontSize||line.h;
   return b.column===line.column&&Math.abs(indent)<Math.max(16,size*1.6)&&indent<size*.9&&dy>size*.35&&dy<Math.max(line.h*1.55,size*1.8)&&Math.abs(b.fontSize-size)<2;
  });
  if(words(line.text)<3||line.text.trim().length<18){if(!block||!/[a-zA-Z]{2}/.test(line.text))continue;}
  if(!block){block={id:`p${pageNumber}-b${blocks.length}`,column:line.column,x:line.x,y:line.y,w:line.w,bottom:line.y+line.h,fontSize:line.fontSize||line.h,lines:[],lastY:line.y};blocks.push(block);}
  const right=Math.max(block.x+block.w,line.x+line.w);block.x=Math.min(block.x,line.x);block.w=right-block.x;block.lines.push(line);block.lastY=line.y;block.bottom=Math.max(block.bottom,line.y+line.h);
 }
 for(const b of blocks){
  let text='';const spans=[];
  for(let i=0;i<b.lines.length;i++){
   const line=b.lines[i];let value=line.text.trim();
   const joins=/[a-zA-Z][\-\u00ad\u2010]$/.test(value)&&/^[a-z]/.test(b.lines[i+1]?.text.trim()||'');
   // Keep common compound boundaries; remove discretionary word breaks such
   // as trans-port and effec-tively only at an actual line boundary.
   if(joins&&!/\b(?:demand|time|off|peak|multi|single|double|short|long|large|small|real|data|two|three|cost|capacity|passenger)-$/i.test(value))value=value.slice(0,-1);
   spans.push({...line,start:text.length,end:text.length+value.length});text+=value;
   if(!joins&&i<b.lines.length-1)text+=' ';
  }
  b.segments=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)].map((s,i)=>({id:`${b.id}-s${i}`,source:s.segment.trim(),target:'',sourceRects:spans.filter(l=>l.end>s.index&&l.start<s.index+s.segment.length).map(l=>{const length=l.end-l.start,from=Math.max(0,s.index-l.start),to=Math.min(length,s.index+s.segment.length-l.start);return [l.x+l.w*from/length,l.y,l.x+l.w*to/length,l.y+l.h];})}));
  b.h=b.bottom-b.y;delete b.lines;delete b.lastY;
 }
 return {blocks,bibliography};
}
