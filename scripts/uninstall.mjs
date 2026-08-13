#!/usr/bin/env node
// 卸载:移除注入的 hooks 条目;存在备份则恢复备份;清理 AUMID 注册表项
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const BACKUP = SETTINGS + '.cc-notifier.bak';
const AUMID = 'HKCU\\Software\\Classes\\AppUserModelId\\cc-notifier';

// reg.exe 错误信息按系统代码页输出(中文 Windows 为 GBK),Node 默认按 UTF-8 解码会乱码,
// 先按 UTF-8 严格解码(英文错误信息),失败再按 GBK 兜底(中文错误信息)
function decodeRegStderr(buf) {
  if (!buf || buf.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return String(buf);
    }
  }
}

// AUMID 清理:区分「键不存在」(无需清理)与「删除失败」(提示失败原因)
function unregisterAumid() {
  try {
    // 显式 stdio: 'pipe' 以捕获 stderr 供分类判断(默认 options 下子进程 stderr 会同时泄漏到控制台)
    execFileSync('reg', ['delete', AUMID, '/f'], { stdio: 'pipe' });
    console.log('AUMID 已清理:', AUMID);
  } catch (err) {
    // reg delete 对不存在的键返回退出码 1 并在 stderr 提示「找不到」,据此区分两种失败
    const stderr = decodeRegStderr(err.stderr);
    const keyMissing =
      err.status === 1 && /(unable to find|does not exist|cannot find|找不到|不存在)/i.test(stderr);
    if (keyMissing) {
      console.log('AUMID 无需清理(键不存在):', AUMID);
    } else {
      console.warn('AUMID 清理失败(不影响 Claude Code 会话;如需禁用 Toast 可手动清理):', AUMID);
      console.warn(`  原因:${err.status ? ` 退出码 ${err.status}` : ' 启动失败'}${stderr ? `(${stderr})` : ''}`);
    }
  }
}

function main() {
  if (!fs.existsSync(SETTINGS)) {
    console.log('settings.json 不存在,无需卸载');
    unregisterAumid();
    return;
  }
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch (err) {
    // settings.json 损坏:有备份则直接恢复备份(原实现直接 exit(1),备份恢复路径不可达);
    // 无备份则给出手动恢复指引后退出
    if (fs.existsSync(BACKUP)) {
      fs.copyFileSync(BACKUP, SETTINGS);
      console.warn('settings.json 解析失败,已从备份恢复:', err.message);
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
      } catch (err2) {
        console.error('备份文件同样损坏,请手动修复 settings.json:', SETTINGS);
        console.error('  错误详情:', err2.message);
        process.exit(1);
      }
    } else {
      console.error('settings.json 解析失败且无备份,请手动恢复后重试:', SETTINGS);
      console.error('  错误详情:', err.message);
      console.error('  可先用文本编辑器修复 JSON 语法,或从其他备份恢复后再运行卸载。');
      process.exit(1);
    }
  }
  if (settings.hooks) {
    for (const key of Object.keys(settings.hooks)) {
      const before = settings.hooks[key].length;
      settings.hooks[key] = settings.hooks[key].filter((entry) =>
        !(entry && entry.hooks && entry.hooks.some((h) => h.command && h.command.includes('notify-agent.mjs'))));
      if (settings.hooks[key].length !== before) console.log(`移除注入: ${key}`);
    }
    for (const key of Object.keys(settings.hooks)) {
      if (settings.hooks[key].length === 0) delete settings.hooks[key];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (fs.existsSync(BACKUP)) {
    fs.copyFileSync(BACKUP, SETTINGS); // 恢复备份(安装时的原配置)
    console.log('已从备份恢复 settings.json');
  } else {
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    console.log('已移除注入的 hooks 条目');
  }

  unregisterAumid();

  console.log('卸载完成。daemon 将在会话空 + 60s 后自动退出;如需立即停止,关闭全部 Claude Code 会话即可。');
}

main();
