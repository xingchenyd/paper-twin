import {pageBlocks,PARSER_VERSION} from './text-layout.js?v=0.7.0';
export {PARSER_VERSION};
import * as pdfjs from './vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
export async function loadPDF(bytes){return pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,isEvalSupported:false}).promise;}
let fontBytes,font,canvasFont;
export async function getFont(){
 if(!font){font=(async()=>{const r=await fetch(new URL('./vendor/PaperTwinSans-v2.otf',import.meta.url),{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('中文字体加载失败，请刷新重试');fontBytes=await r.arrayBuffer();const d=await PDFLib.PDFDocument.create();d.registerFontkit(fontkit);canvasFont=new FontFace('PaperChinese',fontBytes.slice(0));await canvasFont.load();document.fonts.add(canvasFont);return d.embedFont(fontBytes,{subset:false});})();font.catch(()=>{font=null;});}return font;
}
const words=s=>(s.match(/[a-zA-Z]{2,}/g)||[]).length;
export async function extract(pdf,onProgress){
 const pages=[];let bibliography=false;
 for(let n=1;n<=pdf.numPages;n++){
  const p=await pdf.getPage(n);if(p.rotate!==0)throw Error('旋转页面暂不支持，请先将 PDF 页面旋转归正。');const vp=p.getViewport({scale:1}),tc=await p.getTextContent();
  const items=tc.items.filter(i=>i.str?.trim()).map(i=>{const t=pdfjs.Util.transform(vp.transform,i.transform),h=Math.hypot(t[2],t[3])||i.height;const style=tc.styles[i.fontName]||{},ascent=style.ascent??.9,descent=style.descent??-.25;return {text:i.str,x:t[4],y:t[5]-h*ascent,w:i.width,fontSize:h,h:h*(ascent-descent),rotated:Math.abs(t[1])>.1};}).sort((a,b)=>a.y-b.y||a.x-b.x);
  const result=pageBlocks(items,n,{bibliography});const blocks=result.blocks;bibliography=result.bibliography;
  pages.push({width:vp.width,height:vp.height,blocks});onProgress(n,pdf.numPages);await new Promise(r=>setTimeout(r,0));
 }
 if(!pages.some(p=>p.blocks.length))throw Error('未识别到可翻译英文正文。扫描件暂不支持，请使用有文本层的 PDF。');return pages;
}
const cleanTarget=text=>text.replace(/\s+/g,' ').trim();
const uniqueRects=rects=>{
 const seen=new Set();return rects.filter(r=>{const key=r.map(v=>Math.round(v*10)).join(':');if(seen.has(key))return false;seen.add(key);return r[2]-r[0]>1&&r[3]-r[1]>1;}).sort((a,b)=>Math.abs(a[1]-b[1])<1?a[0]-b[0]:a[1]-b[1]);
};
const mergeRects=rects=>{
 const out=[];for(const rect of uniqueRects(rects)){const last=out.at(-1);if(last&&Math.abs(last[1]-rect[1])<.8&&Math.abs(last[3]-rect[3])<1.2&&rect[0]-last[2]<=1.2)last[2]=Math.max(last[2],rect[2]);else out.push([...rect]);}return out;
};
function fit(text,slots,font,size,id){
 const chars=[...cleanTarget(text)],rows=[];let at=0;
 for(const slot of slots){
  if(at>=chars.length)break;let value='';
  while(at<chars.length){const next=value+chars[at];if(value&&font.widthOfTextAtSize(next,size)>slot[2]-slot[0]-.4)break;value=next;at++;}
  if(value)rows.push({id,text:value,x:slot[0],y:slot[1]+Math.max(0,(slot[3]-slot[1]-size*1.08)/2),w:font.widthOfTextAtSize(value,size),h:Math.min(slot[3]-slot[1],size*1.12)});
 }
 return at===chars.length?rows:null;
}
function fitFlow(segments,slots,font,size){
 const tokens=[];for(const segment of segments)for(const char of cleanTarget(segment.target))tokens.push({id:segment.id,char});
 const rows=[];let at=0;
 for(const slot of slots){
  if(at>=tokens.length)break;const pieces=[];let width=0;
  while(at<tokens.length){const token=tokens[at],charWidth=font.widthOfTextAtSize(token.char,size);if(width&&width+charWidth>slot[2]-slot[0]-.4)break;let piece=pieces.at(-1);if(!piece||piece.id!==token.id){piece={id:token.id,text:'',x:slot[0]+width};pieces.push(piece);}piece.text+=token.char;width+=charWidth;at++;}
  const y=slot[1]+Math.max(0,(slot[3]-slot[1]-size*1.08)/2);for(const piece of pieces){piece.y=y;piece.w=font.widthOfTextAtSize(piece.text,size);piece.h=Math.min(slot[3]-slot[1],size*1.12);rows.push(piece);}
 }
 return at===tokens.length?rows:null;
}
function supported(text,set){return [...text].every(c=>c==='\n'||c==='\r'||c==='\t'||set.has(c.codePointAt(0)));}
// Typeset inside the source line fragments. Inline formulae, table cells and
// neighbouring fragments therefore remain protected instead of being covered
// by a paragraph-wide rectangle.
export function layout(block,font){
 const charset=new Set(font.getCharacterSet()),plans=[],failed=[],missing=[];
 const complete=block.segments.length&&block.segments.every(s=>s.target&&supported(cleanTarget(s.target),charset));
 if(complete){
  const slots=mergeRects(block.segments.flatMap(s=>s.sourceRects||[])),slotHeight=slots.length?Math.min(...slots.map(r=>r[3]-r[1])):0;let rows=null,size=Math.min(block.fontSize||slotHeight,slotHeight*.82,12);
  for(;size>=4.75;size-=.25){rows=fitFlow(block.segments,slots,font,size);if(rows)break;}
  if(rows)return {segments:block.segments.map(s=>({id:s.id,size,rows:rows.filter(r=>r.id===s.id),rects:uniqueRects(s.sourceRects||[])})),failed,missing,rows};
 }
 for(const segment of block.segments){
  if(!segment.target){missing.push(segment.id);continue;}
  const text=cleanTarget(segment.target),slots=uniqueRects(segment.sourceRects||[]);
  if(!text||!slots.length||!supported(text,charset)){failed.push(segment.id);continue;}
  const slotHeight=Math.min(...slots.map(r=>r[3]-r[1]));let rows=null,size=Math.min(block.fontSize||slotHeight,slotHeight*.82,12);
  for(;size>=4.75;size-=.25){rows=fit(text,slots,font,size,segment.id);if(rows)break;}
  if(rows)plans.push({id:segment.id,size,rows,rects:slots});else failed.push(segment.id);
 }
 return {segments:plans,failed,missing,rows:plans.flatMap(p=>p.rows)};
}
export async function render(pdf,record,n,left,right,zoom=1){
 const page=await pdf.getPage(n),pm=record.pages[n-1],scale=1.5*Math.max(.5,Math.min(2.5,zoom)),vp=page.getViewport({scale});
 for(const c of [left,right]){c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);}
 await page.render({canvasContext:left.getContext('2d'),viewport:vp}).promise;
 const ctx=right.getContext('2d');ctx.drawImage(left,0,0);const f=pm.blocks.some(b=>b.segments.some(s=>s.target))?await getFont():null;const targetRects={};let overflow=0,missing=0;
 ctx.scale(scale,scale);for(const b of pm.blocks){const plan=f?layout(b,f):{segments:[],failed:[],missing:b.segments.map(s=>s.id)};overflow+=plan.failed.length;missing+=plan.missing.length;for(const s of b.segments)targetRects[s.id]=s.sourceRects;for(const segment of plan.segments){ctx.fillStyle='white';for(const r of segment.rects)ctx.fillRect(r[0]-.35,r[1]-.35,r[2]-r[0]+.7,r[3]-r[1]+.7);ctx.fillStyle='#111';ctx.font=`${segment.size}px PaperChinese`;ctx.textBaseline='top';targetRects[segment.id]=[];for(const r of segment.rows){ctx.fillText(r.text,r.x,r.y);targetRects[segment.id].push([r.x,r.y,r.x+r.w,r.y+r.h]);}}}
 return {targetRects,overflow,missing};
}
export async function exportPDF(record,onProgress){
 await getFont();const doc=await PDFLib.PDFDocument.load(record.bytes.slice(0));doc.registerFontkit(fontkit);const f=await doc.embedFont(fontBytes,{subset:false});let skipped=0,missing=0;
 for(let i=0;i<record.pages.length;i++){const p=doc.getPages()[i],pm=record.pages[i],crop=p.getCropBox();if(Math.abs(crop.width-pm.width)>1||Math.abs(crop.height-pm.height)>1)throw Error('此 PDF 使用特殊页面单位，暂不支持原位导出。');if(p.getRotation().angle!==0)throw Error('旋转页面暂不支持原位导出，请先将页面旋转归正。');for(const b of pm.blocks){const plan=layout(b,f);skipped+=plan.failed.length;missing+=plan.missing.length;for(const segment of plan.segments){for(const r of segment.rects)p.drawRectangle({x:crop.x+r[0]-.35,y:crop.y+pm.height-r[3]-.35,width:r[2]-r[0]+.7,height:r[3]-r[1]+.7,color:PDFLib.rgb(1,1,1)});for(const row of segment.rows)p.drawText(row.text,{x:crop.x+row.x,y:crop.y+pm.height-row.y-segment.size*.86,size:segment.size,font:f});}}onProgress(i+1,record.pages.length);await new Promise(r=>setTimeout(r,0));}return {bytes:await doc.save(),skipped,missing};
}
