import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { sessionStorage as amplifySessionStorage } from 'aws-amplify/utils';
import { cleanupLegacyAmplifyKeys } from '../utils/auth';

/**
 * Amplifyの初期設定
 *
 * セキュリティ上の考慮:
 * - CognitoのトークンをAmplify既定のlocalStorageではなくsessionStorageに保存する
 *   （タブを閉じると削除されるため、XSSによるリフレッシュトークン窃取の影響を抑える）
 * - 旧バージョンがlocalStorageに残したCognitoトークンを起動時に削除する
 */
export const configureAmplify = () => {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
        signUpVerificationMethod: 'code',
        loginWith: {
          email: true,
        },
      },
    },
  });

  // Amplify公式のsessionStorage実装をトークンストア(refresh/id/accessトークン)に使用する
  cognitoUserPoolsTokenProvider.setKeyValueStorage(amplifySessionStorage);

  // 既存ユーザーのlocalStorageに残る旧Amplifyトークンを削除する
  cleanupLegacyAmplifyKeys();
};
