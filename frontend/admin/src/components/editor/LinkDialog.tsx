import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { isValidLinkUrl } from './linkUrl';

export interface LinkValues {
  text: string;
  href: string;
  button: boolean;
}

interface LinkDialogProps {
  initial: LinkValues;
  existing: boolean;
  onApply: (values: LinkValues) => void;
  onCancel: () => void;
  onRemove: () => void;
}

export function LinkDialog({
  initial,
  existing,
  onApply,
  onCancel,
  onRemove,
}: LinkDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    textRef.current?.focus();
    return () => dialog.close();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!values.text.trim()) {
      setError('表示テキストを入力してください。');
      textRef.current?.focus();
      return;
    }
    const href = values.href.trim();
    if (!isValidLinkUrl(href)) {
      setError(
        'URLは https:// または http:// で始まる形式で入力してください。/posts/… や #見出し も使用できます。'
      );
      return;
    }
    onApply({ ...values, href });
  };

  // A portal avoids nesting this form in the article's save form. Native dialog
  // supplies modal focus containment and Escape behavior on desktop and mobile.
  return createPortal(
    <dialog
      ref={dialogRef}
      className="admin-link-dialog"
      data-testid="link-dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled])'
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form className="admin-link-dialog-content" onSubmit={submit}>
        <h2 id={`${id}-title`}>{existing ? 'リンクを編集' : 'リンクを挿入'}</h2>
        <label htmlFor={`${id}-text`}>表示テキスト</label>
        <input
          ref={textRef}
          id={`${id}-text`}
          className="admin-input"
          data-testid="link-dialog-text"
          value={values.text}
          onChange={(event) => {
            setValues({ ...values, text: event.target.value });
            setError('');
          }}
          placeholder="Amazonで商品を見る"
        />
        <label htmlFor={`${id}-url`}>URL</label>
        <input
          id={`${id}-url`}
          className="admin-input"
          data-testid="link-dialog-url"
          value={values.href}
          onChange={(event) => {
            setValues({ ...values, href: event.target.value });
            setError('');
          }}
          placeholder="https://…"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <label htmlFor={`${id}-style`}>表示方法</label>
        <select
          id={`${id}-style`}
          className="admin-input"
          data-testid="link-dialog-style"
          value={values.button ? 'button' : 'text'}
          onChange={(event) =>
            setValues({ ...values, button: event.target.value === 'button' })
          }
        >
          <option value="text">本文中のリンク</option>
          <option value="button">枠付きのリンクボタン</option>
        </select>
        <div
          className="post-content admin-link-preview"
          aria-label="リンクの表示例"
        >
          <span
            className={
              values.button ? 'article-link-button' : 'admin-link-text-preview'
            }
          >
            {values.text || '表示テキスト'}
          </span>
        </div>
        {error && (
          <p id={`${id}-error`} className="admin-link-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-link-dialog-actions">
          {existing && (
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              data-testid="link-dialog-remove"
              onClick={onRemove}
            >
              リンクを解除
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            data-testid="link-dialog-cancel"
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            data-testid="link-dialog-submit"
          >
            {existing ? '変更する' : '挿入する'}
          </button>
        </div>
      </form>
    </dialog>,
    document.body
  );
}
