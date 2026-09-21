'use strict';
const $=id=>document.getElementById(id);
let current=null,pageNumber=1,zoom=1,pinned=null,active=null,loadVersion=0,polling=false,renderedSignature='',syncing=false;
const segments=new Map();
async function api(url,options){const r=await fetch(url,options);const j=await r.json();if(!r.ok)throw Error(j.error||'请求失败');return j;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function notice(text,error=false){$('notice').hidden=!text;$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function route(action){return `/documents/${current.id}/${action}`;}
function signature(){return `${current.id}:${pageNumber}:`+JSON.stringify(current.pages[pageNumber-1].blocks.map(b=>b.segments.map(s=>[s.target,s.targetRects,s.translationNote,s.alignment])));}
function updateMeta(){
 $('title').textContent=current.name.replace(/\.pdf$/i,'');$('title').title=current.name;
 $('pageCount').textContent=`${current.pageCount} 页`;$('total').textContent=`/ ${current.pageCount}`;$('page').max=current.pageCount;$('page').value=pageNumber;
 $('progressText').textContent=`已排版 ${current.translatedSegments} / ${current.totalSegments} 个片段`;
 const complete=current.status==='ready';$('statusBadge').textContent=current.processing?'正在排版':complete?'译稿已生成':current.translatedSegments?'逐页翻译中':'等待 WorkBuddy';$('statusBadge').classList.toggle('ready',complete);
 $('bridgeDot').classList.toggle('active',current.receivedSegments>0);
 $('download').disabled=!current.translatedSegments;$('download').textContent=complete?'↓ 下载中文 PDF':'↓ 下载当前译稿';
 $('prev').disabled=pageNumber===1;$('next').disabled=pageNumber===current.pageCount;
 if(current.apiRunning)notice('API 正在翻译，已完成部分会自动排版。');
 else if(current.apiError)notice(current.apiError,true);
 else if(current.error)notice(`排版失败：${current.error}`,true);
 else if(current.translatedSegments && !complete)notice(`当前是部分译稿，未完成的区域保留英文。WorkBuddy 已交付 ${current.receivedSegments} 个片段，完成后自动更新。`);
 else if(complete&&current.warnings.length)notice(`译文已生成。有 ${current.warnings.length} 项排版或对齐提示；对应句子可点击查看完整文本。`);
 else if(complete)notice('正文译稿已生成。复杂公式、表格或算法块保留原排版，点击可查看译文；图内英文与参考文献保留原文。');
 else notice('');
}
function setActive(id,showCard=false,fromSide=null){
 if(!$('highlight').checked)return;
 active=id;document.querySelectorAll('.hit.active').forEach(x=>x.classList.remove('active'));
 if(!id){$('hoverHint').textContent='将鼠标移到一句话上，两侧会同步高亮。点击可固定，Esc 取消。';if(!pinned)$('sentenceCard').hidden=true;return;}
 document.querySelectorAll(`.hit[data-id="${id}"]`).forEach(x=>x.classList.add('active'));
 const s=segments.get(id);if(!s)return;
 if(fromSide&&s.target){const side=fromSide==='left'?'right':'left';const box=$(side+'Overlay').querySelector(`[data-id="${id}"]`);if(box){const pane=$(side+'Scroll'),r=box.getBoundingClientRect(),pr=pane.getBoundingClientRect();if(r.top<pr.top+12||r.bottom>pr.bottom-12){syncing=true;pane.scrollTop+=r.top-pr.top-pr.height*.35;requestAnimationFrame(()=>syncing=false);}}}
 $('hoverHint').textContent=s.target?(s.alignment==='sentence'?'两侧句子已对应 · 点击固定并查看全文':s.alignment==='preserved'?'公式、表格或算法保留原排版 · 点击查看译文':'本句使用段落级对应 · 点击查看准确译文'):'本句尚未翻译';
 if(showCard){$('sourceText').textContent=s.source;$('targetText').textContent=s.translationNote||s.target||'等待 WorkBuddy 翻译';$('alignmentLabel').textContent=s.alignment==='sentence'?'句子级坐标匹配':s.alignment==='preserved'?'原位保留公式、表格或算法；此处显示对应解释':s.target?'段落级位置匹配':'尚未建立对应';$('sentenceCard').hidden=false;}
}
function clearPinned(){pinned=null;setActive(null);$('sentenceCard').hidden=true;}
function overlay(side,pm){
 const container=$(side+'Overlay');container.replaceChildren();
 for(const block of pm.blocks)for(const s of block.segments){
  segments.set(s.id,s);const rects=side==='left'?s.sourceRects:s.targetRects||[];
  for(const [i,r] of rects.entries()){
   const node=document.createElement('button');node.className='hit'+(!s.target?' pending':'');node.dataset.id=s.id;node.tabIndex=i===0?0:-1;node.setAttribute('aria-label',(side==='left'?s.source:s.target)||s.source);
   Object.assign(node.style,{left:`${r[0]/pm.width*100}%`,top:`${r[1]/pm.height*100}%`,width:`${(r[2]-r[0])/pm.width*100}%`,height:`${(r[3]-r[1])/pm.height*100}%`});
   node.onmouseenter=()=>{if(!pinned)setActive(s.id,false,side);};node.onmouseleave=()=>{if(!pinned)setActive(null);};node.onfocus=()=>setActive(s.id,false,side);node.onclick=()=>{if(pinned===s.id)clearPinned();else{pinned=s.id;setActive(s.id,true,side);}};container.append(node);
  }
 }
}
async function renderPage(){
 if(!current)return;const version=++loadVersion;clearPinned();segments.clear();updateMeta();
 const pm=current.pages[pageNumber-1];const done=pm.blocks.flatMap(b=>b.segments).filter(s=>s.target);const all=pm.blocks.flatMap(b=>b.segments);
 for(const side of ['left','right']){$(side+'Page').style.aspectRatio=`${pm.width}/${pm.height}`;$(side+'Page').style.width=`${zoom*100}%`;}
 $('waiting').hidden=done.length>0||(!all.length&&current.translatedSegments>0);
 $('rightLabel').textContent=done.length?`${done.length} / ${all.length} 已译`:'等待译文';
 $('alignmentCount').textContent=`本页 ${done.filter(s=>s.alignment==='sentence').length} 句精确对应`;
 const rev=current.translatedSegments;
 const setImage=(id,src)=>new Promise(resolve=>{const el=$(id);el.onload=()=>resolve();el.onerror=()=>{if(version===loadVersion)toast('页面加载失败，请重试');resolve();};el.src=src;});
 const jobs=[setImage('leftImage',route(`page?page=${pageNumber}&side=original`))];
 if(current.translatedSegments)jobs.push(setImage('rightImage',route(`page?page=${pageNumber}&side=translated&v=${rev}`)));else{$('rightImage').removeAttribute('src');}
 await Promise.all(jobs);if(version!==loadVersion)return;
 overlay('left',pm);overlay('right',pm);renderedSignature=signature();
}
let libraryDocs=[],view='home',opening=0;
function readProgress(id){try{return JSON.parse(localStorage.getItem('paper-twin-reading:'+id))||{};}catch{return {};}}
function saveProgress(){if(!current)return;try{localStorage.setItem('paper-twin-reading:'+current.id,JSON.stringify({page:pageNumber,opened:Date.now()}));}catch{}}
function showView(name){view=name;for(const n of ['home','history','reader'])$(n+'View').hidden=n!==name;$('homeNav').classList.toggle('selected',name==='home');$('historyNav').classList.toggle('selected',name==='history');$('bridgeButton').hidden=name!=='reader';clearPinned();if(name!=='reader')renderHistory();}
function renderHistory(){
 const docs=[...libraryDocs].sort((a,b)=>(readProgress(b.id).opened||0)-(readProgress(a.id).opened||0));
 $('historyCount').textContent=`共 ${docs.length} 篇论文 · 保存在本机`;
 for(const [container,items] of [[$('recentList'),docs.slice(0,3)],[$('historyList'),docs.filter(d=>d.name.toLowerCase().includes($('historySearch').value.trim().toLowerCase()))]]){
 container.replaceChildren();if(!items.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=docs.length?'没有找到匹配的论文。':'还没有论文。点击“上传论文”，开始建立你的本地文库。';container.append(empty);}
 for(const d of items){const card=document.createElement('article');card.className='history-card';const badge=document.createElement('span');badge.className='badge';badge.textContent=d.status==='ready'?'译稿已生成':d.translatedSegments?'翻译中':'等待翻译';const title=document.createElement('h3');title.textContent=d.name.replace(/\.pdf$/i,'');const meta=document.createElement('p');const progress=readProgress(d.id);meta.textContent=`${d.pageCount} 页 · ${progress.page?'上次读到第 '+progress.page+' 页':'尚未阅读'}`;const button=document.createElement('button');button.className='button';button.textContent=progress.page?'继续阅读 →':'打开论文 →';button.onclick=()=>openDocument(d.id).catch(e=>toast(e.message));card.append(badge,title,meta,button);container.append(card);}
 }
}
async function openDocument(id){const token=++opening;const doc=await api(`/documents/${id}/manifest`);if(token!==opening)return;current=doc;pageNumber=Math.max(1,Math.min(current.pageCount,readProgress(id).page||1));zoom=1;renderedSignature='';$('library').value=id;$('zoomReset').textContent='适合宽度';showView('reader');saveProgress();await renderPage();}
async function refreshLibrary(selectId){libraryDocs=await api('/api/library');const sel=$('library');sel.replaceChildren();for(const d of libraryDocs){const opt=document.createElement('option');opt.value=d.id;opt.textContent=d.name;sel.append(opt);}renderHistory();if(selectId)await openDocument(selectId);}
async function showBridge(){if(!current)return toast('请先上传论文');const b=await api(route('bridge'));$('bridgePrompt').value=b.prompt;$('bridgeDialog').showModal();}
function goPage(n){if(!current)return;const next=Math.max(1,Math.min(current.pageCount,Number(n)||1));if(next===pageNumber)return;pageNumber=next;saveProgress();$('leftScroll').scrollTo(0,0);$('rightScroll').scrollTo(0,0);renderPage().catch(e=>toast(e.message));}
function setZoom(value){zoom=Math.min(2.5,Math.max(.65,value));for(const side of ['left','right'])$(side+'Page').style.width=`${zoom*100}%`;$('zoomReset').textContent=zoom===1?'适合宽度':`${Math.round(zoom*100)}%`;}
let uploading=false;
async function uploadPaper(file){if(!file||uploading)return;if(!/\.pdf$/i.test(file.name)){toast('请选择 PDF 文件');return;}if(file.size>60*1024*1024){toast('PDF 文件不能超过 60 MB');return;}uploading=true;for(const id of ['uploadButton','homeUpload','historyUpload'])$(id).disabled=true;$('uploadStatus').textContent='正在上传并提取论文，请稍候…';toast('正在读取论文与句子位置…');try{const d=await api(`/api/upload?name=${encodeURIComponent(file.name)}`,{method:'POST',body:file,headers:{'Content-Type':'application/pdf'}});await refreshLibrary(d.id);await showBridge();}catch(e){toast(e.message);$('uploadStatus').textContent='上传失败：'+e.message;}finally{uploading=false;for(const id of ['uploadButton','homeUpload','historyUpload'])$(id).disabled=false;$('upload').value='';if(view==='reader')$('uploadStatus').textContent='上传后，按提示在 WorkBuddy 中启动翻译任务。';}}
for(const id of ['uploadButton','homeUpload','historyUpload'])$(id).onclick=()=>$('upload').click();
$('upload').onchange=e=>uploadPaper(e.target.files[0]);
$('dropzone').ondragover=e=>{e.preventDefault();$('dropzone').classList.add('dragging');};$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragging');$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragging');uploadPaper(e.dataTransfer.files[0]);};
$('homeNav').onclick=()=>showView('home');for(const id of ['historyNav','allHistory','backHistory'])$(id).onclick=()=>{showView('history');refreshLibrary().catch(e=>toast(e.message));};$('historySearch').oninput=renderHistory;
document.querySelector('.brand').onclick=e=>{e.preventDefault();showView('home');};
$('library').onchange=e=>openDocument(e.target.value).catch(e=>toast(e.message));
$('prev').onclick=()=>goPage(pageNumber-1);$('next').onclick=()=>goPage(pageNumber+1);$('page').onchange=e=>goPage(e.target.value);
$('zoomIn').onclick=()=>setZoom(zoom+.15);$('zoomOut').onclick=()=>setZoom(zoom-.15);$('zoomReset').onclick=()=>setZoom(1);
$('highlight').onchange=()=>{if(!$('highlight').checked){pinned=null;document.querySelectorAll('.hit.active').forEach(x=>x.classList.remove('active'));$('sentenceCard').hidden=true;}};
for(const [from,to] of [['leftScroll','rightScroll'],['rightScroll','leftScroll']])$(from).onscroll=()=>{if(!$('sync').checked||syncing)return;syncing=true;const a=$(from),b=$(to);b.scrollTop=a.scrollTop;b.scrollLeft=a.scrollLeft;requestAnimationFrame(()=>{syncing=false;});};
$('download').onclick=()=>{if(!current)return;const a=document.createElement('a');a.href=route('translated.pdf');a.download='中文译稿.pdf';a.click();};
$('originalDownload').onclick=()=>{if(current)window.open(route('original.pdf'),'_blank','noopener');};
$('bridgeButton').onclick=()=>showBridge().catch(e=>toast(e.message));$('waitingBridge').onclick=$('bridgeButton').onclick;$('closeBridge').onclick=()=>$('bridgeDialog').close();$('closeCard').onclick=clearPinned;
$('copyPrompt').onclick=async()=>{try{await navigator.clipboard.writeText($('bridgePrompt').value);toast('已复制。在 WorkBuddy 新建任务并粘贴即可。');}catch{ $('bridgePrompt').select();toast('请按 Ctrl+C 复制任务指令');}};
$('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const r=await api(route('import'),{method:'POST',body:await f.text(),headers:{'Content-Type':'application/json'}});toast(`已收到 ${r.received} 个译文片段，正在排版`);$('bridgeDialog').close();}catch(e){toast(e.message);}finally{e.target.value='';}};
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearPinned();if(view!=='reader')return;if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||$('bridgeDialog').open)return;if(e.key==='ArrowRight')goPage(pageNumber+1);if(e.key==='ArrowLeft')goPage(pageNumber-1);});
setInterval(async()=>{if(!current||view!=='reader'||polling||document.hidden)return;polling=true;try{const id=current.id;const next=await api(route('status'));if(current.id!==id)return;current=next;updateMeta();if(signature()!==renderedSignature)await renderPage();}catch(e){notice('本地服务连接中断，请重新运行“启动对页.cmd”。',true);}finally{polling=false;}},5000);
showView('home');refreshLibrary().catch(e=>{toast('无法连接本地服务：'+e.message);$('uploadStatus').textContent='无法连接本地服务，请运行“启动对页.cmd”后刷新页面。';});

$('apiTranslate').onclick=async()=>{try{await api(route('translate-api'),{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});$('bridgeDialog').close();toast('API 翻译已启动');}catch(e){toast(e.message);}};
