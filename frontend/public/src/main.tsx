import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * E2Eテスト時にMSWワーカーを起動
 * 環境変数 VITE_ENABLE_MSW_MOCK=true の場合のみ有効化
 */
async function enableMocking() {
  // デバッグ: 環境変数を確認
  console.log('[MSW] VITE_ENABLE_MSW_MOCK:', import.meta.env.VITE_ENABLE_MSW_MOCK);
  console.log('[MSW] All env:', import.meta.env);

  if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
    console.log('[MSW] MSW is disabled. Skipping worker initialization.');
    return;
  }

  try {
    console.log('[MSW] MSW is enabled. Starting worker...');
    const { worker } = await import('./mocks/browser');

    // MSWワーカーを起動（コンソール警告を抑制）
    // localStorage無効時でもエラーをキャッチして続行
    await worker.start({
      onUnhandledRequest: 'bypass', // モックされていないリクエストは通過させる
    });
    console.log('[MSW] Worker started successfully');
  } catch (error) {
    console.error('[MSW] Failed to start worker:', error);
    console.log('[MSW] This might be due to localStorage unavailability or other issues');
    // MSW起動に失敗してもアプリケーションは動作させる
  }
}

// アプリケーションを起動
// MSW初期化失敗時でもReactアプリケーションは必ず起動する
enableMocking()
  .catch((error) => {
    console.error('[MSW] Error during MSW initialization:', error);
    console.log('[MSW] Application will continue without MSW');
  })
  .finally(() => {
    console.log('[App] Rendering React application...');
    try {
      ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );
      console.log('[App] React application rendered successfully');
    } catch (error) {
      console.error('[App] Failed to render React application:', error);
      // フォールバック: HTMLに直接エラーメッセージを表示
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = '<div style="padding: 20px;"><h1>アプリケーションの起動に失敗しました</h1><p>ページを再読み込みしてください。</p></div>';
      }
    }
  });
