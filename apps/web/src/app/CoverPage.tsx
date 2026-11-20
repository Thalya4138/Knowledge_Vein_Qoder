import { Link } from 'react-router-dom';
import { Wordmark } from '../ui/brand/Wordmark';
import { Terrain } from '../ui/cover/Terrain';
import { SPACES, type SpaceKey } from '../ui/spaces';
import { Specimen, type SpecimenName } from '../ui/plate/Specimen';
import '../styles/cover.css';

/** 每个板块的标本与图版号（DESIGN.md §14）：工作台是羽毛笔、实验室是鹦鹉螺、关联探索是蛛网、图谱是叶脉。 */
const ENTRY_PLATE: Record<SpaceKey, { name: SpecimenName; tilt: number; plate: string }> = {
  workspace: { name: 'feather', tilt: 4, plate: '图版 Ⅰ' },
  lab: { name: 'nautilus', tilt: -6, plate: '图版 Ⅱ' },
  connection: { name: 'web', tilt: 8, plate: '图版 Ⅲ' },
  atlas: { name: 'leaf', tilt: -10, plate: '图版 Ⅳ' },
};

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
            <Link key={s.key} to={s.path} className="key entry-key" data-space={s.key} viewTransition>
              <span className="entry-name">{s.name}</span>
              <span className="entry-line">{s.line}</span>
              <Specimen name={ENTRY_PLATE[s.key].name} pigment={s.key} tilt={ENTRY_PLATE[s.key].tilt} size={76} className="entry-specimen" />
              <span className="entry-plate" aria-hidden="true">{ENTRY_PLATE[s.key].plate}</span>
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
