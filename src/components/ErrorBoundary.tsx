import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6"
          style={{ background: 'var(--bg)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Something went wrong</div>
          <div className="text-xs text-center max-w-xs" style={{ color: 'var(--muted)' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs px-4 py-2 rounded-full font-medium mt-2"
            style={{ background: '#C4A265', color: '#1a1714' }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
