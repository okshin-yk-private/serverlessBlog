import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { AuthGuard } from './components/AuthGuard';
import { lazy, Suspense, type ReactNode } from 'react';
import { PageLoadBoundary } from './components/PageLoadBoundary';

const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PostListPage = lazy(() => import('./pages/PostListPage'));
const PostCreatePage = lazy(() => import('./pages/PostCreatePage'));
const PostEditPage = lazy(() => import('./pages/PostEditPage'));
const CategoryListPage = lazy(() => import('./pages/CategoryListPage'));
const CategoryEditPage = lazy(() => import('./pages/CategoryEditPage'));

// Reset the page boundary on navigation so transitions show progress instead of
// retaining the previous page until the new chunk finishes loading.
function RouteLoadingBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <PageLoadBoundary key={pathname}>
      <Suspense
        fallback={
          <div className="admin-loading" role="status">
            画面を読み込んでいます…
          </div>
        }
      >
        {children}
      </Suspense>
    </PageLoadBoundary>
  );
}

function App() {
  return (
    // CloudFrontで /admin/ パスで配信されるため、basename を設定
    // import.meta.env.BASE_URL は vite.config.ts の base 設定値が自動的に入る
    // React Router v6 は basename に末尾スラッシュがないことを期待するため、削除する
    <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <RouteLoadingBoundary>
          <Routes>
            <Route
              path="/security"
              element={
                <AuthGuard>
                  <SecurityPage />
                </AuthGuard>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/dashboard"
              element={
                <AuthGuard>
                  <DashboardPage />
                </AuthGuard>
              }
            />
            <Route
              path="/posts"
              element={
                <AuthGuard>
                  <PostListPage />
                </AuthGuard>
              }
            />
            <Route
              path="/posts/new"
              element={
                <AuthGuard>
                  <PostCreatePage />
                </AuthGuard>
              }
            />
            <Route
              path="/posts/edit/:id"
              element={
                <AuthGuard>
                  <PostEditPage />
                </AuthGuard>
              }
            />
            <Route
              path="/categories"
              element={
                <AuthGuard>
                  <CategoryListPage />
                </AuthGuard>
              }
            />
            <Route
              path="/categories/new"
              element={
                <AuthGuard>
                  <CategoryEditPage />
                </AuthGuard>
              }
            />
            <Route
              path="/categories/edit/:id"
              element={
                <AuthGuard>
                  <CategoryEditPage />
                </AuthGuard>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {/* Catch-all: 未定義パスは dashboard へリダイレクト */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </RouteLoadingBoundary>
      </AuthProvider>
    </Router>
  );
}

export default App;
