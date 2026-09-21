"""Local PDF translation layout engine. No external model calls here."""
import json, re, hashlib, shutil, time, unicodedata
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
def normalized_literal(value):
    return re.sub(r'\s+','',value.translate(str.maketrans('（）。，；：','().,;:')))

HEADINGS={'Introduction':'引言','Motivation':'研究动机','Literature review':'文献综述','Summary':'小结','Problem statement':'问题描述','Notations':'符号说明','Scenario description':'场景描述','Decision variables':'决策变量','Assumptions':'基本假设','Objective function':'目标函数','Constraints':'约束条件','Complexity analysis':'复杂性分析','Algorithm preparation':'算法准备','Algorithm architecture':'算法架构','Case description':'算例描述','Result analysis':'结果分析','Results analysis':'结果分析','Conclusions':'结论','Data availability':'数据可用性','Acknowledgements':'致谢','References':'参考文献','ARTICLEINFO':'文章信息','ABSTRACT':'摘要','DDFPT model':'DDFPT 模型','ALNS algorithm':'ALNS 算法','Input:':'输入：','Parameters Explanation':'参数说明','be adjusted.':'进行调整。','them.':'它们。','proposed method.':'所提出的方法。'}
COLUMN_LABELS={'Scenario':'场景','Type':'类型','Value':'数值','Unit':'单位','Parameter':'参数','Parameters':'参数','Explanation':'说明','Description':'描述','Method':'方法','Network':'网络','Line':'线路','Case':'算例','Time':'时间','Cost':'成本','Model':'模型','Algorithm':'算法','Number':'数量','Results':'结果','Objective':'目标','Constraints':'约束','Variables':'变量','Indicator':'指标','Indicators':'指标'}

def save_json(path, obj):
    tmp = Path(str(path)+'.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    replace_file(tmp,path)

def replace_file(tmp,path):
    for attempt in range(30):
        try:tmp.replace(path);break
        except PermissionError:
            if attempt==29:raise
            time.sleep(.08)

def sentence_ranges(text):
    # Abbreviations and citations stay with their sentence.
    starts=[0]
    for m in re.finditer(r'[.!?]\s+(?=[A-Z(])',text):
        prefix=text[:m.start()+1]
        if re.search(r'(?:Fig|Figs|Eq|Eqs|Dr|Mr|Ms|al|e\.g|i\.e|vs)\.$',prefix): continue
        starts.append(m.end())
    return [(s,starts[i+1] if i+1<len(starts) else len(text)) for i,s in enumerate(starts)]

def line_rects(chars):
    boxes=[]
    for c in chars:
        if c['c'].isspace():continue
        r=fitz.Rect(c['bbox'])
        if boxes and abs(boxes[-1][1]-r.y0)<2.2 and r.x0>=boxes[-1][0]-2:
            boxes[-1]=list(fitz.Rect(boxes[-1]) | r)
        else: boxes.append(list(r))
    return boxes

def extract(path, name=None):
    raw=Path(path).read_bytes(); did=hashlib.sha256(raw).hexdigest()[:16]
    folder=DATA/did;folder.mkdir(exist_ok=True)
    if (folder/'document.json').exists():return json.loads((folder/'document.json').read_text('utf8'))
    shutil.copyfile(path,folder/'original.pdf')
    doc=fitz.open(path); pages=[]; all_segments=[];in_references=False
    for pi,page in enumerate(doc):
        blocks=[]
        for bi,b in enumerate(page.get_text('rawdict')['blocks']):
            if b['type']!=0:continue
            chars=[];sizes=[]
            for line in b['lines']:
                if chars:chars.append({'c':' ','bbox':chars[-1]['bbox']})
                for span in line['spans']:
                    sizes.append(span['size'])
                    chars.extend(span['chars'])
            # Join end-of-line discretionary hyphens, preserving exact char positions.
            normalized=[]
            for c in chars:
                if c['c']=='\xad':continue
                normalized.append(c)
            chars=normalized;text=''.join(c['c'] for c in chars).strip()
            if not text:continue
            if re.fullmatch(r'References|Bibliography',text.strip(),re.I):in_references=True
            letters=len(re.findall('[A-Za-z]',text));words=re.findall(r'[A-Za-z]{2,}',text)
            # Preserve equations, numeric tables, running headers, references, credits.
            eligible=(len(words)>=3 and letters/max(len(text),1)>.45 and b['bbox'][1]>35 and b['bbox'][3]<page.rect.height-30)
            if re.search(r'@|https?://|www\.|All rights reserved|Received \d|Available online|Contents lists|journal homepage',text):eligible=False
            if in_references:eligible=False
            if not eligible:continue
            segments=[]
            full=''.join(c['c'] for c in chars)
            for si,(start,end) in enumerate(sentence_ranges(full)):
                source=full[start:end].strip()
                if not source:continue
                sid=f'p{pi+1}-b{bi}-s{si}'
                seg={'id':sid,'page':pi+1,'source':source,'sourceRects':line_rects(chars[start:end])}
                segments.append(seg);all_segments.append({'id':sid,'page':pi+1,'source':source})
            blocks.append({'id':f'p{pi+1}-b{bi}','rect':list(b['bbox']),'fontSize':max(sizes) if sizes else 10,'segments':segments})
        pages.append({'number':pi+1,'width':page.rect.width,'height':page.rect.height,'blocks':blocks})
    result={'id':did,'name':name or Path(path).name,'pageCount':len(doc),'pages':pages,'totalSegments':len(all_segments),'translatedSegments':0,'status':'waiting','engine':'WorkBuddy 文件桥接','warnings':[]}
    save_json(folder/'document.json',result)
    save_json(folder/'source-segments.json',all_segments)
    batches=folder/'requests';batches.mkdir(exist_ok=True)
    for pi in range(len(doc)):
        ss=[s for s in all_segments if s['page']==pi+1]
        if ss:save_json(batches/f'page-{pi+1:02}.json',ss)
    (folder/'translations').mkdir(exist_ok=True)
    return result

def translations(folder):
    merged={}
    errors=[]
    source={s['id']:s['source'] for s in json.loads((folder/'source-segments.json').read_text('utf8'))}
    for f in sorted((folder/'translations').glob('*.json*')):
        try:
            if f.name.endswith('.tmp'):
                # Some agents batch the final rename. Accept only a stable, complete page snapshot.
                if time.time()-f.stat().st_mtime<12:continue
                request=folder/'requests'/f.name[:-4]
                if not request.exists():continue
            elif f.suffix!='.json':continue
            data=json.loads(f.read_text('utf-8-sig'))
            if isinstance(data,list):data={v['id']:v.get('target',v.get('translation','')) for v in data}
            if f.name.endswith('.tmp') and set(data)!={s['id'] for s in json.loads(request.read_text('utf8'))}:continue
            for k,v in data.items():
                if k not in source:continue
                if isinstance(v,str) and v.strip():
                    # Author names may intentionally remain in Latin script.
                    names_only=(normalized_literal(v)==normalized_literal(source[k]) and ((bool(re.fullmatch(r'[A-Za-z ,.*\-]+',source[k])) and ',' in source[k] and not source[k].rstrip().endswith('.')) or bool(re.fullmatch(r'(?:[A-Z][a-z]+\s*){2,4}:',source[k]))))
                    literal_only=(bool(re.fullmatch(r'[\da-z.\s]+',source[k])) or bool(re.fullmatch(r'\([^()]+\)\.?',source[k].strip())) or any(c in source[k] for c in '=∈∑⩽⩾←')) and normalized_literal(v)==normalized_literal(source[k])
                    if re.search('[\u4e00-\u9fff]',v) or names_only or literal_only:merged[k]=v
                    else:errors.append(f'{k} 尚无有效中文译文')
        except Exception as e:errors.append(f'{f.name}: {e}')
    return merged,[e for e in errors if e.split()[0] not in merged]

def build(did):
    import html
    folder=DATA/did; meta=json.loads((folder/'document.json').read_text('utf8')); targets,errors=translations(folder)
    doc=fitz.open(folder/'original.pdf'); done=0;warnings=[]
    for pm,page in zip(meta['pages'],doc):
        page_words=page.get_text('words')
        # Locate ruled tables from their captions and wide horizontal boundaries.
        rules=[]
        for drawing in page.get_drawings():
            for item in drawing['items']:
                if item[0]=='l' and abs(item[1].y-item[2].y)<.6 and abs(item[1].x-item[2].x)>page.rect.width*.3:
                    x0,x1=sorted([item[1].x,item[2].x]);rules.append((x0,item[1].y,x1))
        tables=[]
        for block in page.get_text('blocks'):
            if block[6]!=0 or not re.match(r'^Table\s+\d',block[4].strip()):continue
            below=[r for r in rules if block[3]-2<r[1]<block[3]+60 and r[0]<=block[0]+5]
            if not below:continue
            top=min(below,key=lambda r:r[1])
            bottoms=[r for r in rules if top[1]+25<r[1]<min(page.rect.height-35,top[1]+400) and abs(r[0]-top[0])<3 and abs(r[2]-top[2])<3]
            if bottoms:tables.append(fitz.Rect(top[0],top[1],top[2],max(r[1] for r in bottoms)))
        # Short section headings and conventional labels use a local glossary.
        existing={b['id'] for b in pm['blocks']}
        for bi,rawblock in enumerate(page.get_text('rawdict')['blocks']):
            bid=f'p{pm["number"]}-b{bi}'
            if rawblock['type']!=0:continue
            chars=[c for ln in rawblock['lines'] for sp in ln['spans'] for c in sp['chars']]
            source=''.join(c['c'] for c in chars).strip();compact=re.sub(r'\s+',' ',source)
            match=re.match(r'^([\d.]+\s+)?(.+)$',compact)
            prefix=match[1] or '' if match else '';term=match[2] if match else compact
            target=HEADINGS.get(term) or HEADINGS.get(term.replace(' ',''))
            if not target:continue
            sid=bid+'-label';targets[sid]=prefix+target
            if bid in existing:continue
            fs=max(sp['size'] for ln in rawblock['lines'] for sp in ln['spans'])
            pm['blocks'].append({'id':bid,'rect':list(rawblock['bbox']),'fontSize':fs,'segments':[{'id':sid,'page':pm['number'],'source':source,'sourceRects':line_rects(chars)}]})
        translated=[]
        for b in pm['blocks']:
            for s in b['segments']:s.pop('target',None);s.pop('targetRects',None)
            full=' '.join(s['source'] for s in b['segments'])
            # Displayed mathematics stays in its original PDF operators/fonts.
            math_block=any(c in full for c in '=∈∑⩽⩾←') and (len(re.findall(r'\b[a-z]{4,}\b',full))<4 or bool(re.match(r'^(?:if|iter|tdi|pwt|tpd|wk)\b',full)))
            if math_block:
                for s in b['segments']:
                    if s['id'] in targets:s['translationNote']=targets[s['id']]
                    targets[s['id']]=s['source'];s['preserved']='formula'
            if not all(s['id'] in targets for s in b['segments']):continue
            br=fitz.Rect(b['rect']);row_words=sorted([w for w in page_words if br.contains(fitz.Point((w[0]+w[2])/2,(w[1]+w[3])/2))],key=lambda w:w[0])
            gaps=sum(row_words[i][0]-row_words[i-1][2]>9 for i in range(1,len(row_words)))
            edits=[(list(w[:4]),COLUMN_LABELS[w[4]]) for w in row_words if w[4] in COLUMN_LABELS]
            b.pop('columnEdits',None)
            if br.height<b['fontSize']*1.8 and gaps>=3 and len(edits)>=2:
                # Keep each table heading in its original column, preserving numeric/variable headings.
                b['columnEdits']=edits;translated.append(b)
                for r,_ in edits:page.add_redact_annot(fitz.Rect(r),fill=False)
                continue
            if any(t.contains(br.tl+(br.br-br.tl)*.5) for t in tables):
                # Multi-cell table extraction may merge rows. Preserve their exact layout;
                # provide the complete translation in the linked reader card.
                for s in b['segments']:
                    s['translationNote']=targets[s['id']];targets[s['id']]=s['source'];s['preserved']='table'
            if all(not re.search('[\u4e00-\u9fff]',targets[s['id']]) and normalized_literal(targets[s['id']])==normalized_literal(s['source']) for s in b['segments']):
                for s in b['segments']:
                    s['target']=targets[s['id']];s['targetRects']=s['sourceRects'];s['alignment']='preserved' if s.get('preserved') else 'sentence';done+=1
                continue
            translated.append(b)
            for s in b['segments']:
                for r in s['sourceRects']:page.add_redact_annot(fitz.Rect(r),fill=False)
        if translated:page.apply_redactions(images=0,graphics=0,text=0)
        for b in translated:
            rect=fitz.Rect(b['rect']); rect.y0-=.5;rect.y1+=.5
            if b.get('columnEdits'):
                for r,t in b['columnEdits']:
                    rr=fitz.Rect(r);rr.y0-=.5;rr.y1+=.5
                    page.insert_htmlbox(rr,html.escape(t),css=f'body {{font-size:{b["fontSize"]}pt; margin:0;line-height:1;}}',scale_low=0)
                for s in b['segments']:s['target']=targets[s['id']];done+=1
                continue
            # Preserve block geometry. HTML handles CJK wrapping and font fallback.
            content=''.join('<span>'+html.escape(targets[s['id']])+'</span> ' for s in b['segments'])
            fs=b['fontSize']
            spare,scale=page.insert_htmlbox(rect,content,css=f'* {{font-family: sans-serif;}} body {{font-size:{fs}pt; line-height:1.15; margin:0; color:#151515;}}',scale_low=0)
            b['scale']=scale
            if scale*fs<6: warnings.append(f'第 {pm["number"]} 页部分文字缩至 {scale*fs:.1f}pt')
            for s in b['segments']:
                s['target']=targets[s['id']];done+=1
        # Map translated text back to actual output glyph boxes, never mirror coordinates.
        raw=page.get_text('rawdict')
        for b in translated:
            rect=fitz.Rect(b['rect']); candidates=[]
            for ob in raw['blocks']:
                if ob['type']!=0:continue
                for line in ob['lines']:
                    for span in line['spans']:
                        for c in span['chars']:
                            cr=fitz.Rect(c['bbox'])
                            if rect.contains(cr.tl+(cr.br-cr.tl)*.5):candidates.append(c)
            if b.get('columnEdits'):candidates.sort(key=lambda c:c['bbox'][0])
            compact=[{'c':ch,'bbox':c['bbox']} for c in candidates for ch in unicodedata.normalize('NFKC',c['c']) if not ch.isspace()]
            string=''.join(c['c'] for c in compact);cursor=0
            for s in b['segments']:
                target=''.join(unicodedata.normalize('NFKC',s['target']).split());pos=string.find(target,cursor)
                if pos>=0:s['targetRects']=line_rects(compact[pos:pos+len(target)]);cursor=pos+len(target);s['alignment']='sentence'
                else:s['targetRects']=[b['rect']];s['alignment']='paragraph';warnings.append(f'{s["id"]} 使用段落级对应')
    output=folder/'translated.tmp.pdf';doc.save(output,garbage=4,deflate=True);doc.close();replace_file(output,folder/'translated.pdf')
    meta['totalSegments']=sum(len(b['segments']) for p in meta['pages'] for b in p['blocks'])
    meta.update(translatedSegments=done,status='ready' if done==meta['totalSegments'] else 'partial',warnings=list(dict.fromkeys(warnings+errors)))
    save_json(folder/'document.json',meta)
    return meta

if __name__=='__main__':
    import sys
    if sys.argv[1]=='extract':
        d=extract(sys.argv[2]); print(json.dumps({k:v for k,v in d.items() if k!='pages'},ensure_ascii=False))
    elif sys.argv[1]=='build':
        d=build(sys.argv[2]);print(json.dumps({k:v for k,v in d.items() if k!='pages'},ensure_ascii=False))
