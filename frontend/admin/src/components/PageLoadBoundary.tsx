import { Component, type ReactNode } from 'react';

/** A failed chunk load (offline or after a deployment) must not leave a blank page. */
export class PageLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="admin-loading" role="alert">
          <p>
            画面を表示できませんでした。接続を確認して再読み込みしてください。
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
