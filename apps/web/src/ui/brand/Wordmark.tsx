import { EN, ZH } from './wordmarkPaths';

/**
 * 字标：「知脉」Noto Serif SC 900 + 「Vein」Computer Modern Italic，均为内联路径，不加载字体。
 * 中文字身：基线在 y = ascent，字面框约为基线上 880、下 120。
 */
const ZH_TOP = ZH.ascent - 880;
const ZH_BOX = `0 ${ZH_TOP} ${ZH.width} 1000`;
// 「Vein」：基线在 y = ascent；大写字高约 683，斜体向右伸出约 60
const EN_TOP = EN.ascent - 700;
const EN_BOX = `-20 ${EN_TOP} ${EN.width + 80} 720`;

export function Wordmark({ size = 'small', title = '知脉 Vein' }: { size?: 'small' | 'hero'; title?: string }) {
  return (
    <span className={`wordmark wordmark-${size}`} role="img" aria-label={title}>
      <svg className="wm-zh" viewBox={ZH_BOX} aria-hidden="true" focusable="false">
        <path d={ZH.d} />
      </svg>
      <svg className="wm-en" viewBox={EN_BOX} aria-hidden="true" focusable="false">
        <path d={EN.d} />
      </svg>
    </span>
  );
}
