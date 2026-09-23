import { useEffect, useState } from 'react';
import {
  fetchMFAPreference,
  setUpTOTP,
  verifyTOTPSetup,
  updateMFAPreference,
} from 'aws-amplify/auth';
import AdminLayout from '../components/AdminLayout';
import { TotpForm } from '../components/TotpForm';
import { useAuth } from '../hooks/useAuth';
import type { TotpChallenge } from '../contexts/AuthContext';

export default function SecurityPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<TotpChallenge | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMFAPreference()
      .then((preference) => {
        if (active) setEnabled(preference.enabled?.includes('TOTP') ?? false);
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
  }, []);

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      const setup = await setUpTOTP();
      setChallenge({
        kind: 'setup',
        sharedSecret: setup.sharedSecret,
        setupUri: setup
          .getSetupUri('Bone of my fallacy', user?.email)
          .toString(),
      });
    } catch {
      setError(
        '登録を開始できませんでした。再ログインしてから開き直してください。'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="Security" subtitle="Account">
      <section className="space-y-4" style={{ maxWidth: 440 }}>
        <h2>認証アプリによる二要素認証</h2>
        {loading ? (
          <p>確認中...</p>
        ) : error ? (
          <div role="alert" className="admin-alert admin-alert-error">
            {error}
          </div>
        ) : enabled ? (
          <p role="status">
            認証アプリによる二要素認証は有効です。ログアウトして、認証コードで再ログインできることを確認してください。
          </p>
        ) : challenge ? (
          <TotpForm
            challenge={challenge}
            cancelLabel="登録を中止する"
            onCancel={() => setChallenge(null)}
            onConfirm={async (code) => {
              await verifyTOTPSetup({ code });
              await updateMFAPreference({ totp: 'PREFERRED' });
              setChallenge(null);
              setEnabled(true);
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
              disabled={busy}
              onClick={startSetup}
            >
              {busy ? '準備中...' : '認証アプリを登録する'}
            </button>
          </>
        )}
      </section>
    </AdminLayout>
  );
}
