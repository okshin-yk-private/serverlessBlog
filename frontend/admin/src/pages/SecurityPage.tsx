import { useEffect, useRef, useState } from 'react';
import {
  fetchMFAPreference,
  setUpTOTP,
  verifyTOTPSetup,
  updateMFAPreference,
  associateWebAuthnCredential,
  deleteWebAuthnCredential,
} from 'aws-amplify/auth';
import AdminLayout from '../components/AdminLayout';
import { TotpForm } from '../components/TotpForm';
import { useAuth } from '../hooks/useAuth';
import type { TotpChallenge } from '../contexts/AuthContext';
import {
  listPasskeys,
  enablePasskeyMfa,
  disableTotp,
  type Passkey,
} from '../api/security';

type Confirmation = { kind: 'keys'; keys: Passkey[] } | { kind: 'totp' };

export default function SecurityPage() {
  const { user } = useAuth();
  const passkeysSupported = import.meta.env.VITE_ENABLE_PASSKEY === 'true';
  // Unknown configuration must never offer disabling mandatory MFA.
  const mfaRequired = import.meta.env.VITE_MFA_REQUIRED !== 'false';
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [challenge, setChallenge] = useState<TotpChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function readSettings() {
    const [preference, credentials] = await Promise.all([
      fetchMFAPreference(),
      passkeysSupported ? listPasskeys() : Promise.resolve([]),
    ]);
    return { totp: preference.enabled?.includes('TOTP') ?? false, credentials };
  }
  function applySettings(settings: Awaited<ReturnType<typeof readSettings>>) {
    setEnabled(settings.totp);
    setKeys(settings.credentials);
    setLoaded(true);
  }
  useEffect(() => {
    let active = true;
    readSettings()
      .then((settings) => {
        if (active) applySettings(settings);
      })
      .catch(() => {
        if (active)
          setError(
            '認証設定を取得できませんでした。再ログインしてから開き直してください。'
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Build-time policy is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch {
      setError(
        '設定変更を完了できませんでした。登録済みのパスキーを確認し、再試行してください。'
      );
    } finally {
      try {
        applySettings(await readSettings());
      } catch {
        setLoaded(false);
        setError(
          '最新の認証設定を取得できませんでした。ページを開き直してください。'
        );
      }
      pending.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  }

  async function startSetup() {
    await run(async () => {
      const setup = await setUpTOTP();
      setChallenge({
        kind: 'setup',
        sharedSecret: setup.sharedSecret,
        setupUri: setup
          .getSetupUri('Bone of my fallacy', user?.email)
          .toString(),
      });
    });
  }
  async function enablePasskey(register: boolean) {
    await run(async () => {
      const current = await fetchMFAPreference();
      if (!current.enabled?.includes('TOTP')) throw new Error('TOTP required');
      if (register) await associateWebAuthnCredential();
      await enablePasskeyMfa();
      setMessage(
        'パスキーのMFA利用を有効にしました。ログアウト後、パスキーでログインできることを確認してください。'
      );
    });
  }
  async function confirmChange() {
    if (!confirmation) return;
    await run(async () => {
      const current = await readSettings();
      if (confirmation.kind === 'totp') {
        if (mfaRequired || current.credentials.length > 0)
          throw new Error('MFA required');
        await disableTotp();
        setMessage('認証アプリをOFFにしました。');
      } else {
        if (!current.totp || confirmation.keys.some((key) => !key.credentialId))
          throw new Error('TOTP required');
        for (const key of confirmation.keys) {
          await deleteWebAuthnCredential({ credentialId: key.credentialId! });
        }
        // Disabling WebAuthnMfaSettings alone does not disable passkey login.
        // Removing credentials does. Keep TOTP and its preference intact.
        setMessage(
          '選択したパスキーを削除しました。認証アプリは引き続き利用できます。'
        );
      }
    });
  }

  const disabled = busy || !loaded || !!challenge || !!confirmation;
  const cannotDisableTotp = mfaRequired || keys.length > 0;
  return (
    <AdminLayout title="Security" subtitle="Account">
      <div className="space-y-8" style={{ maxWidth: 640 }}>
        <p>
          通常はパスキーでログインします。パスキーを使えないときは、パスワードと認証アプリのコードを使えます。
        </p>
        {loading && <p>確認中...</p>}
        {error && (
          <div role="alert" className="admin-alert admin-alert-error">
            {error}
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {passkeysSupported && !loading && (
          <section className="space-y-4" aria-labelledby="passkey-title">
            <h2 id="passkey-title">パスキー</h2>
            <p>
              {keys.length > 0
                ? `${keys.length}件のパスキーが登録されています。`
                : 'パスキーは未登録です。'}
            </p>
            <p>端末の指紋・顔認証やPIN、1Passwordなどで認証します。</p>
            {!enabled && (
              <p>
                先に認証アプリを有効にしてください。パスキーの代替手段として必要です。
              </p>
            )}
            <button
              className="admin-btn admin-btn-primary"
              type="button"
              disabled={disabled || !enabled}
              onClick={() => enablePasskey(true)}
            >
              {keys.length ? 'パスキーを追加する' : 'パスキーを登録する'}
            </button>
            {keys.length > 0 && (
              <>
                <ul className="space-y-4">
                  {keys.map((key, index) => (
                    <li key={key.credentialId ?? index}>
                      <span>
                        {key.friendlyCredentialName || `パスキー ${index + 1}`}
                      </span>
                      {key.createdAt && (
                        <span>
                          （{key.createdAt.toLocaleDateString('ja-JP')} 登録）
                        </span>
                      )}
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={disabled || !enabled || !key.credentialId}
                        aria-label={`${key.friendlyCredentialName || `パスキー ${index + 1}`}を削除`}
                        onClick={() =>
                          setConfirmation({ kind: 'keys', keys: [key] })
                        }
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
                <p>
                  登録後に有効化が完了しなかった場合は、次のボタンで利用設定を再実行できます。
                </p>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={disabled || !enabled}
                  onClick={() => enablePasskey(false)}
                >
                  登録済みパスキーの利用を有効にする
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={
                    disabled ||
                    !enabled ||
                    keys.some((key) => !key.credentialId)
                  }
                  onClick={() => setConfirmation({ kind: 'keys', keys })}
                >
                  パスキーをすべて削除してOFFにする
                </button>
              </>
            )}
          </section>
        )}
        {!loading && (
          <section className="space-y-4" aria-labelledby="totp-title">
            <h2 id="totp-title">認証アプリによる二要素認証</h2>
            {enabled ? (
              <>
                <p role="status">認証アプリによる二要素認証は有効です。</p>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={disabled || cannotDisableTotp}
                  onClick={() => setConfirmation({ kind: 'totp' })}
                >
                  認証アプリをOFFにする
                </button>
                {mfaRequired ? (
                  <p>MFAが必須のため、認証アプリをOFFにはできません。</p>
                ) : keys.length > 0 ? (
                  <p>
                    パスキー利用中は認証アプリが必要です。OFFにするには先にパスキーを削除してください。
                  </p>
                ) : null}
              </>
            ) : challenge ? (
              <TotpForm
                challenge={challenge}
                cancelLabel="登録を中止する"
                onCancel={() => setChallenge(null)}
                onConfirm={async (code) => {
                  await verifyTOTPSetup({ code });
                  await updateMFAPreference({ totp: 'PREFERRED' });
                  setEnabled(true);
                  setChallenge(null);
                  try {
                    applySettings(await readSettings());
                  } catch {
                    setLoaded(false);
                    setError(
                      '認証アプリの登録は完了しましたが、最新の設定を取得できませんでした。ページを開き直してください。'
                    );
                  }
                }}
              />
            ) : (
              <>
                <p>
                  パスワードに加えて認証アプリのコードでログインします。登録後は認証アプリが必要です。
                </p>
                <button
                  className="admin-btn admin-btn-primary"
                  type="button"
                  disabled={disabled}
                  onClick={startSetup}
                >
                  認証アプリを登録する
                </button>
              </>
            )}
          </section>
        )}
        {confirmation && (
          <section
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="security-confirm-title"
            className="space-y-4"
          >
            <h2 id="security-confirm-title">
              {confirmation.kind === 'keys'
                ? 'パスキーを削除しますか？'
                : '認証アプリをOFFにしますか？'}
            </h2>
            <p>
              {confirmation.kind === 'keys'
                ? '削除したパスキーはこのサイトで使えなくなります。再利用するには再登録が必要です。パスワードと認証アプリは引き続き利用できます。'
                : 'パスワードだけでログインできる状態になります。'}
            </p>
            <button type="button" disabled={busy} onClick={confirmChange}>
              {confirmation.kind === 'keys' ? '削除を実行する' : 'OFFにする'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              キャンセル
            </button>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
