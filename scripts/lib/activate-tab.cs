// activate-tab.cs — UIA 标签页激活器(预编译 exe,替代每次 spawn PowerShell 的 1.6-1.8s 开销)
// 用法:activate-tab.exe -Hwnd <窗口句柄> -Match <标题匹配(不区分大小写)>
// 输出:{"ok":true,"name":...} 命中并 Select;{"ok":false,"count":N} 未命中;{"ok":false,"error":...} 异常
// 编译:csc.exe /nologo /r:UIAutomationClient.dll /r:UIAutomationTypes.dll /out:activate-tab.exe activate-tab.cs
// (csc 随 .NET Framework 分发;C# 编译一次后每次激活 ~50ms)
using System;
using System.Windows.Automation;

class ActivateTab
{
    static string Esc(string s)
    {
        return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    static int Main(string[] args)
    {
        long hwnd = 0;
        string match = "";
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "-Hwnd" && i + 1 < args.Length) long.TryParse(args[i + 1], out hwnd);
            else if (args[i] == "-Match" && i + 1 < args.Length) match = args[i + 1];
        }
        if (hwnd == 0)
        {
            Console.WriteLine("{\"ok\":false,\"error\":\"no hwnd\"}");
            return 1;
        }
        try
        {
            AutomationElement root = AutomationElement.FromHandle(new IntPtr(hwnd));
            if (root == null)
            {
                Console.WriteLine("{\"ok\":false,\"error\":\"FromHandle null\"}");
                return 1;
            }
            PropertyCondition cond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem);
            // 全树 FindAll:Edge 的标签条定位不稳定(存在多个 Tab 控件),全树遍历实测
            // ~0.9s(ToHandle+遍历是主要成本);toast 点击侧已改为「先置前窗口、后台激活」
            // 时序,遍历耗时被窗口瞬时跳转掩盖
            AutomationElementCollection tabs = root.FindAll(TreeScope.Descendants, cond);
            foreach (AutomationElement t in tabs)
            {
                string name = t.Current.Name ?? "";
                if (name.IndexOf(match, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    SelectionItemPattern pat = (SelectionItemPattern)t.GetCurrentPattern(SelectionItemPattern.Pattern);
                    pat.Select();
                    Console.WriteLine("{\"ok\":true,\"name\":\"" + Esc(name) + "\"}");
                    return 0;
                }
            }
            Console.WriteLine("{\"ok\":false,\"count\":" + tabs.Count + "}");
            return 1;
        }
        catch (Exception e)
        {
            Console.WriteLine("{\"ok\":false,\"error\":\"" + Esc(e.Message) + "\"}");
            return 1;
        }
    }
}
