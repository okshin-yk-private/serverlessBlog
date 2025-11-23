import { useContext } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/authContext';

/**
 * AuthContextを使用するためのカスタムフック
 * AuthProvider内でのみ使用可能
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
