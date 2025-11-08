import React, { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AuthGuardProps {
  children: ReactNode;
  loadingMessage?: string;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  loadingMessage = '読み込み中...',
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  // 認証確認中はローディング表示
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">{loadingMessage}</div>
      </div>
    );
  }

  // 未認証またはユーザー情報がない場合はログインページにリダイレクト
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 認証済みの場合は子要素を表示
  return <>{children}</>;
};
