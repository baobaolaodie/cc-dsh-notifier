// foreground.cs — 前台窗口查询器(预编译 exe,~50ms;替代 spawn PowerShell 的 1.6-1.8s)
// 用法:foreground.exe
// 输出:{"hwnd":...,"pid":...,"title":"...","processName":"..."}(与 win32.ps1 foreground 同构)
// 编译:csc.exe /nologo /out:foreground.exe foreground.cs
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;

class Foreground
{
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

    static string Esc(string s)
    {
        return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    static int Main()
    {
        IntPtr h = GetForegroundWindow();
        uint pid = 0;
        GetWindowThreadProcessId(h, out pid);
        int len = GetWindowTextLength(h);
        StringBuilder sb = new StringBuilder(len + 1);
        if (len > 0) GetWindowText(h, sb, sb.Capacity);
        string proc = "";
        try { proc = Process.GetProcessById((int)pid).ProcessName; } catch { }
        Console.WriteLine("{\"hwnd\":" + h.ToInt64() + ",\"pid\":" + pid
            + ",\"title\":\"" + Esc(sb.ToString()) + "\",\"processName\":\"" + Esc(proc) + "\"}");
        return 0;
    }
}
