import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import PostListPage from './pages/PostListPage';
import PostCreatePage from './pages/PostCreatePage';
import PostEditPage from './pages/PostEditPage';

function App() {
  return (
    <Router>
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
