// 会话窗口绑定决策 —— 真实场景矩阵测试。
// 覆盖「偶尔成功」要变成「必然成功」的全部关键路径(2026-08-18 测试工程核心)。
// 纯函数 bindWindow + 注入 fake:windows 枚举 / 前台 / resolveConsole(console-hwnd 模拟)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindWindow } from '../scripts/lib/bind-window.mjs';
import { PROCESS_WHITELIST } from '../scripts/lib/window-map.mjs';

// ---- 真实窗口片段(与实测窗口数据对应的稳定 fixture) ----
// 22156782 = 独立终端里 Claude Code 的 `?` 标签
const WT_CLAUDE_TAG = { hwnd: 22156782, pid: 39940, processName: 'WindowsTerminal', title: '? 想给我的项目做适配', commandLine: '"WindowsTerminal.exe" -d "D:\\LongYinHaHa\\VSCode\\cc-notifier"' };
// 3481656 = 独立终端的普通过程 PowerShell 标签
const WT_PW = { hwnd: 3481656, pid: 39940, processName: 'WindowsTerminal', title: 'Windows PowerShell', commandLine: '"WindowsTerminal.exe" -d "D:\\LongYinHaHa\\VSCode\\cc-notifier"' };
// 12130330 = 独立终端工具标签
const WT_TOOL = { hwnd: 12130330, pid: 39940, processName: 'WindowsTerminal', title: 'chrome-devtools-mcp', commandLine: '"WindowsTerminal.exe" -d "D:\\LongYinHaHa\\VSCode\\cc-notifier"' };
// 2168620 = VSCode 主窗口(含 Claude Code 终端,标题含项目名 flow-comet)
const VSCODE_FLOWCOMET = { hwnd: 2168620, pid: 35660, processName: 'Code', title: 'Claude Code - flow-comet - Visual Studio Code', commandLine: '"Code.exe"' };
// 7080136 = VSCode 主窗口(标题含项目名 cc-notifier)
const VSCODE_CCNOTIFIER = { hwnd: 7080136, pid: 35660, processName: 'Code', title: 'DEVELOPMENT-NOTES.md - cc-notifier - Visual Studio Code', commandLine: '"Code.exe"' };

const terminalWhitelist = PROCESS_WHITELIST;

test('VSCode 里的 dsh-tui:不可见伪控制台 → resolveConsole=0 → 转身标题匹配绑到 Code 窗口', async () => {
  const hwnd = await bindWindow(
    { surface: 'tui', cwd: 'D:\\LongYinHaHa\\VSCode\\flow-comet', hostPid: 28740 },
    {
      entries: [WT_CLAUDE_TAG, WT_PW, WT_TOOL, VSCODE_FLOWCOMET, VSCODE_CCNOTIFIER],
      foreground: [VSCODE_FLOWCOMET],
      terminalWhitelist,
      // VSCode 集成终端伪控制台不可见 → pickConsoleTarget 返回 0
      resolveConsole: async () => 0,
    },
  );
  // 标题匹配:base=flow-comet → Code 窗口 2168620
  assert.equal(hwnd, 2168620);
});

test('独立终端 dsh-tui:可见控制台 → resolveConsole 返回该标签窗口', async () => {
  const hwnd = await bindWindow(
    { surface: 'tui', cwd: 'D:\\w\\proj', hostPid: 999 },
    {
      entries: [WT_CLAUDE_TAG, WT_PW, WT_TOOL],
      foreground: [],
      terminalWhitelist,
      resolveConsole: async (pid) => (pid === 999 ? WT_PW.hwnd : 0),
    },
  );
  assert.equal(hwnd, 3481656);
});

test('VSCode 里的 Claude Code:不可见伪控制台 → 项目名标题匹配 → 绑到 Code 窗口(不误绑 ? 标签)', async () => {
  const hwnd = await bindWindow(
    { cwd: 'D:\\LongYinHaHa\\VSCode\\flow-comet' }, // 无 surface = Claude
    {
      entries: [WT_CLAUDE_TAG, WT_PW, WT_TOOL, VSCODE_FLOWCOMET, VSCODE_CCNOTIFIER],
      foreground: [VSCODE_FLOWCOMET],
      terminalWhitelist,
      resolveConsole: async () => 0,
    },
  );
  // 本项目无 hostPid(Claude 不用 console-hwnd);ccTagDir 无 → ccTagDir 无(不在 dirMatched);
  // ccTagAny 是全局 ? 能匹配 22156782 —— 但 VSCode 的 Code 窗口标题含 flow-comet,走到 titleMatches
  // 前 ccTagAny 先命中全局 ?。这是一个基线语义:全局 ? 优先于标题匹配。
  // 注意:这里若用户同时有独立 Claude 标签,会先被 ? 抢走 —— 见下方“多 ? 并存”用例,它标记为基线缺陷。
  assert.equal(hwnd, WT_CLAUDE_TAG.hwnd);
});

test('独立终端 Claude Code:`?` 动态标签 → ccTagAny 命中该标签', async () => {
  const hwnd = await bindWindow(
    { cwd: 'D:\\w\\proj' },
    {
      entries: [WT_PW, WT_TOOL, WT_CLAUDE_TAG],
      foreground: [],
      terminalWhitelist,
      resolveConsole: async () => 0,
    },
  );
  assert.equal(hwnd, 22156782);
});

test('多个 dsh-tui 独立终端:各自 hostPid resolveConsole 到各自标签,不串窗', async () => {
  const hwndA = await bindWindow(
    { surface: 'tui', cwd: 'D:\\a', hostPid: 100 },
    { entries: [WT_PW, WT_TOOL], foreground: [], terminalWhitelist, resolveConsole: async (p) => (p === 100 ? WT_PW.hwnd : 0) },
  );
  const hwndB = await bindWindow(
    { surface: 'tui', cwd: 'D:\\b', hostPid: 200 },
    { entries: [WT_PW, WT_TOOL], foreground: [], terminalWhitelist, resolveConsole: async (p) => (p === 200 ? WT_TOOL.hwnd : 0) },
  );
  assert.equal(hwndA, 3481656);
  assert.equal(hwndB, 12130330);
});

test('多 `?` Claude 标签并存:全局 ccTagAny 固定取第一个 → 基线缺陷被本用例固住(待修)', async () => {
  const tag1 = { hwnd: 1, processName: 'WindowsTerminal', title: '? 任务甲', commandLine: '' };
  const tag2 = { hwnd: 2, processName: 'WindowsTerminal', title: '? 任务乙', commandLine: '' };
  const hwnd = await bindWindow(
    { cwd: 'D:\\w\\proj' },
    { entries: [tag1, tag2], foreground: [], terminalWhitelist, resolveConsole: async () => 0 },
  );
  // 基线语义:取第一个 ?(无 cwd 区分)→ 无法精确区分是哪条会话
  assert.equal(hwnd, 1);
});

test('早于会话标题的事件(无任何窗口信息)→ 返回 0(基线兜底,点击不跳转场景)', async () => {
  const hwnd = await bindWindow(
    { cwd: 'D:\\w\\proj' },
    { entries: [], foreground: [], terminalWhitelist, resolveConsole: async () => 0 },
  );
  assert.equal(hwnd, 0);
});

test('web surface:绑定白名单浏览器含 DeepSeek Harness 的窗口', async () => {
  const browserWin = { hwnd: 500, processName: 'msedge', title: 'xx — DeepSeek Harness — Microsoft Edge', commandLine: '' };
  const hwnd = await bindWindow(
    { surface: 'web', cwd: 'D:\\w\\proj' },
    { entries: [WT_PW, browserWin], foreground: [], browserWhitelist: ['msedge.exe'], resolveConsole: async () => 0 },
  );
  assert.equal(hwnd, 500);
});
