import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { knownBlocked, networkHint, PROVIDERS, providerOf } from '../ai/providers';
import { modelReady, usePrefs, useT, type Lang, type ModelConfig, type SettingsTab, type ThemePref } from './prefs';

/**
 * 设置：模型接入（BYOK）、存储与同步、外观与语言、账号。
 * 「测试连接」会真的向你填的服务发一次只读请求（列出可用模型，不产生对话费用），
 * 用来确认浏览器能否直连（跨域实测见 docs/SYNC_AND_API.md §4.1）。
 */

type T = (zh: string, en: string) => string;

const TABS: { id: SettingsTab; zh: string; en: string; icon: IconName }[] = [
  { id: 'model', zh: '模型', en: 'Model', icon: 'key' },
  { id: 'storage', zh: '存储与同步', en: 'Storage & sync', icon: 'folder' },
  { id: 'appearance', zh: '外观与语言', en: 'Appearance & language', icon: 'sun' },
  { id: 'account', zh: '账号', en: 'Account', icon: 'user' },
];

const TEST_TIMEOUT_MS = 15000;

/** 测试连接：列出这个 key 能用的模型（只读请求，不产生对话费用）。返回说明与模型 id 列表。 */
async function testConnection(m: ModelConfig, t: T, lang: Lang): Promise<{ text: string; ids: string[] }> {
  const base = m.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> =
    m.provider === 'anthropic'
      ? { 'x-api-key': m.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : { Authorization: `Bearer ${m.apiKey}` };
  let res: Response;
  try {
    // 有的服务从某些网络连过去会一直挂着不回，不设上限按钮就永远停在「正在测试…」
    res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError')
      return {
        text: t(
          `等了 ${TEST_TIMEOUT_MS / 1000} 秒服务都没有回应。多半是你的网络到这家服务不通（可以换个网络或开关代理再试），也可能是地址写错了。`,
          `No response after ${TEST_TIMEOUT_MS / 1000} seconds. Your network most likely cannot reach this service (try another network or toggle your proxy), or the URL is wrong.`,
        ),
        ids: [],
      };
    return { text: t('浏览器连不上这个地址。', 'The browser could not reach this address. ') + networkHint(m.baseUrl, lang), ids: [] };
  }
  if (res.status === 401 || res.status === 403)
    return { text: t(`服务拒绝了这个 key（HTTP ${res.status}）。连接本身是通的，请核对 key。`, `The service rejected this key (HTTP ${res.status}). The connection itself works — check the key.`), ids: [] };
  if (!res.ok)
    return { text: t(`连上了，但服务返回 HTTP ${res.status}。请核对接口地址（通常以 /v1 结尾）。`, `Connected, but the service returned HTTP ${res.status}. Check the base URL (it usually ends in /v1).`), ids: [] };
  const body = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const ids = (body?.data?.map((d) => d.id) ?? []).sort();
  if (!m.model)
    return { text: t(`连接成功：这个 key 可用，服务列出 ${ids.length} 个模型。在「模型名」里选一个，再保存。`, `Connected. This key works and the service lists ${ids.length} models — pick one under “Model”, then save.`), ids };
  const hit = ids.includes(m.model);
  return {
    text: hit
      ? t(`连接成功：这个 key 可用，你填的「${m.model}」在服务的模型列表里。`, `Connected. This key works, and “${m.model}” is on the service’s model list.`)
      : t(`连接成功，但服务列出的 ${ids.length} 个模型里没有「${m.model}」。可以在「模型名」里换一个。`, `Connected, but “${m.model}” is not among the ${ids.length} models the service lists. Pick another under “Model”.`),
    ids,
  };
}

export function SettingsDialog() {
  const p = usePrefs();
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<SettingsTab>(p.settingsTab);
  const [draft, setDraft] = useState<ModelConfig>(p.model);
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [remember, setRemember] = useState(p.modelRemembered);
  const [searchDraft, setSearchDraft] = useState(p.searchKey);
  const [searchRemember, setSearchRemember] = useState(p.searchRemembered);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);

  // 结果排在按钮下方，矮屏上可能落在可视区外：出了新结果就滚到能看见的位置（新版 Chrome 返回 Promise，别 return 它）
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [result]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.settingsOpen && !d.open) {
      setTab(p.settingsTab);
      setDraft(p.model);
      setRemember(p.modelRemembered);
      setSearchDraft(p.searchKey);
      setSearchRemember(p.searchRemembered);
      setSearchResult(null);
      setResult(null);
      d.showModal();
    }
    if (!p.settingsOpen && d.open) d.close();
  }, [p.settingsOpen, p.settingsTab, p.model, p.modelRemembered, p.searchKey, p.searchRemembered]);

  const field = (k: keyof ModelConfig, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    // 换了服务或 key，上一次列出的模型就不作数了
    if (k !== 'model') setModelIds([]);
  };
  const blocked = knownBlocked(draft.baseUrl);
  const current = providerOf(draft.baseUrl);

  return (
    <dialog ref={ref} className="settings" onClose={p.closeSettings} aria-label={t('设置', 'Settings')}>
      <nav className="settings-nav" aria-label={t('设置分类', 'Settings sections')}>
        <p className="settings-title">{t('设置', 'Settings')}</p>
        {TABS.map((x) => (
          <button key={x.id} type="button" aria-current={tab === x.id ? 'page' : undefined} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} />
            {t(x.zh, x.en)}
          </button>
        ))}
      </nav>

      <section className="settings-body">
        <button type="button" className="settings-close" onClick={p.closeSettings} aria-label={t('关闭设置', 'Close settings')}>
          <Icon name="close" />
        </button>

        {tab === 'model' && (
          <>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              p.setModel(draft, remember);
              // 测试连接列出过模型、而填的名字不在其中：多半一用就报错，保存时直接说
              const unknown = modelIds.length > 0 && !modelIds.includes(draft.model);
              setResult(
                (unknown
                  ? t(`注意：服务列出的模型里没有「${draft.model}」，用的时候多半会报错。建议从「模型名」的下拉里选一个再保存。`, `Note: “${draft.model}” is not among the models the service lists; requests will likely fail. Pick one from the Model list and save again.`) + ' '
                  : '') +
                (remember
                  ? t('已保存，并记在这台电脑的浏览器里。不用时点「清除已保存的 key」。', 'Saved and remembered in this browser. Use “Clear saved key” when you are done.')
                  : t('已保存。刷新页面不会丢，关掉这个标签页就清除。', 'Saved. It survives a reload and is cleared when you close this tab.')),
              );
            }}
          >
            <h2>{t('模型', 'Model')}</h2>
            <p className="settings-lede">
              {t(
                '用你自己的 key。浏览器直接把它发给你选的模型服务，不经过知脉或任何第三方服务器。默认只存在当前标签页，关掉就清除。',
                'Bring your own key. The browser sends it straight to the model service you choose — never through any server of ours. By default it lives only in this tab and is cleared when you close it.',
              )}
            </p>
            <div className="chips" role="group" aria-label={t('常用服务', 'Common providers')}>
              {PROVIDERS.map((x) => (
                <button
                  key={x.name}
                  type="button"
                  aria-pressed={current?.name === x.name}
                  onClick={() => {
                    setDraft((d) => ({ ...d, ...x.cfg }));
                    setModelIds([]);
                    setResult(null);
                  }}
                >
                  {x.name}
                </button>
              ))}
            </div>
            <p className="settings-hint">
              {current
                ? current.cors === 'ok'
                  ? t(`${current.name}：已实测，网页可以直接调用。`, `${current.name}: tested — callable directly from the browser.`)
                  : t(
                      `${current.name}：本站开发时所在网络连不上它，没能实测网页直连；需要你的网络能访问它。`,
                      `${current.name}: not tested (unreachable from our development network). Your network needs to reach it.`,
                    )
                : t(
                    'DeepSeek、通义千问、Kimi、硅基流动、OpenRouter 已实测网页可直连。其他 OpenAI 兼容服务也可以手填地址。',
                    'DeepSeek, Qwen, Kimi, SiliconFlow and OpenRouter are tested to work from the browser. Any other OpenAI-compatible service can be entered by hand.',
                  )}
            </p>
            <label>
              <span>{t('接口类型', 'API type')}</span>
              <select value={draft.provider} onChange={(e) => field('provider', e.target.value)}>
                <option value="openai-compatible">{t('OpenAI 兼容接口', 'OpenAI-compatible')}</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label>
              <span>{t('接口地址', 'Base URL')}</span>
              <input value={draft.baseUrl} onChange={(e) => field('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" inputMode="url" />
            </label>
            {blocked && (
              <p className="settings-warn" role="alert">
                {t(
                  `${blocked} 不允许网页直接调用（跨域限制，2026-11 实测）。请换一家服务。`,
                  `${blocked} does not allow calls from a web page (CORS, tested 2026-11). Please choose another provider.`,
                )}
              </p>
            )}
            <label>
              <span>{t('模型名', 'Model')}</span>
              <input
                value={draft.model}
                onChange={(e) => field('model', e.target.value)}
                placeholder={
                  modelIds.length
                    ? t('从列表里选，或直接输入', 'Pick from the list, or type one')
                    : t('不知道填什么？先填地址和 key，点「测试连接」', 'Not sure? Fill in the URL and key, then “Test connection”')
                }
                list="settings-model-ids"
              />
              <datalist id="settings-model-ids">
                {modelIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </label>
            <label>
              <span>API key</span>
              <input type="password" value={draft.apiKey} onChange={(e) => field('apiKey', e.target.value)} autoComplete="off" />
            </label>
            <label className="settings-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                {t('在这台电脑上记住', 'Remember on this computer')}
                <small>{t('关掉浏览器也不用重填。公用电脑上不要勾。', 'No need to re-enter after closing the browser. Don’t tick this on a shared computer.')}</small>
              </span>
            </label>
            <div className="settings-actions">
              {(p.model.apiKey || p.modelRemembered) && (
                <button
                  type="button"
                  className="btn quiet settings-forget"
                  onClick={() => {
                    p.forgetModel();
                    setDraft((d) => ({ ...d, apiKey: '' }));
                    setRemember(false);
                    setModelIds([]);
                    setResult(t('已清除这台电脑和这个标签页里保存的 key。', 'Cleared the key saved in this browser and tab.'));
                  }}
                >
                  {t('清除已保存的 key', 'Clear saved key')}
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={!draft.baseUrl || !draft.apiKey || testing}
                onClick={async () => {
                  setTesting(true);
                  const r = await testConnection(draft, t, p.lang);
                  setResult(r.text);
                  setModelIds(r.ids);
                  setTesting(false);
                }}
              >
                {testing ? t('正在测试…', 'Testing…') : t('测试连接', 'Test connection')}
              </button>
              <button type="submit" className="btn primary" disabled={!modelReady(draft)}>
                {t('保存', 'Save')}
              </button>
            </div>
            {draft.baseUrl && draft.apiKey && !draft.model && (
              <p className="settings-hint">
                {t('还差模型名才能保存。不知道填什么，先点「测试连接」，再从列表里选一个。', 'A model name is needed before saving. Not sure which? Run “Test connection” and pick one from the list.')}
              </p>
            )}
            {result && (
              <p className="settings-result" role="status" ref={resultRef}>
                {result}
              </p>
            )}
            <p className="settings-note">
              {t(
                '每个功能用自己的提示词与输出要求（工作台问答、碎片串联、学科元思考、图谱编辑……），清单见仓库 ',
                'Each feature has its own prompt and output contract (desk Q&A, fragment linking, subject meta-thinking, map editing…); the list is in ',
              )}
              <code>prompts/registry.json</code>
              {t(
                '。工作区里放同名文件即可覆盖，接入 GitHub 后随仓库版本管理。',
                '. Put a file with the same name in your workspace to override it. Model output follows the prompts, which are written in Chinese.',
              )}
            </p>
          </form>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              p.setSearchKey(searchDraft.trim(), searchRemember);
              setSearchResult(
                searchRemember
                  ? t('已保存，并记在这台电脑的浏览器里。不用时点「清除已保存的搜索 key」。', 'Saved and remembered in this browser. Use “Clear saved search key” when you are done.')
                  : t('已保存。刷新页面不会丢，关掉这个标签页就清除。', 'Saved. It survives a reload and is cleared when you close this tab.'),
              );
            }}
          >
            <h2>{t('联网搜索（可选）', 'Web search (optional)')}</h2>
            <p className="settings-lede">
              {t(
                '填博查搜索 key 后，工作台「找资源」会实时联网检索，候选如实标注「待核对」。不填则降级为模型提案候选或预置样例。key 由浏览器直接发给博查，默认只存在当前标签页。',
                'With a Bocha search key, “Find resources” on the desk searches the live web and marks candidates “unverified”. Without one, it falls back to model-proposed candidates or presets. The key goes straight from your browser to Bocha and lives only in this tab by default.',
              )}
            </p>
            <label>
              <span>{t('博查 API key', 'Bocha API key')}</span>
              <input type="password" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} autoComplete="off" placeholder="sk-…" />
            </label>
            <label className="settings-check">
              <input type="checkbox" checked={searchRemember} onChange={(e) => setSearchRemember(e.target.checked)} />
              <span>
                {t('在这台电脑上记住', 'Remember on this computer')}
                <small>{t('关掉浏览器也不用重填。公用电脑上不要勾。', 'No need to re-enter after closing the browser. Don’t tick this on a shared computer.')}</small>
              </span>
            </label>
            <div className="settings-actions">
              {(p.searchKey || p.searchRemembered) && (
                <button
                  type="button"
                  className="btn quiet settings-forget"
                  onClick={() => {
                    p.forgetSearchKey();
                    setSearchDraft('');
                    setSearchRemember(false);
                    setSearchResult(t('已清除这台电脑和这个标签页里保存的搜索 key。', 'Cleared the search key saved in this browser and tab.'));
                  }}
                >
                  {t('清除已保存的搜索 key', 'Clear saved search key')}
                </button>
              )}
              <button type="submit" className="btn primary" disabled={!searchDraft.trim()}>
                {t('保存', 'Save')}
              </button>
            </div>
            {searchResult && (
              <p className="settings-result" role="status">
                {searchResult}
              </p>
            )}
            <p className="settings-hint">
              {t('博查：2026-11 实测网页可直连。key 在 open.bochaai.com 获取。', 'Bocha: tested 2026-11, callable directly from the browser. Get a key at open.bochaai.com.')}
            </p>
          </form>
          </>
        )}

        {tab === 'storage' && (
          <div className="settings-form">
            <h2>{t('存储与同步', 'Storage & sync')}</h2>
            <dl className="settings-list">
              <div>
                <dt>
                  <Icon name="computer" />
                  {t('本地文件夹', 'Local folder')}
                </dt>
                <dd>
                  {'showDirectoryPicker' in window
                    ? t(
                        '可用。在学习工作台左栏点「打开本地文件夹」，读写都直接发生在你的文件夹里。',
                        'Available. In Study Desk, choose “Open local folder” in the left rail; reads and writes happen directly in your folder.',
                      )
                    : t(
                        '当前浏览器不支持直接读写文件夹（需要 Chrome 或 Edge）；可以在工作台左栏用「导入文件夹」把文件复制进浏览器。',
                        'This browser cannot read and write folders directly (Chrome or Edge can). Use “Import folder” in Study Desk to copy files into the browser instead.',
                      )}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="github" />
                  {t('GitHub 仓库', 'GitHub repository')}
                </dt>
                <dd>
                  {t(
                    '可用。工作区栏点「从 GitHub 导入」，把仓库复制成工作区、长期保存在这台电脑的浏览器里（公开仓库不需要令牌）；之后在文件栏点「同步 GitHub」拉取更新或推回去，两边都改过的文件逐个选。令牌默认只存在当前标签页，可选记住。',
                    'Available. Choose “Import from GitHub” in the workspace rail to copy a repository into a workspace kept in this browser (public repositories need no token); later use “Sync with GitHub” in the file column to pull or push, resolving files changed on both sides one by one. The token stays in this tab unless you choose to remember it.',
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="folder" />
                  {t('浏览器内', 'In this browser')}
                </dt>
                <dd>
                  {t(
                    '示例工作区只读。你在示例讲义上的改动、图谱的编辑与记忆练习，暂存在这台电脑的浏览器里。',
                    'The sample workspace is read-only. Your edits to the sample notes, map edits and memory practice are kept in this computer’s browser.',
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="settings-form">
            <h2>{t('外观与语言', 'Appearance & language')}</h2>
            <fieldset className="radio-row">
              <legend>{t('主题', 'Theme')}</legend>
              {(
                [
                  ['light', t('白天', 'Light')],
                  ['dark', t('夜间', 'Dark')],
                  ['system', t('跟随系统', 'System')],
                ] as [ThemePref, string][]
              ).map(([v, label]) => (
                <label key={v}>
                  <input type="radio" name="theme" checked={p.theme === v} onChange={() => p.setTheme(v)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset className="radio-row">
              <legend>{t('界面语言', 'Interface language')}</legend>
              <label>
                <input type="radio" name="lang" checked={p.lang === 'zh'} onChange={() => p.setLang('zh')} />
                中文
              </label>
              <label>
                <input type="radio" name="lang" checked={p.lang === 'en'} onChange={() => p.setLang('en')} />
                English
              </label>
            </fieldset>
            <p className="settings-note">
              {t(
                '英文模式翻译页眉、封面、设置、入门文档与四个板块的入口；示例讲义正文、导图编辑器与阅读器内部仍为中文。',
                'English mode covers the header, cover, settings, guide and the entry screens of the four spaces. The sample course content, the mind-map editor and the reader’s internals remain in Chinese.',
              )}
            </p>
          </div>
        )}

        {tab === 'account' && (
          <div className="settings-form">
            <h2>{t('账号', 'Account')}</h2>
            <p className="settings-lede">
              {t(
                '知脉没有自己的账号系统，也没有服务器保存你的数据。你的工作区只在三个地方：这台电脑的浏览器、你选的本地文件夹、你自己的 GitHub 仓库。',
                'Vein has no accounts and no server that stores your data. Your workspace lives in exactly three places: this browser, a local folder you choose, and your own GitHub repository.',
              )}
            </p>
            <p className="settings-lede">
              {t(
                '需要跨设备同步时，连接 GitHub 仓库即可；GitHub 账号就是你的账号。',
                'To sync across devices, connect a GitHub repository — your GitHub account is your account.',
              )}
            </p>
          </div>
        )}
      </section>
    </dialog>
  );
}
