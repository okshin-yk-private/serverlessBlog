import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { isValidLinkUrl } from './linkUrl';

export interface LinkValues {
  text: string;
  href: string;
  button: boolean;
}

// Shop presets fill the usual affiliate label; その他 leaves it to the author.
const LABEL_PRESETS = [
  { id: 'amazon', name: 'Amazon', text: 'Amazonで商品を見る' },
  { id: 'rakuten', name: '楽天市場', text: '楽天市場で商品を見る' },
  {
    id: 'yahoo',
    name: 'Yahoo!ショッピング',
    text: 'Yahoo!ショッピングで商品を見る',
  },
] as const;
const OTHER_PRESET = 'other';
type PresetId = (typeof LABEL_PRESETS)[number]['id'] | typeof OTHER_PRESET;

const presetFor = (text: string): PresetId | null =>
  LABEL_PRESETS.find((preset) => preset.text === text)?.id ??
  (text ? OTHER_PRESET : null);

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
  const urlRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(initial);
  const [preset, setPreset] = useState(() => presetFor(initial.text));
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

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setError('');
    const chosen = LABEL_PRESETS.find((p) => p.id === id);
    if (chosen) {
      setValues({ ...values, text: chosen.text });
      urlRef.current?.focus();
      return;
    }
    // Clear only a label the author has not customized.
    if (presetFor(values.text) !== OTHER_PRESET) {
      setValues({ ...values, text: '' });
    }
    textRef.current?.focus();
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
        <div
          className="admin-link-presets"
          role="group"
          aria-label="表示テキストの定型文"
        >
          {[...LABEL_PRESETS, { id: OTHER_PRESET, name: 'その他' }].map(
            (option) => (
              <button
                key={option.id}
                type="button"
                className="admin-link-preset"
                data-testid={`link-dialog-preset-${option.id}`}
                aria-pressed={preset === option.id}
                onClick={() => choosePreset(option.id)}
              >
                {option.name}
              </button>
            )
          )}
        </div>
        <input
          ref={textRef}
          id={`${id}-text`}
          className="admin-input"
          data-testid="link-dialog-text"
          value={values.text}
          onChange={(event) => {
            setValues({ ...values, text: event.target.value });
            // Typing past a preset label turns it into free text (その他).
            setPreset(
              presetFor(event.target.value) ??
                (preset === null ? null : OTHER_PRESET)
            );
            setError('');
          }}
          placeholder="Amazonで商品を見る"
        />
        <label htmlFor={`${id}-url`}>URL</label>
        <input
          ref={urlRef}
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
