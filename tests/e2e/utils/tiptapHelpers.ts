import { Locator, Page, expect } from '@playwright/test';

/**
 * Tiptap (ProseMirror) エディタ操作ヘルパー
 *
 * 通常の <textarea> と異なり、Tiptap は contenteditable な ProseMirror ノード上で
 * 動くため `page.fill()` が効かない。本ヘルパーは Tiptap エディタへの入力 / 内容取得 /
 * 画像ペースト・ドロップなど、E2E テストで頻出する操作を統一インタフェースで提供する。
 *
 * 前提: エディタ DOM のラッパに data-testid="tiptap-editor" が付与され、
 * 内部の contenteditable 要素が role="textbox" を持つこと。
 */

const EDITOR_TESTID = 'tiptap-editor';
const EDITOR_SELECTOR = `[data-testid="${EDITOR_TESTID}"] [contenteditable="true"]`;

/** Tiptap エディタの contenteditable 要素を返す。 */
export function getTiptapEditor(page: Page): Locator {
  return page.locator(EDITOR_SELECTOR);
}

/** エディタにフォーカスし、key sequence でテキストを入力する。 */
export async function typeIntoEditor(page: Page, text: string): Promise<void> {
  const editor = getTiptapEditor(page);
  await editor.click();
  await editor.pressSequentially(text);
}

/** エディタの内容を ProseMirror 経由で完全に置換する (テスト初期状態セットアップ用)。 */
export async function setEditorContent(
  page: Page,
  markdown: string
): Promise<void> {
  await page.evaluate(
    ({ md, sel }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error('Tiptap editor not found');
      const editor =
        (
          el as unknown as {
            __tiptapEditor?: {
              commands: { setContent: (md: string) => boolean };
            };
          }
        ).__tiptapEditor ??
        (
          window as unknown as {
            __tiptapEditor?: {
              commands: { setContent: (md: string) => boolean };
            };
          }
        ).__tiptapEditor;
      if (!editor) {
        throw new Error(
          'Tiptap editor instance not exposed on window. Set window.__tiptapEditor in test mode.'
        );
      }
      editor.commands.setContent(md);
    },
    { md: markdown, sel: EDITOR_SELECTOR }
  );
}

/**
 * 現在のエディタ内容を Markdown として取得する。
 * tiptap-markdown プラグインが editor.storage.markdown.getMarkdown() を提供する想定。
 */
export async function getEditorMarkdown(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __tiptapEditor?: {
          storage: { markdown?: { getMarkdown: () => string } };
          getText: () => string;
        };
      }
    ).__tiptapEditor;
    if (!editor)
      throw new Error('Tiptap editor instance not exposed on window');
    return editor.storage.markdown?.getMarkdown() ?? editor.getText();
  });
}

/** 現在のエディタ内容のプレーンテキストを取得する。 */
export async function getEditorText(page: Page): Promise<string> {
  return await getTiptapEditor(page).innerText();
}

/** Markdown 内容が指定の文字列を含むことをアサート。 */
export async function expectEditorMarkdownToContain(
  page: Page,
  needle: string
): Promise<void> {
  const md = await getEditorMarkdown(page);
  expect(
    md,
    `editor markdown should contain ${JSON.stringify(needle)}`
  ).toContain(needle);
}

/**
 * クリップボードから画像をペーストするのと同等のイベントを dispatch する。
 *
 * 実際のクリップボード API は Playwright のヘッドレス環境で扱いづらいため、
 * DataTransfer を組み立てて `paste` イベントを直接発火させる。
 */
export async function pasteImage(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  const base64 = file.buffer.toString('base64');
  await page.evaluate(
    ({ name, mime, b64, sel }) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const f = new File([bytes], name, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(f);
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) throw new Error('Tiptap editor not found');
      editor.focus();
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);
    },
    { name: file.name, mime: file.mimeType, b64: base64, sel: EDITOR_SELECTOR }
  );
}

/**
 * エディタに画像ファイルをドロップする (ドラッグ&ドロップ操作の最終結果と等価)。
 */
export async function dropImage(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  const base64 = file.buffer.toString('base64');
  await page.evaluate(
    ({ name, mime, b64, sel }) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const f = new File([bytes], name, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(f);
      const editor = document.querySelector(sel) as HTMLElement | null;
      if (!editor) throw new Error('Tiptap editor not found');
      const rect = editor.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      } as DragEventInit;
      editor.dispatchEvent(new DragEvent('dragenter', opts));
      editor.dispatchEvent(new DragEvent('dragover', opts));
      editor.dispatchEvent(new DragEvent('drop', opts));
    },
    { name: file.name, mime: file.mimeType, b64: base64, sel: EDITOR_SELECTOR }
  );
}
