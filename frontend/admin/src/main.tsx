import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { configureAmplify } from './config/amplify';

/**
 * E2Eテスト時にMSWワーカーを起動
 * 環境変数 VITE_ENABLE_MSW_MOCK=true の場合のみ有効化
 */
async function enableMocking() {
  console.log(
    '[main.tsx] VITE_ENABLE_MSW_MOCK:',
    import.meta.env.VITE_ENABLE_MSW_MOCK
  );

  if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
    console.log('[main.tsx] MSW is disabled, skipping mock initialization');
    return;
  }

  console.log('[main.tsx] Starting MSW worker...');
  try {
    const { worker } = await import('./mocks/browser');
    console.log('[main.tsx] MSW worker imported successfully');

    // MSWワーカーを起動（コンソール警告を抑制）
    await worker.start({
      onUnhandledRequest: 'bypass', // モックされていないリクエストは通過させる
    });
    console.log('[main.tsx] MSW worker started successfully');
  } catch (error) {
    console.error('[main.tsx] Failed to start MSW worker:', error);
    throw error;
  }
}

// MSWが無効な場合のみAmplifyの設定を初期化（E2Eテスト時はスキップ）
if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
  console.log('[main.tsx] Configuring Amplify...');
  configureAmplify();
  console.log('[main.tsx] Amplify configured');
} else {
  console.log('[main.tsx] Skipping Amplify configuration (MSW mode)');
}

console.log('[main.tsx] Starting app initialization...');
enableMocking()
  .then(() => {
    console.log('[main.tsx] Rendering React app...');
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log('[main.tsx] React app rendered successfully');
  })
  .catch((error) => {
    console.error('[main.tsx] Fatal error during app initialization:', error);
  });
