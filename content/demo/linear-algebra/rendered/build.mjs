// 把 src.html 里的 $...$ / $$...$$ 预渲染成 KaTeX HTML，输出 index.html（离线可开，无 CDN）。
// 用法：node build.mjs   （需要能 import 到 katex；样张阶段临时装在 /tmp/katexbuild）
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(process.env.KATEX_FROM || "C:/Users/Wang/AppData/Local/Temp/katexbuild/package.json");
const katex = require("katex");

const src = readFileSync(new URL("./src.html", import.meta.url), "utf8");
const [head, rest] = src.split("<body>");
const [content, tail] = rest.split('<script src="app.js">');

const tex = (s, displayMode) => katex.renderToString(s, { displayMode, throwOnError: true, strict: false });
const out = content
  .replace(/\$\$([\s\S]+?)\$\$/g, (_, s) => tex(s.trim(), true))
  .replace(/\$([^$\n]+?)\$/g, (_, s) => tex(s, false));

writeFileSync(new URL("./index.html", import.meta.url), `${head}<body>${out}<script src="app.js">${tail}`);
console.log("index.html written");
