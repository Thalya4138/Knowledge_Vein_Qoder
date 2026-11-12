// 旁栏资源：每条都定位到「片段」，并带一句“为什么链到这里”。
// 时间戳与引文均取自 MIT OCW 官方字幕（Y_Ac6KiQ1t0.vtt）与讲义 PDF 原文，2026-11-12 核对。
const YT = "Y_Ac6KiQ1t0";
const OCW_L15 = "https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/resources/lecture-15-projections-onto-subspaces/";

const RESOURCES = {
  "l15-normal": {
    kind: "video", kindLabel: "视频",
    title: "MIT 18.06 · Lecture 15: Projections onto Subspaces",
    meta: "Gilbert Strang · MIT OpenCourseWare · CC BY-NC-SA 4.0",
    loc: "25:12 – 27:59", start: 1512,
    quote: [
      ["25:12", "And the key is that <mark>b minus A x-hat, that's the error.</mark>"],
      ["25:24", "Is perpendicular to the plane."],
      ["26:31", "So really I have the equations a one transpose b minus Ax is zero. And also a two transpose b minus Ax is zero."],
      ["27:43", "So the equation I'm coming up with is <mark>A transpose (b − A x-hat) is zero.</mark>"],
    ],
    why: "这一段与正文“法方程”一小节的推理顺序相同：先说残差垂直于平面，再逐列写出正交条件，最后合成矩阵形式。",
  },
  "l15-indep": {
    kind: "video", kindLabel: "视频",
    title: "MIT 18.06 · Lecture 15: Projections onto Subspaces",
    meta: "Gilbert Strang · MIT OpenCourseWare · CC BY-NC-SA 4.0",
    loc: "20:12 – 20:24", start: 1212,
    quote: [
      ["20:12", "They don't have to be perpendicular."],
      ["20:15", "<mark>But they better be independent</mark>, because then that tells me the plane."],
    ],
    why: "Strang 在这里默认 A 的两列线性无关，于是法方程有唯一解。正文“点唯一，参数未必唯一”讨论的正是去掉这个前提以后会发生什么。",
  },
  "l15-split": {
    kind: "video", kindLabel: "视频",
    title: "MIT 18.06 · Lecture 15: Projections onto Subspaces",
    meta: "Gilbert Strang · MIT OpenCourseWare · CC BY-NC-SA 4.0",
    loc: "37:28 – 38:16", start: 2248,
    quote: [
      ["37:51", "…has too many rows, it's just got a couple of columns, like a one and a two, but lots of rows. Not square."],
      ["38:02", "And if it's not square, this A transpose A is square but <mark>I can't pull it apart like this</mark>"],
      ["38:10", "I'm not allowed to do this pull apart, except if A was square."],
    ],
    why: "概念检测第 1(3) 题考查的就是这个错误。听完这一段再判断，会更清楚错在哪里。",
  },
  "ocw-pdf": {
    kind: "pdf", kindLabel: "PDF",
    title: "18.06SC Session 2.2 讲义摘要：Projections onto subspaces",
    meta: "MIT OpenCourseWare · CC BY-NC-SA 4.0 · 本地副本 resources/files/",
    loc: "第 2 页 · “Why project?”", page: 2,
    file: "../resources/files/MIT18_06SCF11_Ses2.2sum.pdf",
    online: "https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/00e9c8f0eafedeab21a3d079a17ed3d8_MIT18_06SCF11_Ses2.2sum.pdf#page=2",
    quote: [
      ["p.2", "As we know, the equation Ax = b may have no solution. The vector Ax is always in the column space of A, and b is unlikely to be in the column space. <mark>So, we project b onto a vector p in the column space of A and solve Ax̂ = p.</mark>"],
    ],
    why: "这三句话是正文“先找最近点 p，再求参数 x̂”的英文原型，可以对照着读。",
  },
  "wiki-proj": {
    kind: "web", kindLabel: "网页",
    title: "Wikipedia: Linear least squares",
    meta: "CC BY-SA 4.0 · 浏览器会自动滚动到这句话并高亮",
    loc: "“…represents orthogonal projection onto the column space…”",
    url: "https://en.wikipedia.org/wiki/Linear_least_squares#:~:text=represents%20orthogonal%20projection%20onto%20the%20column%20space",
    quote: [
      ["", "More rigorously, if XᵀX is invertible, then the matrix X(XᵀX)⁻¹Xᵀ <mark>represents orthogonal projection onto the column space</mark> of X."],
    ],
    why: "与正文中投影矩阵 P = A(AᵀA)⁻¹Aᵀ 的定义对应。注意原文同样带着“XᵀX 可逆”这一前提。",
  },
};

const drawer = document.getElementById("drawer");
const body = document.getElementById("drawer-body");
const scrim = document.getElementById("scrim");

function render(r) {
  const quote = r.quote.map(([ts, q]) =>
    `<div>${ts ? `<span class="ts">${ts}</span>` : ""}${q}</div>`).join("");
  let actions = "", preview = "";
  if (r.kind === "video") {
    const url = `https://www.youtube.com/watch?v=${YT}&t=${r.start}s`;
    actions = `<a href="${url}" target="_blank">▶ 从 ${r.loc.split(" ")[0]} 开始播放</a>
               <a class="secondary" href="${OCW_L15}" target="_blank">OCW 课程页（含字幕下载）</a>`;
  } else if (r.kind === "pdf") {
    actions = `<a href="${r.file}#page=${r.page}" target="_blank">打开本地 PDF 第 ${r.page} 页</a>
               <a class="secondary" href="${r.online}" target="_blank">在线原文</a>`;
    preview = `<div class="d-sec"><h4>原文预览</h4><iframe class="d-frame" src="${r.file}#page=${r.page}&view=FitH"></iframe></div>`;
  } else {
    actions = `<a href="${r.url}" target="_blank">打开并高亮这句话</a>`;
  }
  body.innerHTML = `
    <div class="d-kind"><span class="res-kind ${r.kind}">${r.kindLabel}</span></div>
    <p class="d-title">${r.title}</p>
    <div class="d-meta">${r.meta}</div>
    <div class="d-sec"><h4>定位</h4><div class="d-loc">${r.loc}</div></div>
    <div class="d-sec"><h4>原文片段</h4><blockquote class="d-quote">${quote}</blockquote></div>
    <div class="d-sec"><h4>为什么链到这里</h4><div class="d-why">${r.why}</div></div>
    <div class="d-sec d-actions">${actions}</div>
    ${preview}`;
}

function open(id) {
  render(RESOURCES[id]);
  drawer.classList.add("open"); scrim.classList.add("open");
}
function close() { drawer.classList.remove("open"); scrim.classList.remove("open"); }

document.querySelectorAll("a.res").forEach(a =>
  a.addEventListener("click", e => { e.preventDefault(); open(a.dataset.res); }));
document.getElementById("drawer-close").onclick = close;
scrim.onclick = close;
document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
document.getElementById("annot").onchange = e =>
  document.body.classList.toggle("annot", e.target.checked);

// 演示/截图用：index.html?open=l15-normal 直接打开某条资源
const pre = new URLSearchParams(location.search).get("open");
if (pre && RESOURCES[pre]) open(pre);
