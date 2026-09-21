"""One-click setup: inspect dependencies before touching the environment."""
import sys, subprocess, threading, queue, importlib.metadata, os
from pathlib import Path
ROOT=Path(__file__).resolve().parent
FLAGS=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0

def dependencies_ready(python):
    check="import importlib.metadata,fitz; assert importlib.metadata.version('PyMuPDF')=='1.27.2.3'"
    return subprocess.run([str(python),'-c',check],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=FLAGS).returncode==0

def prepare(report):
    local=ROOT/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    current=Path(sys.executable)
    if current.name.lower()=='pythonw.exe':current=current.with_name('python.exe')
    for candidate in [local,current]:
        if candidate.exists() and dependencies_ready(candidate):
            report('依赖已就绪，直接启动，不重复安装。');return candidate
    report('首次准备运行环境，请稍候…')
    log=ROOT/'setup.log'
    with log.open('a',encoding='utf8') as output:
        if not local.exists():subprocess.run([str(current),'-m','venv',str(ROOT/'.venv')],check=True,stdout=output,stderr=output,creationflags=FLAGS)
        report('仅补齐本工具所需依赖，请保持网络连接…')
        subprocess.run([str(local),'-m','pip','install','-r',str(ROOT/'requirements.txt')],check=True,stdout=output,stderr=output,creationflags=FLAGS)
    if not dependencies_ready(local):raise RuntimeError('依赖检查失败，请查看 setup.log。')
    return local

def main():
    import tkinter as tk
    from tkinter import messagebox
    window=tk.Tk();window.title('对页 · 启动助手');window.geometry('480x260');window.resizable(False,False)
    tk.Label(window,text='欢迎使用对页',font=('Microsoft YaHei',18,'bold')).pack(pady=(24,10))
    tk.Label(window,text='自动检查环境，仅安装缺失或版本不匹配的依赖。\n论文和历史保存在当前助手文件夹中。',font=('Microsoft YaHei',10),justify='center').pack()
    status=tk.StringVar(value='点击后自动准备环境并打开网页。')
    tk.Label(window,textvariable=status,wraplength=440,fg='#45618a').pack(pady=16)
    events=queue.Queue()
    def worker():
        try:
            python=prepare(lambda text:events.put(('status',text)))
            subprocess.run([str(python),str(ROOT/'launch.py')],cwd=ROOT,check=True,creationflags=FLAGS)
            events.put(('done',''))
        except Exception as error:events.put(('error',str(error)))
    def start():
        button.config(state='disabled',text='正在准备…');threading.Thread(target=worker,daemon=True).start()
    button=tk.Button(window,text='启动对页',command=start,bg='#285ce2',fg='white',font=('Microsoft YaHei',12),width=20);button.pack()
    def poll():
        try:
            while True:
                kind,text=events.get_nowait()
                if kind=='status':status.set(text)
                elif kind=='done':window.destroy();return
                else:
                    status.set('启动失败，可重试；详细信息见 setup.log。');button.config(state='normal',text='重试');messagebox.showerror('启动失败',text)
        except queue.Empty:pass
        window.after(150,poll)
    poll();window.mainloop()
if __name__=='__main__':main()
