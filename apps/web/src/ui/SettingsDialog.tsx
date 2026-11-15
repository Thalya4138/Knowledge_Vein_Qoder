import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { modelReady, usePrefs, type ModelConfig, type SettingsTab, type ThemePref } from './prefs';

/**
 * 设置：模型接入（BYOK）、存储与同步、外观与语言、账号。
 * 「测试连接」会真的向你填的服务发一次只读请求（列出可用模型，不产生对话费用），
 * 用来确认浏览器能否直连（跨域限制见 docs/SYNC_AND_API.md §4）。
 */

const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'model', label: '模型', icon: 'key' },
  { id: 'storage', label: '存储与同步', icon: 'folder' },
  { id: 'appearance', label: '外观与语言', icon: 'sun' },
  { id: 'account', label: '账号', icon: 'user' },
];

const PRESETS: { name: string; cfg: Partial<ModelConfig> }[] = [
  { name: 'DeepSeek', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' } },
  { name: '通义千问', cfg: { provider: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' } },
  { name: 'OpenAI', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: '' } },
  { name: 'Anthropic', cfg: { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: '' } },
];

async function testConnection(m: ModelConfig): Promise<string> {
  const base = m.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> =
    m.provider === 'anthropic'
      ? { 'x-api-key': m.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : { Authorization: `Bearer ${m.apiKey}` };
  let res: Response;
  try {
    res = await fetch(`${base}/models`, { headers });
  } catch {
    return '浏览器连不上这个地址：可能是该服务不允许网页直接调用（跨域限制），也可能是网络或地址有误。';
  }
  if (res.status === 401 || res.status === 403) return `服务拒绝了这个 key（HTTP ${res.status}）。`;
  if (!res.ok) return `连上了，但服务返回 HTTP ${res.status}。`;
  const body = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const ids = body?.data?.map((d) => d.id) ?? [];
  const hit = m.model && ids.includes(m.model) ? `，其中有你填的「${m.model}」` : '';
  return `连接成功：这个 key 可用，服务列出 ${ids.length} 个模型${hit}。`;
}

export function SettingsDialog() {
  const p = usePrefs();
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<SettingsTab>(p.settingsTab);
  const [draft, setDraft] = useState<ModelConfig>(p.model);
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.settingsOpen && !d.open) {
      setTab(p.settingsTab);
      setDraft(p.model);
      setResult(null);
      d.showModal();
    }
    if (!p.settingsOpen && d.open) d.close();
  }, [p.settingsOpen, p.settingsTab, p.model]);

  const field = (k: keyof ModelConfig, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <dialog ref={ref} className="settings" onClose={p.closeSettings} aria-label="设置">
      <nav className="settings-nav" aria-label="设置分类">
        <p className="settings-title">设置</p>
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      <section className="settings-body">
        <button type="button" className="settings-close" onClick={p.closeSettings} aria-label="关闭设置">
          <Icon name="close" />
        </button>

        {tab === 'model' && (
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              p.setModel(draft);
              setResult('已保存。只存在本页内存里，刷新页面就会清除。');
            }}
          >
            <h2>模型</h2>
            <p className="settings-lede">用你自己的 key。key 只存在本页内存里，不写进浏览器存储，也不经过任何第三方服务器。</p>
            <div className="chips" role="group" aria-label="常用服务">
              {PRESETS.map((x) => (
                <button key={x.name} type="button" onClick={() => setDraft((d) => ({ ...d, ...x.cfg }))}>
                  {x.name}
                </button>
              ))}
            </div>
            <label>
              <span>接口类型</span>
              <select value={draft.provider} onChange={(e) => field('provider', e.target.value)}>
                <option value="openai-compatible">OpenAI 兼容接口</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label>
              <span>接口地址</span>
              <input value={draft.baseUrl} onChange={(e) => field('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" inputMode="url" />
            </label>
            <label>
              <span>模型名</span>
              <input value={draft.model} onChange={(e) => field('model', e.target.value)} placeholder="例如 deepseek-chat" />
            </label>
            <label>
              <span>API key</span>
              <input type="password" value={draft.apiKey} onChange={(e) => field('apiKey', e.target.value)} autoComplete="off" />
            </label>
            <div className="settings-actions">
              <button
                type="button"
                className="btn"
                disabled={!modelReady(draft) || testing}
                onClick={async () => {
                  setTesting(true);
                  setResult(await testConnection(draft));
                  setTesting(false);
                }}
              >
                {testing ? '正在测试…' : '测试连接'}
              </button>
              <button type="submit" className="btn primary" disabled={!modelReady(draft)}>
                保存
              </button>
            </div>
            {result && (
              <p className="settings-result" role="status">
                {result}
              </p>
            )}
            <p className="settings-note">
              每个功能用自己的提示词与输出要求（工作台问答、碎片串联、学科元思考、图谱编辑……），清单见仓库 <code>prompts/registry.json</code>。
              工作区里放同名文件即可覆盖，接入 GitHub 后随仓库版本管理。
            </p>
          </form>
        )}

        {tab === 'storage' && (
          <div className="settings-form">
            <h2>存储与同步</h2>
            <dl className="settings-list">
              <div>
                <dt>
                  <Icon name="computer" />
                  本地文件夹
                </dt>
                <dd>
                  {'showDirectoryPicker' in window
                    ? '可用。在学习工作台左栏点「打开本地文件夹」，读写都直接发生在你的文件夹里。'
                    : '当前浏览器不支持直接读写文件夹（需要 Chrome 或 Edge）；可以改用导入与导出。'}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="github" />
                  GitHub 仓库
                </dt>
                <dd>下一版接入：填一个只授权单个仓库的令牌，拉取与推送整个工作区。令牌只存在内存里。</dd>
              </div>
              <div>
                <dt>
                  <Icon name="folder" />
                  浏览器内
                </dt>
                <dd>示例工作区只读。你在示例讲义上的改动、图谱的编辑与记忆练习，暂存在这台电脑的浏览器里。</dd>
              </div>
            </dl>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="settings-form">
            <h2>外观与语言</h2>
            <fieldset className="radio-row">
              <legend>主题</legend>
              {(
                [
                  ['light', '白天'],
                  ['dark', '夜间'],
                  ['system', '跟随系统'],
                ] as [ThemePref, string][]
              ).map(([v, label]) => (
                <label key={v}>
                  <input type="radio" name="theme" checked={p.theme === v} onChange={() => p.setTheme(v)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset className="radio-row">
              <legend>界面语言</legend>
              <label>
                <input type="radio" name="lang" defaultChecked />
                中文
              </label>
              <label className="disabled">
                <input type="radio" name="lang" disabled />
                English（下一版）
              </label>
            </fieldset>
          </div>
        )}

        {tab === 'account' && (
          <div className="settings-form">
            <h2>账号</h2>
            <p className="settings-lede">知脉没有自己的账号系统，也没有服务器保存你的数据。你的工作区只在三个地方：这台电脑的浏览器、你选的本地文件夹、你自己的 GitHub 仓库。</p>
            <p className="settings-lede">需要跨设备同步时，连接 GitHub 仓库即可；GitHub 账号就是你的账号。</p>
          </div>
        )}
      </section>
    </dialog>
  );
}
