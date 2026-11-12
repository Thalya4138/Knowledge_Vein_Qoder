import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 探针挂了也要能看到挂了——否则「白屏」会被误读成「站不支持」。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[T0-0 探针] 渲染失败', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <h1>探针组件抛错</h1>
        <p className="lede">
          页面外壳仍然活着，说明失败发生在具体检查里，不是整个应用起不来。
        </p>
        <pre className="evidence">{this.state.error.message}</pre>
        <button type="button" className="action" onClick={() => this.setState({ error: null })}>
          清除错误并重试
        </button>
      </main>
    );
  }
}
