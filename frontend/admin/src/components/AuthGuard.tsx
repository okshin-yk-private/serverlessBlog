import React, { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { saveRedirectPath } from '../utils/auth';

interface AuthGuardProps {
  children: ReactNode;
  loadingMessage?: string;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  loadingMessage = '読み込み中...',
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const shouldRedirect = !isLoading && (!isAuthenticated || !user);

  // ログイン成功後に元のページへ戻れるよう、遷移元を保存してからリダイレクトする。
  // Navigate の state で渡すと /login 上で再レンダーごとに state が変わり
  // 無限ナビゲーションになるため、sessionStorage 経由で受け渡す
  useEffect(() => {
    if (shouldRedirect && location.pathname !== '/login') {
      saveRedirectPath(location.pathname + location.search);
    }
  }, [shouldRedirect, location.pathname, location.search]);

  // 認証確認中はローディング表示
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="admin-loading">{loadingMessage}</div>
      </div>
    );
  }

  // 未認証またはユーザー情報がない場合はログインページにリダイレクト
  if (shouldRedirect) {
    return <Navigate to="/login" replace />;
  }

  // 認証済みの場合は子要素を表示
  return <>{children}</>;
};
