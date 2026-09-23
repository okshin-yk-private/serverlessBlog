import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  fetchMFAPreference,
  listWebAuthnCredentials,
} from 'aws-amplify/auth';

export type Passkey = Awaited<
  ReturnType<typeof listWebAuthnCredentials>
>['credentials'][number];

export async function listPasskeys(): Promise<Passkey[]> {
  const credentials: Passkey[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;
  do {
    const page = await listWebAuthnCredentials({ pageSize: 20, nextToken });
    credentials.push(...page.credentials);
    nextToken = page.nextToken;
    if (nextToken) {
      if (seen.has(nextToken))
        throw new Error('パスキー一覧を取得できませんでした。');
      seen.add(nextToken);
    }
  } while (nextToken);
  return credentials;
}

// Amplify 6.20 has no WebAuthnMfaSettings input. Use Cognito's public API
// with the signed-in user's access token; never use an ID token or IAM credentials.
async function setMfaPreference(
  settings: Record<string, unknown>
): Promise<void> {
  const poolId = Amplify.getConfig().Auth?.Cognito?.userPoolId;
  const region = poolId?.match(/^([a-z]{2}(?:-[a-z]+)+-\d)_\w+$/)?.[1];
  if (!region) throw new Error('認証サービスの設定を確認してください。');
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken;
  if (
    !accessToken ||
    !String(accessToken.payload.scope ?? '')
      .split(' ')
      .includes('aws.cognito.signin.user.admin')
  ) {
    throw new Error('再ログインしてから設定を変更してください。');
  }
  const suffix = region.startsWith('cn-')
    ? 'amazonaws.com.cn'
    : 'amazonaws.com';
  const response = await fetch(`https://cognito-idp.${region}.${suffix}/`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.SetUserMFAPreference',
    },
    body: JSON.stringify({ AccessToken: accessToken.toString(), ...settings }),
  });
  if (!response.ok) {
    // Do not copy service payloads or credentials into UI errors or logs.
    throw new Error(
      '認証設定を変更できませんでした。再ログインして再試行してください。MFA必須の場合は無効化できません。'
    );
  }
}

export async function enablePasskeyMfa(): Promise<void> {
  const preference = await fetchMFAPreference();
  if (!preference.enabled?.includes('TOTP')) {
    throw new Error('認証アプリを有効にしてから再試行してください。');
  }
  // Cognito requires an additional enabled factor in this same request, even
  // when TOTP is already enabled. Preserve the user's current MFA preference.
  await setMfaPreference({
    WebAuthnMfaSettings: { Enabled: true },
    SoftwareTokenMfaSettings: {
      Enabled: true,
      PreferredMfa: preference.preferred === 'TOTP',
    },
  });
}
export const disableTotp = () =>
  setMfaPreference({
    WebAuthnMfaSettings: { Enabled: false },
    SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
  });
