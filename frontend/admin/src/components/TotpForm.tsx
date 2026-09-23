import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import type { TotpChallenge } from '../contexts/AuthContext';

interface Props {
  challenge: TotpChallenge;
  onConfirm: (code: string) => Promise<void>;
  onCancel: () => void;
  cancelLabel?: string;
}

export function TotpForm({
  challenge,
  onConfirm,
  onCancel,
  cancelLabel = 'ログインからやり直す',
}: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const setupUri = challenge.kind === 'setup' ? challenge.setupUri : '';
  useEffect(() => {
    let active = true;
    setQr('');
    if (setupUri) {
      QRCode.toDataURL(setupUri, { width: 240, margin: 4 })
        .then((url) => {
          if (active) setQr(url);
        })
        .catch(() => {
          /* The manual setup key remains available. */
        });
    }
    return () => {
      active = false;
    };
  }, [setupUri]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(code)) {
      setError('6桁の認証コードを入力してください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(code);
    } catch {
      setError(
        '認証できませんでした。最新のコードで再試行してください。期限切れの場合はログインからやり直してください。'
      );
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {challenge.kind === 'setup' && (
        <div className="space-y-4">
          <p>
            認証アプリで QR
            コードを読み取り、表示された6桁のコードを入力してください。
          </p>
          {qr && (
            <img
              src={qr}
              alt="認証アプリ登録用 QR コード"
              width={240}
              height={240}
              style={{ maxWidth: '100%', height: 'auto', margin: 'auto' }}
            />
          )}
          <p>
            QR
            コードを読み取れない場合は、次のセットアップキーを認証アプリに手入力してください。
          </p>
          <code
            data-testid="totp-secret"
            style={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {challenge.sharedSecret}
          </code>
          <p>セットアップキーは他の人と共有しないでください。</p>
        </div>
      )}
      {error && (
        <div role="alert" className="admin-alert admin-alert-error">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="totp-code">認証コード</label>
        <input
          id="totp-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="admin-form-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          disabled={busy}
          autoFocus
          aria-invalid={!!error}
        />
      </div>
      <button
        className="admin-btn admin-btn-primary"
        type="submit"
        disabled={busy}
      >
        {busy ? '確認中...' : '認証する'}
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </button>
    </form>
  );
}
