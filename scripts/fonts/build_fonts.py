"""
生成两样字体产物（一次性脚本；改了界面文案后重跑）：

1. apps/web/src/ui/brand/wordmarkPaths.ts
   字标「知脉」（Noto Serif SC，字重 900）与「Vein」（KaTeX_Main Italic，即 Computer Modern Italic）的 SVG 路径。
   字标以路径形式内联，网页不必加载这两套字体。
2. apps/web/src/styles/fonts/vein-display.woff
   标题字体：Noto Sans SC 字重 600，只保留界面源码里出现过的字符。

两套源字体均为 SIL Open Font License 1.1，允许子集化与再分发。
3. apps/web/src/styles/fonts/vein-title.woff   站酷小薇（ZCOOL XiaoWei，OFL）：大标题
4. apps/web/src/styles/fonts/vein-text.woff    霞鹜文楷（LXGW WenKai，OFL）：封面、卡片、入门文档等「读的文字」
   字符集 = 界面源码 + 示例知识库（kb.json / graph.json）里出现过的字；用户自己的内容超出时回落到系统字体。

用法：python -I scripts/fonts/build_fonts.py <NotoSerifSC-VF.ttf> <NotoSansSC-VF.ttf> [ZCOOLXiaoWei.ttf] [LXGWWenKai.ttf]
依赖：fontTools（pip install fonttools）。
"""

import pathlib
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web" / "src"
KATEX_ITALIC = ROOT / "node_modules" / "katex" / "dist" / "fonts" / "KaTeX_Main-Italic.ttf"


def glyph_paths(font: TTFont, text: str, tracking: float = 0.0):
    """把一串字排成一行，返回 (SVG path, 总宽度, 字身高度信息)。坐标已翻转为 SVG 方向（y 向下）。"""
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    upm = font["head"].unitsPerEm
    ascent = font["hhea"].ascent
    x = 0.0
    parts = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, ascent)))
        parts.append(pen.getCommands())
        x += glyphs[name].width + tracking * upm
    width = x - tracking * upm
    return " ".join(parts), width, upm, ascent, font["hhea"].descent


def build_wordmark(serif_path: str) -> None:
    serif = instantiateVariableFont(TTFont(serif_path), {"wght": 900})
    zh_d, zh_w, zh_upm, zh_asc, zh_desc = glyph_paths(serif, "知脉", tracking=0.02)
    italic = TTFont(str(KATEX_ITALIC))
    en_d, en_w, en_upm, en_asc, en_desc = glyph_paths(italic, "Vein")

    out = WEB / "ui" / "brand" / "wordmarkPaths.ts"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        "// 由 scripts/fonts/build_fonts.py 生成，勿手改。\n"
        "// 「知脉」：Noto Serif SC 900；「Vein」：Computer Modern Italic（KaTeX）。均为 SIL OFL 1.1。\n\n"
        f"export const ZH = {{ d: {zh_d!r}, width: {zh_w:.0f}, upm: {zh_upm}, ascent: {zh_asc}, descent: {zh_desc} }};\n"
        f"export const EN = {{ d: {en_d!r}, width: {en_w:.0f}, upm: {en_upm}, ascent: {en_asc}, descent: {en_desc} }};\n",
        encoding="utf-8",
        newline="\n",
    )
    print("wordmark ->", out.relative_to(ROOT), f"(zh {len(zh_d)} chars, en {len(en_d)} chars)")


def collect_text() -> str:
    """界面源码里所有中文字符与全角标点，加上数字与常用西文。"""
    chars = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:;!?'\"()-/+&%")
    for f in WEB.rglob("*.ts*"):
        if "content" in f.parts or f.name.endswith(".test.ts"):
            continue
        for ch in f.read_text(encoding="utf-8"):
            if re.match(r"[　-〿一-鿿＀-￯“”‘’…—]", ch):
                chars.add(ch)
    return "".join(sorted(chars))


# 站酷小薇的标题字：字符集与 display 相同（界面源码现取），另加 TITLE_TEXT 兜底。
# 手工清单曾漏掉后加的标题字（回落系统黑体造成一行两字体），改为现取不再过期。
TITLE_TEXT = """
全世界的知识都会相逢，隔山的洞见与跨海的思维在知脉里相拥。
学习工作台 可视化实验室 知识关联探索 认知记忆图谱
选一个工作区 选一张图 思维导图 个人记忆图谱 新建工作区 线性代数：从线性方程组到最小二乘
碎片串联 学科元思考 跨学科并联 你好。我们要 Visualize 些什么？
从一节讲义开始 三分钟上手 四个工作空间 示例模式与真实能力 接入你自己的模型 你的数据在哪里 快捷键 常见问题
这个地址没有页面 这一页没能载入 这一页出了问题
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
"""


def collect_with_content() -> str:
    text = set(collect_text())
    for f in ["kb.json", "graph.json"]:
        for ch in (ROOT / "content" / "demo" / "linear-algebra" / f).read_text(encoding="utf-8"):
            if re.match(r"[　-〿一-鿿＀-￯“”‘’…—⊥⇔∇‖ᵀ]", ch):
                text.add(ch)
    return "".join(sorted(text))


def build_subset(src: str, out_name: str, text: str) -> None:
    font = TTFont(src)
    opts = Options()
    opts.flavor = "woff"
    opts.layout_features = ["kern", "palt", "liga"]
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = WEB / "styles" / "fonts" / out_name
    font.flavor = "woff"
    font.save(str(out))
    print(out_name, "->", f"{len(text)} chars, {out.stat().st_size // 1024} KB")


def build_display(sans_path: str) -> None:
    text = collect_text()
    font = instantiateVariableFont(TTFont(sans_path), {"wght": 600})
    opts = Options()
    opts.flavor = "woff"  # 本机无 brotli，用 woff（zlib）；所有现代浏览器都支持
    opts.layout_features = ["kern", "palt", "liga"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = WEB / "styles" / "fonts" / "vein-display.woff"
    out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff"
    font.save(str(out))
    print("display ->", out.relative_to(ROOT), f"({len(text)} chars, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    serif_vf, sans_vf = sys.argv[1], sys.argv[2]
    build_wordmark(serif_vf)
    build_display(sans_vf)
    if len(sys.argv) > 4:
        build_subset(sys.argv[3], "vein-title.woff", collect_with_content())
        build_subset(sys.argv[4], "vein-text.woff", collect_with_content())
