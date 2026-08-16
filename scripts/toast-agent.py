# toast-agent.py — Toast 显示 + 进程内激活回调(点击跳转)+ 历史记录
# 用法:python toast-agent.py -Title <标题> -Body <正文> [-Project <项目名>] [-Hwnd <句柄>]
#       [-CdpPort <端口>] [-Duration <秒>] [-nosound]
# 行为:显示 WinRT Toast(完整内容,默认带声音;-nosound 静音),进程保持存活等待用户交互;
# 点击 Toast → ACTIVATED → (可选)CDP 激活对应 tab → SetForegroundWindow(跳转)→ 退出;
# 超时自动退出;通知内容追加 %LOCALAPPDATA%\cc-notifier\history.jsonl
import sys
import os
import json
import time
import ctypes
import threading
import subprocess
import urllib.request

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
    opts = {'title': 'cc-notifier', 'body': '', 'project': '', 'session_title': '', 'surface': '', 'hwnd': 0, 'cdp_port': 0, 'duration': 20, 'nosound': False, 'lang': ''}
    i = 0
    while i < len(args):
        a = args[i].lower()
        if a in ('-title', '-body', '-project', '-sessiontitle', '-surface', '-duration', '-lang') and i + 1 < len(args):
            v = args[i + 1]
            if a == '-title': opts['title'] = v
            elif a == '-body': opts['body'] = v
            elif a == '-project': opts['project'] = v
            elif a == '-sessiontitle': opts['session_title'] = v
            elif a == '-surface': opts['surface'] = v
            elif a == '-duration': opts['duration'] = int(v)
            elif a == '-lang': opts['lang'] = v
            i += 2
        elif a == '-hwnd' and i + 1 < len(args):
            opts['hwnd'] = int(args[i + 1]); i += 2
        elif a == '-cdpport' and i + 1 < len(args):
            opts['cdp_port'] = int(args[i + 1]); i += 2
        elif a == '-nosound':
            opts['nosound'] = True; i += 1
        else:
            i += 1
    return opts

def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def cdp_activate(port):
    """经 CDP HTTP 端点精确激活 dsh tab(标题含 DeepSeek Harness);失败返回 False。
    /json/activate/<id> 等效 Target.activateTarget,可跨浏览器窗口激活指定标签页。"""
    if not port:
        return False
    try:
        req = urllib.request.Request(
            f'http://127.0.0.1:{port}/json/list',
            headers={'Host': 'localhost'},  # 新版 Chromium 校验 Host 头
        )
        with urllib.request.urlopen(req, timeout=3) as r:
            targets = json.loads(r.read().decode('utf-8', 'replace'))
        target = next((t for t in targets
                       if t.get('type') == 'page' and 'deepseek harness' in (t.get('title') or '').lower()), None)
        if not target:  # 兜底:任意含 deepseek 的 target
            target = next((t for t in targets
                           if 'deepseek' in ((t.get('title') or '') + (t.get('url') or '')).lower()), None)
        if not target:
            log(f"CDP activate: no dsh target (list={len(targets)})")
            return False
        act = urllib.request.Request(
            f"http://127.0.0.1:{port}/json/activate/{target['id']}",
            headers={'Host': 'localhost'},
        )
        with urllib.request.urlopen(act, timeout=3) as r:
            r.read()
        log(f"CDP activate OK target={target['id']} title={(target.get('title') or '')[:60]}")
        return True
    except Exception as e:
        log(f"CDP activate failed: {e}")
        return False

def _compile_uia_helper(lib):
    """现场编译 activate-tab.cs(csc 随 .NET Framework 分发;编译一次 ~1s,此后每次激活 ~0.7s)。"""
    cs = os.path.join(lib, 'activate-tab.cs')
    csc = os.path.join(os.environ.get('windir', 'C:\\Windows'),
                       'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
    if not (os.path.exists(csc) and os.path.exists(cs)):
        return
    uia = 'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\UIAutomationClient\\v4.0_4.0.0.0__31bf3856ad364e35\\UIAutomationClient.dll'
    uiat = 'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\UIAutomationTypes\\v4.0_4.0.0.0__31bf3856ad364e35\\UIAutomationTypes.dll'
    try:
        proc = subprocess.run(
            [csc, '/nologo', '/r:' + uia, '/r:' + uiat,
             '/out:' + os.path.join(lib, 'activate-tab.exe'), cs],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60,
        )
        if proc.returncode == 0:
            log("UIA helper compiled: activate-tab.exe")
    except Exception as e:
        log(f"UIA helper compile failed: {e}")

def uia_activate(hwnd, matches):
    """精确激活标题匹配的 tab:候选匹配串依次尝试(预编译 exe 每候选 ~0.7s;
    缺 exe 时现场 csc 编译一次);全部 miss 后回退 PowerShell 桥(win32.ps1 activate-tab,
    用最后一个候选——产品名,dsh tab 标题必含)。
    2026-08-16 实测:dsh tab 标题形如「对话 | 轨迹 | <url> — DeepSeek Harness …」,
    **不含会话标题**,会话标题候选必 miss(仅当未来标题含会话名时生效),
    产品名候选必命中第一个 dsh tab。"""
    if not hwnd or not matches:
        return False
    lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')
    exe = os.path.join(lib, 'activate-tab.exe')
    try:
        if not os.path.exists(exe):
            _compile_uia_helper(lib)
        if os.path.exists(exe):
            for match in matches:
                proc = subprocess.run(
                    [exe, '-Hwnd', str(hwnd), '-Match', match],
                    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10,
                )
                data = json.loads(proc.stdout or '{}')
                if data.get('ok'):
                    log(f"UIA(exe) activate OK: {(data.get('name') or '')[:60]}")
                    return True
                log(f"UIA(exe) miss: match={match[:30]} count={data.get('count')} err={(data.get('error') or '')[:40]}")
    except Exception as e:
        log(f"UIA(exe) error: {e}")
    return _uia_activate_ps(hwnd, matches[-1])

def _uia_activate_ps(hwnd, match):
    """回退路径:win32.ps1 activate-tab 桥(PowerShell 启动 ~1.7s)。"""
    if not hwnd or not match:
        return False
    try:
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib', 'win32.ps1')
        ps = os.path.join(os.environ.get('windir', 'C:\\Windows'),
                          'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        proc = subprocess.run(
            [ps, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
             '-File', script, '-Action', 'activate-tab', '-Hwnd', str(hwnd), '-Match', match],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15,
        )
        data = json.loads(proc.stdout or '{}')
        if data.get('ok'):
            log(f"UIA(ps) activate tab OK: {(data.get('name') or '')[:60]}")
            return True
        log(f"UIA(ps) activate miss: tabs={data.get('count')} names={(data.get('names') or '')[:80]} err={data.get('error','')[:60]}")
        return False
    except Exception as e:
        log(f"UIA(ps) activate error: {e}")
        return False

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
    # 统一 Toast 模板(所有类型 × 所有 surface,2026-08-16 用户要求统一美观):
    #   第一行(粗体)= 身份:会话标题(dsh,超 20 截断)> DeepSeek Harness(web 无标题)
    #                 > 项目名(tui/Claude Code)
    #   第二行      = 「类型 · 摘要」;摘要已含类型文案时不重复前缀(如「DeepSeek Harness 等待输入」)
    def trunc(s, n=20):
        return s if len(s) <= n else s[:n - 1] + '…'
    if opts.get('session_title'):
        first = trunc(opts['session_title'])
    elif opts.get('surface') == 'web':
        first = 'DeepSeek Harness'
    elif opts['project']:
        first = opts['project']  # 项目名通常短,不截断
    else:
        first = opts['title']
    if opts['title'] and opts['title'] in opts['body']:
        second = opts['body']  # 摘要已含类型(如 stop:「DeepSeek Harness 等待输入」)
    elif opts['title']:
        second = f"{opts['title']} · {opts['body']}"
    else:
        second = opts['body']
    audio_line = '' if opts['nosound'] else '<audio src="ms-winsoundevent:Notification.Default"/>'
    # lang 属性(zh/en):提示系统按语言处理文本(如朗读);未传则不输出
    lang_attr = f' lang="{esc(opts["lang"])}"' if opts['lang'] else ''
    # 品牌图标(appLogoOverride,按来源区分,用户要求 2026-08-16):
    # - dsh(web/tui):DeepSeek Harness 鲸鱼(透明底,圆形裁剪)
    # - Claude Code / 未知来源:Claude Code 星形 logo(方块原样)
    # 图标与脚本同装(scripts/lib/);缺失时静默回退 AUMID 图标
    icon_line = ''
    lib_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')
    if opts.get('surface') in ('web', 'tui'):
        icon_name, crop = 'notifier-icon.png', ' hint-crop="circle"'
    else:
        icon_name, crop = 'claude-icon.png', ''
    icon_path = os.path.join(lib_dir, icon_name)
    if os.path.exists(icon_path):
        icon_line = (f'<image src="file:///{icon_path.replace(chr(92), "/")}"'
                     f' placement="appLogoOverride"{crop}/>')
    xml_text = f"""<toast{lang_attr} duration="long">
  <visual><binding template="ToastGeneric">
    {icon_line}
    <text>{esc(first)}</text>
    <text>{esc(second)}</text>
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
        # 时序:先瞬时置前窗口(用户感知零延迟),后台线程做精确 tab 激活
        # (CDP → UIA exe ~0.7s;仅 web surface 执行,Claude Code/tui 点击路径保持原样)
        if hwnd:
            ctypes.windll.user32.ShowWindow(ctypes.c_void_p(hwnd), 9)
            ok = ctypes.windll.user32.SetForegroundWindow(ctypes.c_void_p(hwnd))
            log(f"SetForegroundWindow({hwnd}) ret={ok}")
        if opts.get('surface') == 'web':
            # 候选匹配串:会话标题(若未来 tab 标题含会话名则精确)→ 产品名(dsh tab 必含,命中第一个)
            tab_matches = []
            if opts.get('session_title'):
                tab_matches.append(opts['session_title'])
            tab_matches.append('deepseek harness')
            act_thread = threading.Thread(
                target=lambda: (cdp_activate(opts.get('cdp_port', 0)), uia_activate(hwnd, tab_matches)),
                daemon=True,
            )
            act_thread.start()
            act_thread.join(3)  # 等精确激活落定(最多 3s);超时则进程退出,tab 激活已尽力
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
