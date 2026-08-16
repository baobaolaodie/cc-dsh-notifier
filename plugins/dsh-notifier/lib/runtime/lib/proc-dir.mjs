// 从进程命令行解析工作目录候选路径(Windows)
// 信号来源:WindowsTerminal -d "path" / Code 主进程第二参数 / cmd 等
import { normalizeCwd } from './events.mjs';

// 从命令行提取目录候选;无可靠信号返回 null
// 优先级:
//   1) -d / --directory / --dir / -w 参数后的路径(WindowsTerminal 实测格式)
//   2) Code.exe 主进程:第二参数为路径(无 --type 的子进程不在此列,由调用方过滤)
//   3) 形如 "C:\path\proj" 或 C:\path\proj 的独立参数(排除 exe 自身)
export function dirFromCommandLine(commandLine) {
  if (!commandLine || typeof commandLine !== 'string') return null;
  const cl = commandLine;
  // 规则 1:显式目录参数(WindowsTerminal -d / pwsh -WorkingDirectory 等)
  const dirMatch = cl.match(/(?:^|\s)(?:-d|--directory|--dir|-w|-WorkingDirectory)\s+"?([^"\s]+)"?/i);
  if (dirMatch && /[\\/]/.test(dirMatch[1])) return dirMatch[1];
  // 规则 2:Code 主进程样式 —— "exe" "path" (第二参数是路径)
  const argMatch = cl.match(/"[^"]+\.exe"\s+"([A-Za-z]:[\\/][^"]+)"/i)
    || cl.match(/(?:^|\s)([A-Za-z]:[\\/][^\s"']+)\s*$/);
  if (argMatch && /[\\/]/.test(argMatch[1])) return argMatch[1];
  return null;
}

// 目录匹配:进程命令行解析的目录与目标 cwd 归一化后比较
export function commandLineMatchesCwd(commandLine, cwd) {
  const dir = dirFromCommandLine(commandLine);
  if (!dir || !cwd) return false;
  return normalizeCwd(dir) === normalizeCwd(cwd);
}
