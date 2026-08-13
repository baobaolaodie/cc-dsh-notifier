// ccn-balloon.cs — WPF 自绘通知弹窗(现代 Toast 样式:圆角+半透明+淡入淡出)
// 编译:csc /target:winexe /out:ccn-balloon.exe /r:PresentationFramework.dll /r:PresentationCore.dll /r:WindowsBase.dll /r:System.Xaml.dll ccn-balloon.cs
// 用法:ccn-balloon.exe -Title <标题> -Body <正文> [-Project <项目名>] [-Hwnd <句柄>] [-NoSound]
// 显示在屏幕右下角,点击 → SetForegroundWindow(句柄),6 秒后淡出自动消失
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;

namespace CcnBalloon
{
    public class BalloonWindow : Window
    {
        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        readonly long _hwnd;
        readonly string _logFile;

        public BalloonWindow(string title, string body, string project, long hwnd, bool noSound)
        {
            _hwnd = hwnd;
            _logFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "cc-notifier", "balloon.log");
            Log("show title=" + title + " hwnd=" + hwnd);

            // 历史记录(弥补弹窗不进操作中心)
            try
            {
                var histDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cc-notifier");
                Directory.CreateDirectory(histDir);
                var hist = "{\"ts\":\"" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") +
                    "\",\"project\":\"" + (project ?? "") + "\",\"title\":\"" + (title ?? "") +
                    "\",\"body\":\"" + (body ?? "") + "\"}" + Environment.NewLine;
                File.AppendAllText(Path.Combine(histDir, "history.jsonl"), hist);
            }
            catch { }

            // 窗口配置:无边框、透明、置顶、不抢焦点、不占任务栏
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ShowActivated = false;
            SizeToContent = SizeToContent.WidthAndHeight;
            ResizeMode = ResizeMode.NoResize;

            // 内容:圆角半透明卡片
            var border = new Border
            {
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(Color.FromArgb(235, 32, 32, 32)), // 深色半透明
                BorderBrush = new SolidColorBrush(Color.FromArgb(80, 255, 255, 255)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(16, 12, 16, 12),
                Margin = new Thickness(12),
                Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    BlurRadius = 24,
                    ShadowDepth = 2,
                    Opacity = 0.5
                }
            };

            var panel = new StackPanel { MaxWidth = 320 };

            // 精简内容:标题 = "点击跳转 · <事件类型>",正文 = 项目名 + 摘要
            var titleText = "点击跳转 · " + (title ?? "");
            panel.Children.Add(new TextBlock
            {
                Text = titleText,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                TextWrapping = TextWrapping.Wrap
            });
            var bodyLines = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrEmpty(project)) bodyLines.Add(project);
            if (!string.IsNullOrEmpty(body)) bodyLines.Add(body);
            if (bodyLines.Count > 0)
            {
                panel.Children.Add(new TextBlock
                {
                    Text = string.Join(" · ", bodyLines),
                    FontSize = 12,
                    Foreground = new SolidColorBrush(Color.FromArgb(230, 220, 220, 220)),
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 3, 0, 0)
                });
            }
            panel.Children.Add(new TextBlock
            {
                Text = "点击此通知跳回会话窗口",
                FontSize = 11,
                Foreground = new SolidColorBrush(Color.FromArgb(200, 150, 180, 255)),
                Margin = new Thickness(0, 6, 0, 0)
            });

            border.Child = panel;
            Content = border;

            // 点击 → 跳转
            MouseLeftButtonDown += (s, e) =>
            {
                Log("clicked");
                if (_hwnd != 0)
                {
                    ShowWindow(new IntPtr(_hwnd), 9);
                    SetForegroundWindow(new IntPtr(_hwnd));
                }
                Close();
            };

            // 声音
            if (!noSound)
            {
                try { System.Media.SystemSounds.Exclamation.Play(); } catch { }
            }

            // 淡入
            Opacity = 0;
            Loaded += (s, e) =>
            {
                var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(200));
                BeginAnimation(OpacityProperty, fadeIn);
                PositionBottomRight();
                // 15 秒后淡出关闭
                var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
                timer.Tick += (s2, e2) =>
                {
                    timer.Stop();
                    var fadeOut = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(400));
                    fadeOut.Completed += (s3, e3) => Close();
                    BeginAnimation(OpacityProperty, fadeOut);
                };
                timer.Start();
            };
        }

        void PositionBottomRight()
        {
            // 堆叠管理:弹窗位于 Toast 区域上方,多条通知时依次上移(父子视觉)
            // 通过共享状态文件 popup-stack.json 协调:活跃弹窗数决定本弹窗的垂直偏移
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cc-notifier");
            var stackFile = Path.Combine(dataDir, "popup-stack.json");
            int index = 0;
            try
            {
                var active = new System.Collections.Generic.List<long>();
                var now = DateTime.Now.Ticks;
                if (File.Exists(stackFile))
                {
                    var lines = File.ReadAllLines(stackFile);
                    foreach (var line in lines)
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
                // 槽位:每弹窗占 96px(高约 84 + 间距 12);找第一个空槽
                bool[] used = new bool[16];
                foreach (var id in active) { int s = (int)(id % 16); if (s >= 0 && s < 16) used[s] = true; }
                for (int i = 0; i < 16; i++) { if (!used[i]) { index = i; break; } }
                File.AppendAllText(stackFile, index + "|" + (now + TimeSpan.FromSeconds(6).Ticks) + Environment.NewLine);
                // 清理过期行
                if (active.Count == 0 && File.Exists(stackFile)) File.WriteAllText(stackFile, index + "|" + (now + TimeSpan.FromSeconds(6).Ticks) + Environment.NewLine);
            }
            catch { }

            var wa = SystemParameters.WorkArea;
            // 通知组堆叠(Toast 在下,弹窗在上):每组占 200px
            // 第 index 组:Toast 底部在 workarea 底部,Toast 高约 100px,
            // 弹窗在 Toast 上方:top = bottom - (index+1)*200(Toast 100 + 弹窗 90 + 间距 10)
            double baseTop = wa.Bottom - (index + 1) * 200 + 100 + 8;  // = bottom - index*200 - 92
            if (baseTop < wa.Top + 8) baseTop = wa.Top + 8;
            Left = wa.Right - ActualWidth - 16;
            Top = baseTop;
        }

        void Log(string msg)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_logFile));
                File.AppendAllText(_logFile, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + Environment.NewLine);
            }
            catch { }
        }
    }

    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            string title = "cc-notifier", body = "", project = "";
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
            var win = new BalloonWindow(title, body, project, hwnd, noSound);
            win.Show();
            app.Run();
            return 0;
        }
    }
}
