import {pageBlocks,PARSER_VERSION} from './text-layout.js?v=0.4.0';
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
 const ctx=right.getContext('2d');ctx.drawImage(left,0,0);const f=pm.blocks.some(b=>b.segments.some(s=>s.target))?await getFont():null;const targetRects={};let overflow=0;
 ctx.scale(scale,scale);for(const b of pm.blocks){const plan=f?layout(b,f):null;if(!plan){if(b.segments.some(s=>s.target))overflow++;for(const s of b.segments)targetRects[s.id]=s.sourceRects;continue;}ctx.fillStyle='white';for(const s of b.segments)for(const r of s.sourceRects)ctx.fillRect(r[0]-.4,r[1]-.6,r[2]-r[0]+.8,r[3]-r[1]+1.2);ctx.fillStyle='#111';ctx.font=`${plan.size}px PaperChinese`;ctx.textBaseline='top';for(const r of plan.rows){ctx.fillText(r.text,r.x,r.y);(targetRects[r.id]||=[]).push([r.x,r.y,r.x+r.w,r.y+r.h]);}}
 return {targetRects,overflow};
}
export async function exportPDF(record,onProgress){
 await getFont();const doc=await PDFLib.PDFDocument.load(record.bytes.slice(0));doc.registerFontkit(fontkit);const f=await doc.embedFont(fontBytes,{subset:false});let skipped=0;
 for(let i=0;i<record.pages.length;i++){const p=doc.getPages()[i],pm=record.pages[i],crop=p.getCropBox();if(Math.abs(crop.width-pm.width)>1||Math.abs(crop.height-pm.height)>1)throw Error('此 PDF 使用特殊页面单位，暂不支持原位导出。');if(p.getRotation().angle!==0)throw Error('旋转页面暂不支持原位导出，请先将页面旋转归正。');for(const b of pm.blocks){const plan=layout(b,f);if(!plan){if(b.segments.some(s=>s.target))skipped++;continue;}for(const s of b.segments)for(const r of s.sourceRects)p.drawRectangle({x:crop.x+r[0]-.4,y:crop.y+pm.height-r[3]-.6,width:r[2]-r[0]+.8,height:r[3]-r[1]+1.2,color:PDFLib.rgb(1,1,1)});for(const row of plan.rows)p.drawText(row.text,{x:crop.x+row.x,y:crop.y+pm.height-row.y-plan.size*.85,size:plan.size,font:f});}onProgress(i+1,record.pages.length);await new Promise(r=>setTimeout(r,0));}return {bytes:await doc.save(),skipped};
}
