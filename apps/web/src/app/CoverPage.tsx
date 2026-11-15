import { Link } from 'react-router-dom';
import { Wordmark } from '../ui/brand/Wordmark';
import { Terrain } from '../ui/cover/Terrain';
import { SPACES } from '../ui/spaces';
import '../styles/cover.css';

/** 封面：一屏。左侧字标、一句话与四个工作空间的索引；背后是一节课的推导地形图。 */
export function CoverPage() {
  return (
    <div className="cover">
      <Terrain />
      <section className="cover-front">
        <h1 className="hero-mark">
          <Wordmark size="hero" />
        </h1>
        <p className="hero-line">
          全世界的知识都会相逢，
          <br />
          隔山的洞见与跨海的思维在知脉里相拥。
        </p>
        <nav className="entries" aria-label="四个工作空间">
          {SPACES.map((s) => (
            <Link key={s.key} to={s.path} className="key entry-key" viewTransition>
              <span className="entry-name">{s.name}</span>
              <span className="entry-line">{s.line}</span>
            </Link>
          ))}
        </nav>
      </section>
      <footer className="cover-foot">
        <span>2026 Qoder 高校创造力大赛 StudyHack 赛道作品</span>
        <span>示例课程：线性代数</span>
      </footer>
    </div>
  );
}
