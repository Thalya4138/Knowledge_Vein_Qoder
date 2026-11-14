/**
 * 讲义 frontmatter：只支持扁平的 `key: value`。
 *
 * 讲义的元数据目前全是一层字符串（title / kb / section / kind / style / license / rendered），
 * 为它引入完整 YAML 解析器不划算。遇到嵌套、列表、多行值时不猜，记一条诊断并跳过该行。
 */
import type { Diagnostic } from './types';

export function parseFrontmatter(
  raw: string,
  firstLine: number,
): { data: Record<string, string>; diagnostics: Diagnostic[] } {
  const data: Record<string, string> = {};
  const diagnostics: Diagnostic[] = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    const value = m?.[2]?.trim() ?? '';
    if (!m || !value || /^\s/.test(line) || /^[[{|>-]/.test(value)) {
      diagnostics.push({
        severity: 'warning',
        code: 'frontmatter-unsupported',
        message: `frontmatter 只支持一层 key: value，已跳过：${line.trim()}`,
        line: firstLine + 1 + i,
      });
      return;
    }
    data[m[1]!] = unquote(value);
  });
  return { data, diagnostics };
}

function unquote(v: string): string {
  const q = v[0];
  if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) {
    const body = v.slice(1, v.lastIndexOf(q));
    return q === '"' ? body.replace(/\\(["\\])/g, '$1') : body.replace(/''/g, "'");
  }
  // 未加引号的值：` #` 之后是注释
  return v.replace(/\s+#.*$/, '');
}
