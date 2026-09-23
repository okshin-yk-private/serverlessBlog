import { test, expect } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';

const credentialId = Buffer.from('test-passkey').toString('base64');
const credentialIdUrl = Buffer.from('test-passkey').toString('base64url');
const challenge = Buffer.alloc(32, 7).toString('base64url');
function token(use: string) {
  const payload = {
    sub: 'fixture-user',
    'cognito:username': 'fixture-user',
    username: 'fixture-user',
    email: 'admin@example.com',
    token_use: use,
    scope: 'aws.cognito.signin.user.admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  return `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test-fixture`;
}

test('real Amplify and virtual authenticator sign in, then manage registered passkeys', async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }
  );
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId,
      isResidentCredential: true,
      rpId: 'localhost',
      privateKey: privateKey
        .export({ type: 'pkcs8', format: 'der' })
        .toString('base64'),
      userHandle: Buffer.from('fixture-user').toString('base64'),
      signCount: 0,
    },
  });
  const calls: string[] = [];
  let deleted = false;
  let addedId: string | undefined;
  await page.route(
    'https://cognito-idp.ap-northeast-1.amazonaws.com/**',
    async (route) => {
      const request = route.request();
      const operation =
        request.headers()['x-amz-target']?.split('.').at(-1) ?? '';
      calls.push(operation);
      const input = request.postDataJSON();
      let body: unknown;
      if (operation === 'InitiateAuth') {
        expect(input.AuthFlow).toBe('USER_AUTH');
        expect(input.AuthParameters.PREFERRED_CHALLENGE).toBe('WEB_AUTHN');
        body = {
          ChallengeName: 'WEB_AUTHN',
          Session: 'fixture-session',
          ChallengeParameters: {
            USERNAME: 'fixture-user',
            CREDENTIAL_REQUEST_OPTIONS: JSON.stringify({
              challenge,
              rpId: 'localhost',
              userVerification: 'required',
              allowCredentials: [{ type: 'public-key', id: credentialIdUrl }],
            }),
          },
        };
      } else if (operation === 'RespondToAuthChallenge') {
        expect(input.ChallengeName).toBe('WEB_AUTHN');
        expect(
          JSON.parse(input.ChallengeResponses.CREDENTIAL).response.signature
        ).toBeTruthy();
        body = {
          AuthenticationResult: {
            IdToken: token('id'),
            AccessToken: token('access'),
            RefreshToken: 'fixture-refresh',
            ExpiresIn: 3600,
            TokenType: 'Bearer',
          },
        };
      } else if (operation === 'GetUser') {
        body = {
          Username: 'fixture-user',
          UserAttributes: [{ Name: 'sub', Value: 'fixture-user' }],
          UserMFASettingList: ['SOFTWARE_TOKEN_MFA'],
          PreferredMfaSetting: 'SOFTWARE_TOKEN_MFA',
        };
      } else if (operation === 'ListWebAuthnCredentials') {
        body = {
          Credentials: deleted
            ? []
            : [
                {
                  CredentialId: credentialIdUrl,
                  FriendlyCredentialName: 'Test passkey',
                  RelyingPartyId: 'localhost',
                  CreatedAt: Math.floor(Date.now() / 1000),
                  AuthenticatorTransports: ['internal'],
                },
              ],
        };
      } else if (operation === 'StartWebAuthnRegistration') {
        body = {
          CredentialCreationOptions: {
            challenge,
            rp: { id: 'localhost', name: 'Test Blog' },
            user: {
              id: Buffer.from('fixture-user').toString('base64url'),
              name: 'admin@example.com',
              displayName: 'Admin',
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: {
              residentKey: 'required',
              userVerification: 'required',
            },
            attestation: 'none',
          },
        };
      } else if (operation === 'CompleteWebAuthnRegistration') {
        expect(input.Credential.response.attestationObject).toBeTruthy();
        addedId = input.Credential.id;
        body = {};
      } else if (operation === 'SetUserMFAPreference') {
        expect(input.WebAuthnMfaSettings).toEqual({ Enabled: true });
        body = {};
      } else if (operation === 'DeleteWebAuthnCredential') {
        expect([credentialIdUrl, addedId]).toContain(input.CredentialId);
        if (input.CredentialId === credentialIdUrl) deleted = true;
        else addedId = undefined;
        body = {};
      } else {
        throw new Error(`Unexpected Cognito operation ${operation}`);
      }
      if (operation === 'ListWebAuthnCredentials' && addedId) {
        (body as { Credentials: unknown[] }).Credentials.push({
          CredentialId: addedId,
          FriendlyCredentialName: 'Added passkey',
          RelyingPartyId: 'localhost',
          CreatedAt: Math.floor(Date.now() / 1000),
        });
      }
      await route.fulfill({
        contentType: 'application/x-amz-json-1.1',
        body: JSON.stringify(body),
      });
    }
  );
  await page.route('http://localhost:4317/api/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ posts: [], total: 0, categories: [] }),
    })
  );
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'パスキーでログイン', exact: true })
  ).toBeVisible();
  await page.getByLabel('メールアドレス').fill('admin@example.com');
  await page
    .getByRole('button', { name: 'パスキーでログイン', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/security');
  await expect(page.getByText('Test passkey', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '認証アプリをOFFにする' })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'パスキーを追加する' }).click();
  await expect(page.getByText('Added passkey', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/パスキーのMFA利用を有効にしました/)
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'パスキーをすべて削除してOFFにする' })
    .click();
  expect(calls).not.toContain('DeleteWebAuthnCredential');
  await page.getByRole('button', { name: '削除を実行する' }).click();
  await expect(page.getByText('パスキーは未登録です。')).toBeVisible();
  expect(calls).toContain('DeleteWebAuthnCredential');
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});

test('unavailable passkey keeps the user logged out and offers password fallback', async ({
  page,
}) => {
  await page.route(
    'https://cognito-idp.ap-northeast-1.amazonaws.com/**',
    (route) =>
      route.fulfill({
        contentType: 'application/x-amz-json-1.1',
        body: JSON.stringify({
          ChallengeName: 'SELECT_CHALLENGE',
          Session: 'fixture-session',
          AvailableChallenges: ['PASSWORD_SRP'],
          ChallengeParameters: { USERNAME: 'fixture-user' },
        }),
      })
  );
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill('admin@example.com');
  await page
    .getByRole('button', { name: 'パスキーでログイン', exact: true })
    .click();
  await expect(page.getByTestId('error-message')).toContainText(
    'パスキーでの認証が完了しませんでした'
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'パスワードでログインする' }).click();
  await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
});
