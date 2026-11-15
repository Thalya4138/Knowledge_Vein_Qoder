import { Link } from 'react-router-dom';
import '../styles/guide.css';

/**
 * 入门文档：像 API 服务站的文档页，左侧目录，右侧正文。
 * 只写已经能用的东西；示例模式与真实能力的边界写清楚。
 */

const TOC = [
  ['start', '三分钟上手'],
  ['spaces', '四个工作空间'],
  ['sample', '示例模式与真实能力'],
  ['model', '接入你自己的模型'],
  ['data', '你的数据在哪里'],
  ['keys', '快捷键'],
  ['faq', '常见问题'],
] as const;

export function GuidePage() {
  return (
    <div className="guide">
      <nav className="guide-toc" aria-label="目录">
        <p className="guide-toc-title">入门</p>
        <ol>
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="guide-body">
        <h1 className="display">从一节讲义开始</h1>
        <p className="guide-lede">
          知脉把一门课的资料整理成能读的讲义，再把讲义里的知识连成一张每条线都有理由的网。下面用内置的示例课程「线性代数：从线性方程组到最小二乘」带你走一遍。
        </p>

        <section id="start">
          <h2>三分钟上手</h2>
          <ol className="guide-steps">
            <li>
              <strong>读一节讲义。</strong>打开 <Link to="/workspace">学习工作台</Link>，左栏是课程，中栏是文件，右边是讲义。
              点工具栏的「编辑」可以直接在排好版的讲义上改字、加粗、高亮。
            </li>
            <li>
              <strong>问一个问题。</strong>点底部的对话框，选「法方程是怎么推出来的？」，再点回答里的位置：讲义会跳到那一节并短暂高亮。
            </li>
            <li>
              <strong>把零散的知识串起来。</strong>到 <Link to="/connection">关联探索</Link>，试预置的问题：最小二乘、点到平面的距离、异面直线的距离，是同一个问题吗？
              右边的关联图可以拖动、双击改字。
            </li>
            <li>
              <strong>考考自己。</strong>到 <Link to="/atlas?ws=linear-algebra&amp;map=memory">个人记忆图谱</Link>，点「叶子全部挖空」，填完按 <kbd>O</kbd> 对照原文。
            </li>
          </ol>
        </section>

        <section id="spaces">
          <h2>四个工作空间</h2>
          <dl className="guide-dl">
            <div>
              <dt>学习工作台</dt>
              <dd>一门课一个工作区。读讲义、PDF、插图与资料出处；在渲染好的讲义上直接编辑；也可以打开你电脑上的文件夹，在这里读写。</dd>
            </div>
            <div>
              <dt>可视化实验室</dt>
              <dd>说出你想看见的，得到可以拖动的模型。示例：正交投影实验，拖动向量，看残差何时与直线垂直。</dd>
            </div>
            <div>
              <dt>知识关联探索</dt>
              <dd>碎片串联、学科元思考、跨学科并联三种模式。回答旁边生成一张能编辑的关联图，回答可以复制或下载为 Markdown。</dd>
            </div>
            <div>
              <dt>认知记忆图谱</dt>
              <dd>思维导图可以编辑并自动保存；个人记忆图谱可以收起、遮盖、挖空自测，也可以关掉自动对齐，把节点摆成你记忆里的样子。</dd>
            </div>
          </dl>
        </section>

        <section id="sample">
          <h2>示例模式与真实能力</h2>
          <p>没有接入模型时，所有生成类功能只回答预置的问题，界面上标着「示例结果」：这些答案是离线整理、人工核对过的，不是现场生成。不需要模型的功能都是真的：</p>
          <table className="guide-table">
            <thead>
              <tr>
                <th scope="col">真实可用</th>
                <th scope="col">示例模式</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>阅读与编辑讲义、打开本地文件夹并保存</td>
                <td>工作台问答、整理资料</td>
              </tr>
              <tr>
                <td>定位到讲义并高亮</td>
                <td>关联探索的回答</td>
              </tr>
              <tr>
                <td>正交投影交互实验</td>
                <td>其他可视化的生成</td>
              </tr>
              <tr>
                <td>思维导图编辑、记忆图谱自测</td>
                <td>让 AI 代为编辑图谱</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="model">
          <h2>接入你自己的模型</h2>
          <p>
            点页眉右上角的设置，在「模型」里填接口地址、模型名与 API key，点「测试连接」确认浏览器能直接访问它。支持 OpenAI 兼容接口（DeepSeek、通义千问等）与 Anthropic。
            key 只存在本页内存里，刷新即清除，不会写进浏览器存储，也不会经过任何第三方服务器。
          </p>
        </section>

        <section id="data">
          <h2>你的数据在哪里</h2>
          <p>知脉没有服务器，也没有账号系统。工作区就是一个普通文件夹，只存在三个地方：这台电脑的浏览器、你选的本地文件夹、你自己的 GitHub 仓库（下一版）。用 Obsidian、VS Code、git 都能直接打开它。</p>
        </section>

        <section id="keys">
          <h2>快捷键</h2>
          <table className="guide-table">
            <tbody>
              <tr>
                <td>
                  <kbd>O</kbd>
                </td>
                <td>记忆图谱：在原文与自己的填写之间切换</td>
              </tr>
              <tr>
                <td>
                  <kbd>F2</kbd>
                </td>
                <td>思维导图：修改选中节点的文字</td>
              </tr>
              <tr>
                <td>
                  <kbd>←</kbd> <kbd>→</kbd>
                </td>
                <td>封面笔记卡片：翻看上一条、下一条连线</td>
              </tr>
              <tr>
                <td>
                  <kbd>Enter</kbd>
                </td>
                <td>关联探索：发送；<kbd>Shift</kbd> + <kbd>Enter</kbd> 换行</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="faq">
          <h2>常见问题</h2>
          <dl className="guide-dl">
            <div>
              <dt>打开本地文件夹没有反应？</dt>
              <dd>这个功能需要 Chrome 或 Edge。其他浏览器下一版提供导入与导出。</dd>
            </div>
            <div>
              <dt>我在示例讲义上的改动去哪了？</dt>
              <dd>保存在这台电脑的浏览器里，换电脑或清除浏览器数据就没了。想长期保存，请打开本地文件夹工作。</dd>
            </div>
          </dl>
        </section>
      </article>
    </div>
  );
}
