# Integration test for the reported 28-page two-column paper.
# Usage: python test-worker.py <PDF path> [site URL]
import asyncio,json,time,sys,os
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('EDGE_PATH',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),headless=True)
  ctx=await browser.new_context();page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(sys.argv[2] if len(sys.argv)>2 else 'http://127.0.0.1:8768')
  await page.locator('#upload').set_input_files(sys.argv[1])
  await page.locator('#leftOverlay .hit').first.wait_for(timeout=120000)
  data=await page.evaluate("""async()=>{const s=await import('./storage.js');return (await s.get((await s.list())[0].id)).pages}""")
  intro=[b for b in data[0]['blocks'] if b['y']>550]
  assert len(intro)==3 and all(b['w']<245 for b in intro)
  left=' '.join(s['source'] for b in intro if b['x']<100 for s in b['segments'])
  assert 'transport service' in left and 'trans-' not in left and 'To solve the mismatch' not in left
  right=' '.join(s['source'] for b in intro if b['x']>300 for s in b['segments'])
  assert 'passenger demand' in right and 'effectively' in right
  state={'active':0,'max':0,'batches':0,'segments':0};sent=[]
  async def mock(route):
   batch=json.loads(route.request.post_data_json['messages'][1]['content']);sent.extend(batch)
   state['active']+=1;state['max']=max(state['max'],state['active']);state['batches']+=1;state['segments']+=len(batch)
   await asyncio.sleep(.15)
   await route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({s['id']:'本研究通过调整列车运力和客流控制策略改善轨道交通服务。' for s in batch},ensure_ascii=False)}}]}))
   state['active']-=1
  await ctx.route('https://api.test/**',mock)
  await page.locator('#settingsButton').click();await page.locator('#baseUrl').fill('https://api.test/v1');await page.locator('#apiKey').fill('test-key');await page.locator('#model').fill('test');await page.locator('#saveSettings').click()
  # Reproduce the exact old deadlock: no animation frame can ever finish.
  await page.evaluate("window.savedRAF=requestAnimationFrame;window.requestAnimationFrame=()=>0;Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})")
  start=time.monotonic();await page.locator('#translate').dispatch_event('click');await page.evaluate("async()=>{const s=await import('./storage.js');await s.patch((await s.list())[0].id,{lastPage:2})}")
  await page.wait_for_function("document.querySelector('#translate').textContent==='译文已生成'",polling=100,timeout=120000)
  result=await page.evaluate("""async()=>{const s=await import('./storage.js');const d=await s.get((await s.list())[0].id);const a=d.pages.flatMap(p=>p.blocks.flatMap(b=>b.segments));return {total:a.length,done:a.filter(s=>s.target).length,lastPage:d.lastPage}}""")
  assert result['total']==result['done']==state['segments'];assert state['max']==2;assert result['lastPage']==2;assert not errors
  await page.evaluate("window.requestAnimationFrame=window.savedRAF;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
  await page.locator('#leftScroll').evaluate('(el)=>el.scrollTop=el.scrollHeight');await page.wait_for_timeout(1800);await page.screenshot(path=str(Path(__file__).parent/'tmp/actual-fixed-reader.png'),full_page=True)
  print(json.dumps({'actual_pdf_pages':len(data),'columns_and_transport':True,'background_with_raf_disabled':True,'concurrency':state['max'],'batches':state['batches'],'saved':result,'seconds':round(time.monotonic()-start,2),'errors':errors}))
  await browser.close()
asyncio.run(main())
