import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { configureAmplify } from './config/amplify'

/**
 * E2Eテスト時にMSWワーカーを起動
 * 環境変数 VITE_ENABLE_MSW_MOCK=true の場合のみ有効化
 */
async function enableMocking() {
  if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
    return;
  }

  const { worker } = await import('./mocks/browser');

  // MSWワーカーを起動（コンソール警告を抑制）
  return worker.start({
    onUnhandledRequest: 'bypass', // モックされていないリクエストは通過させる
  });
}

// MSWが無効な場合のみAmplifyの設定を初期化（E2Eテスト時はスキップ）
if (import.meta.env.VITE_ENABLE_MSW_MOCK !== 'true') {
  configureAmplify()
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
