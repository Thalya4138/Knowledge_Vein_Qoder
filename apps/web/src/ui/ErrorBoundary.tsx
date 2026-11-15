import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 应用外壳之外的兜底：出错时给出可操作的页面，而不是白屏。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('知脉 Vein 渲染失败', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <h1>页面出错了</h1>
        <p className="lede">
          外壳仍在运行，失败发生在页面内部。点下面的按钮重试；若持续失败，刷新页面或换一个板块。
        </p>
        <pre className="evidence">{this.state.error.message}</pre>
        <button type="button" className="action" onClick={() => this.setState({ error: null })}>
          清除错误并重试
        </button>
      </main>
    );
  }
}
