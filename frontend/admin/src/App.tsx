import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { AuthGuard } from './components/AuthGuard';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import PostListPage from './pages/PostListPage';
import PostCreatePage from './pages/PostCreatePage';
import PostEditPage from './pages/PostEditPage';
import CategoryListPage from './pages/CategoryListPage';
import CategoryEditPage from './pages/CategoryEditPage';

function App() {
  return (
    // CloudFrontで /admin/ パスで配信されるため、basename を設定
    // import.meta.env.BASE_URL は vite.config.ts の base 設定値が自動的に入る
    // React Router v6 は basename に末尾スラッシュがないことを期待するため、削除する
    <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
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
      </AuthProvider>
    </Router>
  );
}

export default App;
