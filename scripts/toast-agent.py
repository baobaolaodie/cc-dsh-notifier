# toast-agent.py — Toast 显示 + 进程内激活回调(点击跳转)+ 历史记录
# 用法:python toast-agent.py -Title <标题> -Body <正文> [-Project <项目名>] [-Hwnd <句柄>] [-Duration <秒>] [-nosound]
# 行为:显示 WinRT Toast(完整内容,默认带声音;-nosound 静音),进程保持存活等待用户交互;
# 点击 Toast → ACTIVATED → SetForegroundWindow(跳转)→ 退出;超时自动退出;
# 通知内容追加 %LOCALAPPDATA%\cc-notifier\history.jsonl
import sys
import os
import json
import time
import ctypes
import threading

sys.stdout.reconfigure(encoding='utf-8')

import winrt.windows.ui.notifications as notifications
import winrt.windows.data.xml.dom as dom

DATA_DIR = os.path.join(os.environ['LOCALAPPDATA'], 'cc-notifier')
LOG = os.path.join(DATA_DIR, 'toast-click.log')

def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(f"{time.strftime('%H:%M:%S.')}{int(time.time()*1000)%1000:03d} {msg}\n")
    except Exception:
        pass

def parse_args(args):
    opts = {'title': 'cc-notifier', 'body': '', 'project': '', 'hwnd': 0, 'duration': 20, 'nosound': False, 'lang': ''}
    i = 0
    while i < len(args):
        a = args[i].lower()
        if a in ('-title', '-body', '-project', '-duration', '-lang') and i + 1 < len(args):
            v = args[i + 1]
            if a == '-title': opts['title'] = v
            elif a == '-body': opts['body'] = v
            elif a == '-project': opts['project'] = v
            elif a == '-duration': opts['duration'] = int(v)
            elif a == '-lang': opts['lang'] = v
            i += 2
        elif a == '-hwnd' and i + 1 < len(args):
            opts['hwnd'] = int(args[i + 1]); i += 2
        elif a == '-nosound':
            opts['nosound'] = True; i += 1
        else:
            i += 1
    return opts

def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def main():
    opts = parse_args(sys.argv[1:])
    hwnd = opts['hwnd']
    log(f"start title={opts['title']} hwnd={hwnd}")

    # 历史记录(本地可追溯)
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        rec = json.dumps({
            'ts': time.strftime('%Y-%m-%d %H:%M:%S'),
            'project': opts['project'] or '',
            'title': opts['title'] or '',
            'body': opts['body'] or '',
        }, ensure_ascii=False) + '\n'
        with open(os.path.join(DATA_DIR, 'history.jsonl'), 'a', encoding='utf-8') as f:
            f.write(rec)
    except Exception:
        pass

    # 显示 Toast(完整内容)—— appId 用已注册的 'cc-notifier'(注册表 AUMID)
    # 点击激活走进程内 add_activated 回调(Python winrt 独立线程,进程存活时可靠触发)
    app_id = 'cc-notifier'
    display = f"{opts['project']} · {opts['title']}" if opts['project'] else opts['title']
    audio_line = '' if opts['nosound'] else '<audio src="ms-winsoundevent:Notification.Default"/>'
    # lang 属性(zh/en):提示系统按语言处理文本(如朗读);未传则不输出
    lang_attr = f' lang="{esc(opts["lang"])}"' if opts['lang'] else ''
    xml_text = f"""<toast{lang_attr} duration="long">
  <visual><binding template="ToastGeneric">
    <text>{esc(display)}</text>
    <text>{esc(opts['body'])}</text>
  </binding></visual>
  {audio_line}
</toast>"""

    xdoc = dom.XmlDocument()
    xdoc.load_xml(xml_text)
    toast = notifications.ToastNotification(xdoc)

    done = threading.Event()

    def handle_activated(sender, _):
        # 回调在独立线程触发(winrt 投影保证,不依赖消息泵)
        log("ACTIVATED")
        if hwnd:
            ctypes.windll.user32.ShowWindow(ctypes.c_void_p(hwnd), 9)
            ok = ctypes.windll.user32.SetForegroundWindow(ctypes.c_void_p(hwnd))
            log(f"SetForegroundWindow({hwnd}) ret={ok}")
        done.set()

    def handle_dismissed(sender, args):
        log(f"DISMISSED reason={args.reason}")
        done.set()

    toast.add_activated(handle_activated)
    toast.add_dismissed(handle_dismissed)

    notifier = notifications.ToastNotificationManager.create_toast_notifier_with_id(app_id)
    notifier.show(toast)
    log("shown, waiting for click...")

    done.wait(opts['duration'] + 5)  # 回调在独立线程,主线程等待即可
    log("exit")
    return 0

if __name__ == '__main__':
    sys.exit(main())
