import { Link } from 'react-router-dom';
import { PROVIDERS } from '../ai/providers';
import { usePrefs, useT } from '../ui/prefs';
import { useTour } from './tour/Tour';
import '../styles/guide.css';

/**
 * 入门文档：左侧目录，右侧正文。
 * 只写已经能用的东西；示例模式与真实能力的边界、尚未提供的功能都写清楚（AGENTS.md：规划不等于已完成）。
 * 模型清单直接读 ai/providers.ts 的实测结论，不在这里另抄一份。
 */

const WS = '?ws=linear-algebra';

export function GuidePage() {
  const t = useT();
  const { lang } = usePrefs();
  const en = lang === 'en';
  const tour = useTour();

  const toc: [string, string][] = [
    ['start', t('三分钟上手', 'Three-minute start')],
    ['spaces', t('四个工作空间', 'The four spaces')],
    ['links', t('四个工作空间的关联', 'How the spaces connect')],
    ['sample', t('示例模式与真实能力', 'Sample mode vs. real features')],
    ['model', t('接入你自己的模型', 'Connect your own model')],
    ['data', t('你的数据在哪里', 'Where your data lives')],
    ['lang', t('English 界面', 'English interface')],
    ['keys', t('快捷键', 'Shortcuts')],
    ['faq', t('常见问题', 'FAQ')],
  ];

  return (
    <div className="guide">
      <nav className="guide-toc" aria-label={t('目录', 'Contents')}>
        <p className="guide-toc-title">{t('入门', 'Guide')}</p>
        <ol>
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="guide-body">
        <header className="guide-hero">
          <p className="guide-overline">{t('知脉 · 入门文档', 'Vein · Field guide')}</p>
          <h1 className="display">{t('从一节讲义开始', 'Start from one lesson')}</h1>
          <p className="guide-lede">
            {t(
              '知脉把一门课的资料整理成能读的讲义，再把讲义里的知识连成一张每条线都有理由的网。下面用内置的示例课程「线性代数：从线性方程组到最小二乘」带你走一遍。',
              'Vein turns a course’s materials into lecture notes you can read, then links the knowledge in them into a web where every line has a reason. The walkthrough below uses the built-in sample course, “Linear Algebra: from linear systems to least squares” (written in Chinese).',
            )}
          </p>
          <p className="guide-tour">
            <button type="button" className="btn primary" onClick={() => tour.start(0)}>
              {t('跟着导览走一遍', 'Take the guided tour')}
            </button>
            <span>
              {t(
                '约五分钟，按封面 → 学习工作台 → 可视化实验室 → 关联探索 → 认知记忆图谱的顺序，在真实页面上逐项指给你看。',
                'About five minutes: cover → Study Desk → Visual Lab → Connection Explorer → Memory Atlas, pointing things out on the real pages.',
              )}
            </span>
          </p>
        </header>

        <section id="start">
          <h2>{t('三分钟上手', 'Three-minute start')}</h2>
          <ol className="guide-steps">
            <li>
              <strong>{t('读一节讲义。', 'Read a lesson. ')}</strong>
              {t('打开', 'Open ')}
              <Link to={`/workspace${WS}&file=note-2-1`}>{t('学习工作台', 'Study Desk')}</Link>
              {t(
                '：左栏是工作区，中栏是文件，右边是讲义。正文在主栏，旁栏是「相关信息」和资源卡；资源卡指向原视频的具体时刻、原文档的具体页。',
                ': workspaces on the left, files in the middle, the lesson on the right. Side notes and resource cards sit in the margin, each pointing to an exact moment in a video or page in a document.',
              )}
            </li>
            <li>
              <strong>{t('问一个问题。', 'Ask a question. ')}</strong>
              {t(
                '点底部的对话框，选「法方程是怎么推出来的？」，再点回答里的出处：讲义会跳到那一段并高亮。',
                'Click the box at the bottom, pick the prepared question about the normal equations, then click a citation in the answer: the lesson scrolls to that passage and highlights it.',
              )}
            </li>
            <li>
              <strong>{t('从讲义跳到导图。', 'Jump to the map. ')}</strong>
              {t(
                '讲某个知识点的小节，标题旁有「在导图里看」。点它，认知记忆图谱会打开并选中同一个知识点。',
                'Sections that teach a concept have “See in map” beside the heading. Click it and the Memory Atlas opens with that concept selected.',
              )}
            </li>
            <li>
              <strong>{t('看一条有理由的关联。', 'See a relation with a reason. ')}</strong>
              {t('到', 'In ')}
              <Link to={`/connection${WS}`}>{t('关联探索', 'Connection Explorer')}</Link>
              {t(
                '，点示例问题「最小二乘、点到平面的距离、异面直线的距离，是同一个问题吗？」。右边的关联图里点一条线，能看到它为什么成立、在什么条件下成立；点「收进图谱」，它才写进这个工作区的知识图谱。',
                ', open the sample question about least squares and two distance problems. Click a line in the graph on the right to see why it holds and under what conditions; only when you press 收进图谱 (add to graph) is it written to this workspace’s knowledge graph.',
              )}
            </li>
            <li>
              <strong>{t('考考自己。', 'Test yourself. ')}</strong>
              {t('到', 'Open the ')}
              <Link to={`/atlas${WS}&map=memory`}>{t('个人记忆图谱', 'memory map')}</Link>
              {t('，点「挖空」，填完按 ', ', choose Blank, fill in the leaves, then press ')}
              <kbd>O</kbd>
              {t(' 对照原文。', ' to compare with the original.')}
            </li>
          </ol>
        </section>

        <section id="spaces">
          <h2>{t('四个工作空间', 'The four spaces')}</h2>
          <dl className="guide-dl">
            <div data-space="workspace">
              <dt>{t('学习工作台', 'Study Desk')}</dt>
              <dd>
                {t(
                  '一门课一个工作区，工作区就是一个文件夹。按教科书版式读讲义；点「编辑」一段一段直接改；选中文字可以高亮、批注，批注单独存放、不改原文。讲义兼容 Obsidian 的写法（callout、双链、高亮）。',
                  'One workspace per course, and a workspace is just a folder. Read notes laid out like a textbook; press Edit to change one paragraph at a time; select text to highlight or annotate — annotations are stored separately and never alter the source. Notes accept Obsidian syntax (callouts, wiki links, highlights).',
                )}
              </dd>
              <Link className="guide-open" to={`/workspace${WS}`}>{t('打开学习工作台', 'Open Study Desk')} →</Link>
            </div>
            <div data-space="lab">
              <dt>{t('可视化实验室', 'Visual Lab')}</dt>
              <dd>
                {t(
                  '用一句话说出想看懂的东西，接入模型后现场生成一张能拖动、能播放的实验页，在隔离的沙箱里运行（读不到你的 key 和工作区）；跑不起来会自动修一次，仍不行就照实显示错误。可以指定工具：GeoGebra、JSXGraph、Plotly、D3、Three.js、Matter.js、3Dmol、Matplotlib（浏览器里跑真正的 Python）直接在网页里运行；PhET 从官方模拟里挑一个嵌入；Manim、MATLAB、PyTorch 这类只能在自己电脑上跑的，给可以直接运行的代码；Desmos、BioDigital 这类要第三方授权的，换成能用的工具并写明原因。不接模型时，正交投影、光合作用、二次曲面三张示例页照样可用。实验页可以挂到导图的某个主题上。',
                  'Say in one sentence what you want to understand; with a model connected, an interactive page is generated on the spot and runs in an isolated sandbox (it cannot read your key or workspace). If it fails to run it is repaired once automatically, otherwise the error is shown as is. Pick a tool: GeoGebra, JSXGraph, Plotly, D3, Three.js, Matter.js, 3Dmol and Matplotlib (real Python in the browser) run right in the page; PhET embeds one of the official simulations; Manim, MATLAB, PyTorch and other local-only tools get ready-to-run code; Desmos, BioDigital and others that need third-party access are swapped for a tool that works, with the reason stated. Without a model, the three sample pages still work. A lab page can be attached to a topic in the mind map.',
                )}
              </dd>
              <Link className="guide-open" to={`/lab${WS}`}>{t('打开可视化实验室', 'Open Visual Lab')} →</Link>
            </div>
            <div data-space="connection">
              <dt>{t('知识关联探索', 'Connection Explorer')}</dt>
              <dd>
                {t(
                  '三种任务，各有写法：碎片串联（自下而上找零散知识的共同结构）、学科元思考（从整体结构重新组织一门课）、跨学科并联（两个领域之间的双向映射，每条联系标明性质）。回答旁有一张可编辑的关联图；回答可以导出为 Markdown、Word、PPT、PDF 或图片，也可以存进工作区、接到讲义末尾、加入思维导图。',
                  'Three tasks, each written its own way: linking fragments (bottom-up, finding the structure scattered pieces share), subject meta-thinking (reorganizing a whole course by its structure), and crossing disciplines (a two-way mapping between fields, with every link labelled for what it is). Each answer comes with an editable relation graph, and can be exported as Markdown, Word, PPT, PDF or an image, saved to the workspace, appended to a lesson, or added to the mind map.',
                )}
              </dd>
              <Link className="guide-open" to={`/connection${WS}`}>{t('打开关联探索', 'Open Connection Explorer')} →</Link>
            </div>
            <div data-space="atlas">
              <dt>{t('认知记忆图谱', 'Memory Atlas')}</dt>
              <dd>
                {t(
                  '两种图。思维导图用 Tab、Enter 编辑，公式用 LaTeX，自动保存到工作区的 maps/mind.json，可导出 Markdown；接入模型后可以按讲义生成或更新导图，改动先给你看差异再应用。个人记忆图谱从同一张导图出发，可以收起、遮盖、挖空自测，也可以切到「自由摆放」，把节点摆成你记忆里的样子——这张图的布局 AI 永远不会自动重排。',
                  'Two maps. The mind map is edited with Tab and Enter, takes LaTeX formulas, saves to the workspace’s maps/mind.json and exports to Markdown; with a model connected it can be generated or updated from your notes, showing you the diff before applying. The memory map starts from the same mind map: fold, cover or blank it out to test yourself, or switch to free placement and arrange nodes the way you remember them — AI never rearranges this map.',
                )}
              </dd>
              <Link className="guide-open" to={`/atlas${WS}`}>{t('打开认知记忆图谱', 'Open Memory Atlas')} →</Link>
            </div>
          </dl>
        </section>

        <section id="links">
          <h2>{t('四个工作空间的关联', 'How the spaces connect')}</h2>
          <p>
            {t(
              '四个板块用的是同一个工作区、同一套知识点，所以可以带着「正在看的东西」在它们之间来回跳：',
              'All four spaces share one workspace and one set of concepts, so you can carry what you are looking at from one to another:',
            )}
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">{t('在哪里', 'From')}</th>
                <th scope="col">{t('点什么', 'Click')}</th>
                <th scope="col">{t('去哪里', 'Goes to')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('讲义小节标题旁', 'Beside a lesson heading')}</td>
                <td>{t('在导图里看', 'See in map')}</td>
                <td>{t('思维导图，选中同一个知识点', 'The mind map, same concept selected')}</td>
              </tr>
              <tr>
                <td>{t('导图主题详情', 'Mind-map topic details')}</td>
                <td>{t('打开讲义对应处', 'Open in the notes')}</td>
                <td>{t('讲义里讲它的那一段', 'The passage that teaches it')}</td>
              </tr>
              <tr>
                <td>{t('导图主题详情', 'Mind-map topic details')}</td>
                <td>{t('拿去关联探索', 'Explore connections')}</td>
                <td>{t('关联探索，带着它和相连的知识点', 'Connection Explorer, with it and its linked concepts')}</td>
              </tr>
              <tr>
                <td>{t('挂了实验的导图主题', 'A topic with a lab attached')}</td>
                <td>{t('去可视化', 'Visualize')}</td>
                <td>{t('那张实验页；页面上的主题名可以点回导图', 'That lab page; the topic name there links back')}</td>
              </tr>
              <tr>
                <td>{t('实验页脚注', 'Lab page footer')}</td>
                <td>{t('挂到主题上', 'Attach to a topic')}</td>
                <td>{t('导图主题（先预览，可撤销）', 'A mind-map topic (previewed, undoable)')}</td>
              </tr>
              <tr>
                <td>{t('关联图', 'Relation graph')}</td>
                <td>{t('收进图谱 / 加入思维导图', 'Add to graph / Add to mind map')}</td>
                <td>{t('工作区的知识图谱（可撤回）/ 思维导图（一步可撤回）', 'The workspace graph (can be withdrawn) / the mind map (one-step undo)')}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="sample">
          <h2>{t('示例模式与真实能力', 'Sample mode vs. real features')}</h2>
          <p>
            {t(
              '没有接入模型时，生成类功能只回答预置的问题，界面上标着「示例」：这些答案是离线整理、人工核对过的，不是现场生成。不需要模型的功能都是真的：',
              'Without a model, generative features answer only prepared questions, marked “Sample” on screen: those answers were prepared offline and checked by hand, not generated live. Everything that does not need a model is real:',
            )}
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">{t('不需要模型，真实可用', 'Real, no model needed')}</th>
                <th scope="col">{t('没有模型时只给示例', 'Sample-only without a model')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('阅读、编辑、批注讲义；打开本地文件夹并保存', 'Reading, editing and annotating notes; opening and saving a local folder')}</td>
                <td>{t('工作台问答、整理资料', 'Study Desk Q&A and tidying materials')}</td>
              </tr>
              <tr>
                <td>{t('出处定位与高亮；四个板块之间的跳转', 'Jumping to cited passages; moving between the four spaces')}</td>
                <td>{t('关联探索的回答', 'Connection Explorer answers')}</td>
              </tr>
              <tr>
                <td>{t('三张示例实验页的全部交互', 'Full interaction in the three sample lab pages')}</td>
                <td>{t('按新问题生成实验页', 'Generating a lab page for a new question')}</td>
              </tr>
              <tr>
                <td>{t('思维导图编辑、记忆图谱自测、关系收进图谱与撤回', 'Mind-map editing, memory self-tests, adding relations to the graph and withdrawing them')}</td>
                <td>{t('按讲义生成或更新导图、让 AI 改导图', 'Generating or updating the map from notes; asking AI to edit it')}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="model">
          <h2>{t('接入你自己的模型', 'Connect your own model')}</h2>
          <p>
            {t(
              '点页眉右上角的齿轮，在「模型」里选一家服务，填 API key，点「测试连接」：测通后会列出这个 key 能用的模型供挑选。知脉没有服务器，网页直接从你的浏览器调用模型服务，所以服务必须允许浏览器跨域访问。下表是 2026-11-26 实测的结果：',
              'Click the gear at the top right, choose a service under Model, enter your API key and press Test connection: once it works, the models your key can use are listed to pick from. Vein has no server — the page calls the model service straight from your browser — so the service must allow cross-origin browser requests. Tested on 2026-11-26:',
            )}
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">{t('服务', 'Service')}</th>
                <th scope="col">{t('浏览器直连', 'Direct from browser')}</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p) => (
                <tr key={p.name}>
                  <td>{en && p.name === '通义千问' ? 'Qwen (DashScope)' : en && p.name === '硅基流动' ? 'SiliconFlow' : p.name}</td>
                  <td>{p.cors === 'ok' ? t('可以', 'Works') : t('未实测', 'Not tested')}</td>
                </tr>
              ))}
              <tr>
                <td>{t('智谱 GLM', 'Zhipu GLM')}</td>
                <td>{t('被拦（服务端不允许跨域），填了会当场提示', 'Blocked by the service (no CORS); the settings warn you')}</td>
              </tr>
            </tbody>
          </table>
          <p>
            {t(
              'key 只存在本页内存里，刷新即清除，不写进浏览器存储、不进地址栏，也不经过任何第三方服务器。',
              'The key lives only in this page’s memory and is cleared on refresh. It is never written to browser storage or the address bar, and never passes through any third-party server.',
            )}
          </p>
        </section>

        <section id="data">
          <h2>{t('你的数据在哪里', 'Where your data lives')}</h2>
          <p>
            {t(
              '知脉没有服务器，也没有账号系统。工作区就是一个普通文件夹，讲义是 Markdown，导图与练习记录在 maps/，对话历史与批注在 .vein/。它只存在两个地方：',
              'Vein has no server and no accounts. A workspace is an ordinary folder: notes are Markdown, maps and practice records sit in maps/, conversation history and annotations in .vein/. It lives in one of two places:',
            )}
          </p>
          <ul className="guide-list">
            <li>
              <strong>{t('你电脑上的文件夹', 'A folder on your computer')}</strong>
              {t(
                '（Chrome / Edge）：工作台左栏「打开本地文件夹」，读写直接发生在文件夹里，可以同时用 Obsidian、VS Code、git 打开它。',
                ' (Chrome / Edge): “Open local folder” in the Study Desk rail. Reads and writes happen in the folder itself, so Obsidian, VS Code or git can open it at the same time.',
              )}
            </li>
            <li>
              <strong>{t('这台电脑的浏览器', 'This browser')}</strong>
              {t(
                '：「新建空白工作区」或「导入文件夹」（任何浏览器都能用）。示例工作区只读，你在它上面的改动也存在这里。',
                ': “New blank workspace” or “Import folder” (works in any browser). The sample workspace is read-only; your edits to it are kept here too.',
              )}
            </li>
          </ul>
          <p>
            {t(
              '与 GitHub 仓库同步（浏览器工作区）：文件栏顶上的「同步 GitHub」。填仓库、分支、可选的子目录和一个只授权这个仓库的令牌，先比较两边各改了什么，再推上去或拉下来；两边都改过的文件逐个选留哪一份，不自动合并，也不删除任何一边的文件。换一台电脑时，新建空白工作区再同步同一个仓库，就把整个工作区拉了回来。尚未提供：把浏览器工作区直接导出成电脑上的一个文件夹（可以先同步到 GitHub，再用 git 拉到本地）。',
              'GitHub sync (browser workspaces): “Sync with GitHub” at the top of the file column. Enter the repository, branch, an optional folder and a token scoped to that repository; compare first, then push or pull. Files changed on both sides are resolved one by one — nothing is merged automatically and nothing is deleted. On another computer, create a blank workspace and sync the same repository to bring everything back. Not yet available: exporting a browser workspace straight to a folder on disk (sync to GitHub, then git pull locally).',
            )}
          </p>
        </section>

        <section id="lang">
          <h2>{t('English 界面', 'English interface')}</h2>
          <p>
            {t(
              '页眉的「EN」切换到英文界面，设置的「外观与语言」里也可以切换。英文覆盖页眉、封面、设置、入门文档、导览与四个板块的入口；示例课程的讲义、导图编辑器与阅读器内部仍为中文。',
              'The “中” button in the header switches back to Chinese; you can also switch under Appearance & language in Settings. English covers the header, cover, settings, this guide, the tour and the entry screens of the four spaces. The sample course content, the mind-map editor and the reader’s internals remain in Chinese.',
            )}
          </p>
        </section>

        <section id="keys">
          <h2>{t('快捷键', 'Shortcuts')}</h2>
          <table className="guide-table">
            <tbody>
              <tr>
                <td>
                  <kbd>←</kbd> <kbd>→</kbd> <kbd>Esc</kbd>
                </td>
                <td>{t('导览：上一步、下一步、结束', 'Tour: back, next, end')}</td>
              </tr>
              <tr>
                <td>
                  <kbd>Tab</kbd> <kbd>Enter</kbd> <kbd>F2</kbd>
                </td>
                <td>{t('思维导图：加子主题、加同级主题、编辑文字；按 F1 看全部快捷键', 'Mind map: add child, add sibling, edit text; F1 lists every shortcut')}</td>
              </tr>
              <tr>
                <td>
                  <kbd>Ctrl</kbd> + <kbd>K</kbd>
                </td>
                <td>{t('思维导图：画一条自己的连线（朱色双线，理由选填）', 'Mind map: draw your own link (red double line, reason optional)')}</td>
              </tr>
              <tr>
                <td>
                  <kbd>O</kbd>
                </td>
                <td>{t('记忆图谱：在原文与自己的填写之间切换', 'Memory map: toggle between the original and your answers')}</td>
              </tr>
              <tr>
                <td>
                  <kbd>Enter</kbd>
                </td>
                <td>
                  {t('关联探索：发送；', 'Connection Explorer: send; ')}
                  <kbd>Shift</kbd> + <kbd>Enter</kbd>
                  {t(' 换行', ' for a new line')}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="faq">
          <h2>{t('常见问题', 'FAQ')}</h2>
          <dl className="guide-dl faq">
            <div>
              <dt>{t('打开本地文件夹没有反应？', 'Nothing happens when I open a local folder?')}</dt>
              <dd>
                {t(
                  '这个功能需要 Chrome 或 Edge。其他浏览器请用「导入文件夹」，文件会复制进浏览器。',
                  'That needs Chrome or Edge. In other browsers use “Import folder”, which copies the files into the browser.',
                )}
              </dd>
            </div>
            <div>
              <dt>{t('我在示例讲义上的改动去哪了？', 'Where did my edits to the sample go?')}</dt>
              <dd>
                {t(
                  '保存在这台电脑的浏览器里，换电脑或清除浏览器数据就没了。想长期保存，请打开本地文件夹工作。',
                  'They are kept in this computer’s browser and are lost if you switch computers or clear browser data. To keep your work, use a local folder.',
                )}
              </dd>
            </div>
            <div>
              <dt>{t('「测试连接」失败？', 'Test connection fails?')}</dt>
              <dd>
                {t(
                  '先看提示：401 是 key 不对；「浏览器无法访问」通常是这家服务不允许跨域，换上表里标「可以」的服务，或者用它提供的 OpenAI 兼容地址。',
                  'Read the message first: 401 means the key is wrong; “the browser cannot reach it” usually means the service does not allow cross-origin requests — switch to one marked “Works” above, or use its OpenAI-compatible endpoint.',
                )}
              </dd>
            </div>
            <div>
              <dt>{t('导览中途关掉了，怎么接着看？', 'Closed the tour halfway?')}</dt>
              <dd>
                {t('封面和本页顶部都能重新开始导览。刷新页面不会打断它。', 'Restart it from the cover or the top of this page. Refreshing the page does not interrupt it.')}
              </dd>
            </div>
          </dl>
        </section>
      </article>
    </div>
  );
}
