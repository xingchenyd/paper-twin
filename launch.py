"""Start/reuse the local application without keeping a terminal open."""
from pathlib import Path
import subprocess,sys,time,urllib.request,webbrowser
ROOT=Path(__file__).resolve().parent
URL='http://127.0.0.1:8766'
def running():
    try:
        with urllib.request.urlopen(URL+'/api/library',timeout=1) as r:return r.status==200
    except Exception:return False
if not running():
    log=open(ROOT/'server.log','a',encoding='utf8')
    subprocess.Popen([sys.executable,'-X','utf8',str(ROOT/'server.py')],cwd=ROOT,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
    for _ in range(50):
        if running():break
        time.sleep(.2)
    else:raise SystemExit('本地服务启动失败，请查看 server.log。')
webbrowser.open(URL)
