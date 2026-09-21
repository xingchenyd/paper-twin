import * as pdfjs from './vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
export async function loadPDF(bytes){return pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,isEvalSupported:false}).promise;}
let fontBytes,font,canvasFont;
export async function getFont(){
 if(!font){font=(async()=>{const r=await fetch(new URL('./vendor/PaperTwinSans.otf',import.meta.url));if(!r.ok)throw Error('中文字体加载失败，请刷新重试');fontBytes=await r.arrayBuffer();const d=await PDFLib.PDFDocument.create();d.registerFontkit(fontkit);canvasFont=new FontFace('PaperChinese',fontBytes.slice(0));await canvasFont.load();document.fonts.add(canvasFont);return d.embedFont(fontBytes,{subset:false});})();font.catch(()=>{font=null;});}return font;
}
const words=s=>(s.match(/[a-zA-Z]{2,}/g)||[]).length;
export async function extract(pdf,onProgress){
 const pages=[];let bibliography=false;
 for(let n=1;n<=pdf.numPages;n++){
  const p=await pdf.getPage(n);if(p.rotate!==0)throw Error('旋转页面暂不支持，请先将 PDF 页面旋转归正。');const vp=p.getViewport({scale:1}),tc=await p.getTextContent();
  const items=tc.items.filter(i=>i.str?.trim()).map(i=>{const t=pdfjs.Util.transform(vp.transform,i.transform),h=Math.hypot(t[2],t[3])||i.height;const style=tc.styles[i.fontName]||{},ascent=style.ascent??.9,descent=style.descent??-.25;return {text:i.str,x:t[4],y:t[5]-h*ascent,w:i.width,h:h*(ascent-descent),rotated:Math.abs(t[1])>.1};}).sort((a,b)=>a.y-b.y||a.x-b.x);
  const lines=[];
  for(const item of items){let row=lines.findLast(l=>Math.abs(l.y-item.y)<Math.min(l.h,item.h)*.35);if(!row){row={y:item.y,h:item.h,items:[]};lines.push(row);}row.items.push(item);}
  const runs=[];
  for(const line of lines){line.items.sort((a,b)=>a.x-b.x);let run;for(const i of line.items){if(!run||i.x-(run.x+run.w)>Math.max(i.h*2,16)){run={x:i.x,y:i.y,w:i.w,h:i.h,text:i.text,rotated:i.rotated};runs.push(run);}else{const gap=i.x-run.x-run.w;run.text+=(gap>i.h*.12?' ':'')+i.text;run.w=i.x+i.w-run.x;run.h=Math.max(run.h,i.h);run.rotated ||= i.rotated;}}}
  runs.sort((a,b)=>a.y-b.y||a.x-b.x);const blocks=[];
  for(const l of runs){
   if(/^references\s*$/i.test(l.text.trim()))bibliography=true;
   const eligible=!bibliography&&!l.rotated&&words(l.text)>=3&&l.text.length>18&&(l.text.match(/[=∑∫≤≥±∂]/g)||[]).length<2;
   if(!eligible)continue;
   let b=blocks.findLast(b=>Math.abs(b.x-l.x)<Math.max(15,l.h*1.5)&&l.y-b.bottom>0&&l.y-b.bottom<l.h*.9&&Math.abs(b.fontSize-l.h)<2&&Math.abs(b.w-l.w)<Math.max(b.w*.55,40));
   if(!b){b={id:`p${n}-b${blocks.length}`,x:l.x,y:l.y,w:l.w,bottom:l.y+l.h,fontSize:l.h,lines:[]};blocks.push(b);}b.lines.push(l);b.w=Math.max(b.w,l.x+l.w-b.x);b.bottom=l.y+l.h;
  }
  for(const b of blocks){let text='';const spans=[];for(const l of b.lines){if(text)text+=' ';spans.push({...l,start:text.length,end:text.length+l.text.length});text+=l.text;}const sentences=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)];b.segments=sentences.map((s,i)=>({id:`${b.id}-s${i}`,source:s.segment.trim(),target:'',sourceRects:spans.filter(l=>l.end>s.index&&l.start<s.index+s.segment.length).map(l=>{const from=Math.max(0,s.index-l.start),to=Math.min(l.text.length,s.index+s.segment.length-l.start);return [l.x+l.w*from/l.text.length,l.y,l.x+l.w*to/l.text.length,l.y+l.h];})}));b.h=b.bottom-b.y;delete b.lines;}
  pages.push({width:vp.width,height:vp.height,blocks});onProgress(n,pdf.numPages);await new Promise(r=>setTimeout(r,0));
 }
 if(!pages.some(p=>p.blocks.length))throw Error('未识别到可翻译英文正文。扫描件暂不支持，请使用有文本层的 PDF。');return pages;
}
export function layout(block,font){
 if(!block.segments.every(s=>s.target))return null;const supported=new Set(font.getCharacterSet());if(block.segments.some(s=>[...s.target].some(c=>c!=='\n'&&!supported.has(c.codePointAt(0)))))return null;
 const available=block.w;const split=size=>{const rows=[];for(const s of block.segments){let line='';for(const char of s.target){if(char==='\n'||(line&&font.widthOfTextAtSize(line+char,size)>available)){rows.push({id:s.id,text:line});line=char==='\n'?'':char;}else line+=char;}if(line)rows.push({id:s.id,text:line});}return rows;};
 let size=Math.min(block.fontSize,12),rows;for(;size>=5.5;size-=.25){rows=split(size);if(rows.length*size*1.15<=block.h+1)break;}if(size<5.5)return null;
 return {size,rows:rows.map((r,i)=>({...r,x:block.x,y:block.y+i*size*1.15,w:font.widthOfTextAtSize(r.text,size),h:size*1.15}))};
}
export async function render(pdf,record,n,left,right){
 const page=await pdf.getPage(n),pm=record.pages[n-1],scale=1.5,vp=page.getViewport({scale});
 for(const c of [left,right]){c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);}
 await page.render({canvasContext:left.getContext('2d'),viewport:vp}).promise;
 const ctx=right.getContext('2d');ctx.drawImage(left,0,0);const f=await getFont();const targetRects={};let overflow=0;
 ctx.scale(scale,scale);for(const b of pm.blocks){const plan=layout(b,f);if(!plan){if(b.segments.some(s=>s.target))overflow++;for(const s of b.segments)targetRects[s.id]=s.sourceRects;continue;}ctx.fillStyle='white';for(const s of b.segments)for(const r of s.sourceRects)ctx.fillRect(r[0]-.4,r[1]-.6,r[2]-r[0]+.8,r[3]-r[1]+1.2);ctx.fillStyle='#111';ctx.font=`${plan.size}px PaperChinese`;ctx.textBaseline='top';for(const r of plan.rows){ctx.fillText(r.text,r.x,r.y);(targetRects[r.id]||=[]).push([r.x,r.y,r.x+r.w,r.y+r.h]);}}
 return {targetRects,overflow};
}
export async function exportPDF(record,onProgress){
 await getFont();const doc=await PDFLib.PDFDocument.load(record.bytes.slice(0));doc.registerFontkit(fontkit);const f=await doc.embedFont(fontBytes,{subset:false});let skipped=0;
 for(let i=0;i<record.pages.length;i++){const p=doc.getPages()[i],pm=record.pages[i],crop=p.getCropBox();if(Math.abs(crop.width-pm.width)>1||Math.abs(crop.height-pm.height)>1)throw Error('此 PDF 使用特殊页面单位，暂不支持原位导出。');if(p.getRotation().angle!==0)throw Error('旋转页面暂不支持原位导出，请先将页面旋转归正。');for(const b of pm.blocks){const plan=layout(b,f);if(!plan){if(b.segments.some(s=>s.target))skipped++;continue;}for(const s of b.segments)for(const r of s.sourceRects)p.drawRectangle({x:crop.x+r[0]-.4,y:crop.y+pm.height-r[3]-.6,width:r[2]-r[0]+.8,height:r[3]-r[1]+1.2,color:PDFLib.rgb(1,1,1)});for(const row of plan.rows)p.drawText(row.text,{x:crop.x+row.x,y:crop.y+pm.height-row.y-plan.size*.85,size:plan.size,font:f});}onProgress(i+1,record.pages.length);await new Promise(r=>setTimeout(r,0));}return {bytes:await doc.save(),skipped};
}
