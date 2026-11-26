import { Link } from 'react-router-dom';
import { Wordmark } from '../ui/brand/Wordmark';
import { Icon } from '../ui/Icon';
import { Terrain } from '../ui/cover/Terrain';
import { usePrefs } from '../ui/prefs';
import { useTour } from './tour/Tour';
import { SPACES, spaceText, type SpaceKey } from '../ui/spaces';
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
  const { lang } = usePrefs();
  const en = lang === 'en';
  const tour = useTour();
  return (
    <div className="cover">
      <Terrain />
      <section className="cover-front">
        <h1 className="hero-mark">
          <Wordmark size="hero" />
        </h1>
        {en ? (
          <p className="hero-line" lang="en">
            All knowledge is bound to meet.
            <br />
            In Vein, distant insights find each other.
          </p>
        ) : (
          <p className="hero-line">
            全世界的知识都会相逢，
            <br />
            隔山的洞见与跨海的思维在知脉里相拥。
          </p>
        )}
        <nav className="entries" aria-label={en ? 'The four spaces' : '四个工作空间'}>
          {SPACES.map((s) => (
            <Link key={s.key} to={s.path} className="key entry-key" data-space={s.key} viewTransition>
              <span className="entry-name">{spaceText(s, lang).name}</span>
              <span className="entry-line">{spaceText(s, lang).line}</span>
              <Specimen name={ENTRY_PLATE[s.key].name} pigment={s.key} tilt={ENTRY_PLATE[s.key].tilt} size={76} className="entry-specimen" />
              <span className="entry-plate" aria-hidden="true">{en ? ENTRY_PLATE[s.key].plate.replace('图版', 'Plate') : ENTRY_PLATE[s.key].plate}</span>
            </Link>
          ))}
        </nav>
        <button type="button" className="cover-tour" onClick={() => tour.start(0)}>
          <Icon name="locate" />
          <span>{en ? 'New here? Take the guided tour' : '第一次来？跟着导览走一遍'}</span>
          <span className="cover-tour-arrow" aria-hidden="true">→</span>
        </button>
      </section>
      <footer className="cover-foot">
        <span>{en ? 'Entry for the 2026 Qoder Campus Creativity Contest, StudyHack track' : '2026 Qoder 高校创造力大赛 StudyHack 赛道作品'}</span>
        <span>{en ? 'Sample course: Linear Algebra (in Chinese)' : '示例课程：线性代数'}</span>
      </footer>
    </div>
  );
}
