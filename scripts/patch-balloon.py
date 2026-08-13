# patch-balloon.py — 更新 ccn-balloon.cs(父子联动 + 堆叠)
import io

p = 'ccn-balloon.cs'
s = io.open(p, encoding='utf-8').read()

# 1. 构造器加 signal/tag 参数
s = s.replace(
"""        readonly long _hwnd;
        readonly string _logFile;

        public BalloonWindow(string title, string body, string project, long hwnd, bool noSound)
        {
            _hwnd = hwnd;""",
"""        readonly long _hwnd;
        readonly string _logFile;
        readonly string _signalFile;
        readonly System.Windows.Threading.DispatcherTimer _lifeTimer;

        public BalloonWindow(string title, string body, string project, long hwnd, bool noSound, string signalFile)
        {
            _hwnd = hwnd;
            _signalFile = signalFile;
            _lifeTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };""")

# 2. 点击弹窗:写 balloon-clicked 信号 + 关闭
s = s.replace(
"""            // 点击 → 跳转
            MouseLeftButtonDown += (s, e) =>
            {
                Log("clicked");
                if (_hwnd != 0)
                {
                    ShowWindow(new IntPtr(_hwnd), 9);
                    SetForegroundWindow(new IntPtr(_hwnd));
                }
                Close();
            };""",
"""            // 点击 → 跳转 + 通知 toast 进程关闭(父子联动)
            MouseLeftButtonDown += (s, e) =>
            {
                Log("clicked");
                if (_hwnd != 0)
                {
                    ShowWindow(new IntPtr(_hwnd), 9);
                    SetForegroundWindow(new IntPtr(_hwnd));
                }
                if (!string.IsNullOrEmpty(_signalFile))
                {
                    try { File.WriteAllText(_signalFile, "balloon-clicked"); } catch { }
                }
                Close();
            };""")

# 3. 生命周期联动:轮询信号文件,toast 关闭则弹窗关闭
s = s.replace(
"""                // 15 秒后淡出关闭
                var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
                timer.Tick += (s2, e2) =>
                {
                    timer.Stop();
                    var fadeOut = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(400));
                    fadeOut.Completed += (s3, e3) => Close();
                    BeginAnimation(OpacityProperty, fadeOut);
                };
                timer.Start();
            };""",
"""                // 15 秒后淡出关闭
                var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
                timer.Tick += (s2, e2) =>
                {
                    timer.Stop();
                    var fadeOut = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(400));
                    fadeOut.Completed += (s3, e3) => Close();
                    BeginAnimation(OpacityProperty, fadeOut);
                };
                timer.Start();
                // 父子联动:轮询信号文件,Toast 被点击/关闭时弹窗跟随关闭
                _lifeTimer.Tick += (s2, e2) =>
                {
                    if (!string.IsNullOrEmpty(_signalFile) && File.Exists(_signalFile))
                    {
                        try
                        {
                            var sig = File.ReadAllText(_signalFile).Trim();
                            if (sig == "activated" || sig == "dismissed" || sig == "timeout")
                            {
                                _lifeTimer.Stop();
                                timer.Stop();
                                Close();
                            }
                        }
                        catch { }
                    }
                };
                _lifeTimer.Start();
            };""")

# 4. PositionBottomRight:恢复堆叠(popup-stack),基线与 Toast 上方对齐
old_pos = s[s.index('void PositionBottomRight()'):s.index('void Log(', s.index('void PositionBottomRight()'))]
new_pos = """void PositionBottomRight()
        {
            // 父子位置:弹窗紧贴 Toast 正上方;多条弹窗时堆叠(每组 96px)
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cc-notifier");
            var stackFile = Path.Combine(dataDir, "popup-stack.json");
            int index = 0;
            try
            {
                var now = DateTime.Now.Ticks;
                var active = new System.Collections.Generic.List<long>();
                if (File.Exists(stackFile))
                {
                    foreach (var line in File.ReadAllLines(stackFile))
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        try
                        {
                            var parts = line.Split('|');
                            if (parts.Length == 2 && long.Parse(parts[1]) > now) active.Add(long.Parse(parts[0]));
                        }
                        catch { }
                    }
                }
                bool[] used = new bool[16];
                foreach (var id in active) { int st = (int)(id % 16); if (st >= 0 && st < 16) used[st] = true; }
                for (int i = 0; i < 16; i++) { if (!used[i]) { index = i; break; } }
                File.AppendAllText(stackFile, index + "|" + (now + TimeSpan.FromSeconds(16).Ticks) + Environment.NewLine);
            }
            catch { }

            var wa = SystemParameters.WorkArea;
            double top = wa.Bottom - 100 - 8 - ActualHeight - index * 96;
            if (top < wa.Top + 8) top = wa.Top + 8;
            Left = wa.Right - ActualWidth - 16;
            Top = top;
        }

"""
s = s.replace(old_pos, new_pos)

# 5. Main 解析 -signal 参数
s = s.replace(
"""            string title = "cc-notifier", body = "", project = "";
            long hwnd = 0;
            bool noSound = false;
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLowerInvariant())
                {
                    case "-title": if (i + 1 < args.Length) title = args[++i]; break;
                    case "-body": if (i + 1 < args.Length) body = args[++i]; break;
                    case "-project": if (i + 1 < args.Length) project = args[++i]; break;
                    case "-hwnd": if (i + 1 < args.Length) long.TryParse(args[++i], out hwnd); break;
                    case "-nosound": noSound = true; break;
                }
            }
            var app = new Application();
            var win = new BalloonWindow(title, body, project, hwnd, noSound);""",
"""            string title = "cc-notifier", body = "", project = "", signalFile = "";
            long hwnd = 0;
            bool noSound = false;
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLowerInvariant())
                {
                    case "-title": if (i + 1 < args.Length) title = args[++i]; break;
                    case "-body": if (i + 1 < args.Length) body = args[++i]; break;
                    case "-project": if (i + 1 < args.Length) project = args[++i]; break;
                    case "-signal": if (i + 1 < args.Length) signalFile = args[++i]; break;
                    case "-hwnd": if (i + 1 < args.Length) long.TryParse(args[++i], out hwnd); break;
                    case "-nosound": noSound = true; break;
                }
            }
            var app = new Application();
            var win = new BalloonWindow(title, body, project, hwnd, noSound, signalFile);""")

io.open(p, 'w', encoding='utf-8').write(s)
print('patched OK')
