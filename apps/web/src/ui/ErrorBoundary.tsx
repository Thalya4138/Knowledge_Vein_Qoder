import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 页面代码块下载失败（常见于重新部署后旧文件已不存在）。React.lazy 会缓存失败，重试无效，只能刷新。 */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
    error.message,
  );
}

/** 出错时给出可操作的页面，而不是白屏。App 内的页面级实例出错时，导航与状态条仍在。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('知脉 Vein 渲染失败', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const en = localStorage.getItem('vein.lang') === 'en';
    const t = (zh: string, e: string) => (en ? e : zh);
    return (
      <div className="plain-page" role="alert">
        <h1 className="display">{chunk ? t('这一页没能载入', 'This page did not load') : t('这一页出了问题', 'Something went wrong on this page')}</h1>
        <p>
          {chunk
            ? t('网站刚更新过，浏览器里还是旧版本。刷新一次即可，已有内容不会丢。', 'The site was just updated and this browser still has the old version. Reload once; nothing you made will be lost.')
            : t('其他页面不受影响。先重试；还不行就刷新，或从页眉换一个板块。', 'Other pages are unaffected. Try again; if that fails, reload or switch spaces from the header.')}
        </p>
        <pre>{error.message}</pre>
        {chunk ? (
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            {t('刷新页面', 'Reload')}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
            {t('重试', 'Try again')}
          </button>
        )}
      </div>
    );
  }
}
