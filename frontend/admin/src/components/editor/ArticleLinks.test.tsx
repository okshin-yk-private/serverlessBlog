import { beforeAll, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TiptapEditor } from './TiptapEditor';
import { isValidLinkUrl } from './linkUrl';
import fixtures from '../../../../../tests/fixtures/article-links.json';

// jsdom lacks the native dialog methods; actual focus containment/Escape behavior
// is covered by the browser suite.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

async function mount(value = '') {
  render(<TiptapEditor value={value} onChange={() => {}} />);
  await waitFor(() => expect(window.__tiptapEditor).toBeDefined());
  return window.__tiptapEditor!;
}

async function fillLink(text: string, href: string, button = false) {
  const user = userEvent.setup();
  await user.clear(screen.getByTestId('link-dialog-text'));
  await user.type(screen.getByTestId('link-dialog-text'), text);
  await user.clear(screen.getByTestId('link-dialog-url'));
  await user.type(screen.getByTestId('link-dialog-url'), href);
  await user.selectOptions(
    screen.getByTestId('link-dialog-style'),
    button ? 'button' : 'text'
  );
  await user.click(screen.getByTestId('link-dialog-submit'));
}

const getMarkdown = (editor: NonNullable<Window['__tiptapEditor']>) =>
  editor.storage.markdown.getMarkdown() as string;

describe('article link Markdown contract', () => {
  it.each(fixtures)('$name survives editing and reloading', async (fixture) => {
    const editor = await mount(fixture.markdown);
    const assertLink = () => {
      const el = document.createElement('div');
      el.innerHTML = editor.getHTML();
      const a = el.querySelector('a')!;
      expect(a).not.toBeNull();
      expect(a.getAttribute('href')).toBe(fixture.href);
      expect(a.textContent).toBe(fixture.text);
      expect(a.classList.contains('article-link-button')).toBe(fixture.button);
      expect(a.getAttribute('rel')).toBe('nofollow noreferrer');
      expect(a.hasAttribute('target')).toBe(false);
    };
    assertLink();
    const markdown = getMarkdown(editor);
    act(() => editor.commands.setContent(markdown));
    assertLink();
  });
});

describe('article link dialog', () => {
  it('inserts a labeled link without a selection, then ends the link before typing', async () => {
    const user = userEvent.setup();
    const editor = await mount();
    await user.click(screen.getByTestId('toolbar-link'));
    await fillLink(
      'Amazonで商品を見る',
      'https://www.amazon.co.jp/dp/example?ref=article'
    );
    expect(screen.queryByTestId('link-dialog')).not.toBeInTheDocument();
    expect(getMarkdown(editor)).toContain(
      '[Amazonで商品を見る](https://www.amazon.co.jp/dp/example?ref=article)'
    );
    act(() => editor.commands.insertContent(' 続き'));
    expect(editor.getHTML()).toContain('</a> 続き');
  });

  it('inserts a button and preserves it in Markdown and preview HTML', async () => {
    const user = userEvent.setup();
    const editor = await mount();
    await user.click(screen.getByTestId('toolbar-link'));
    await fillLink(
      '価格.comで価格を比較する',
      'https://kakaku.com/item/example/',
      true
    );
    expect(getMarkdown(editor)).toContain('){.link-button}');
    expect(editor.getHTML()).toContain('class="article-link-button"');
    const md = getMarkdown(editor);
    act(() => editor.commands.setContent(md));
    expect(editor.getHTML()).toContain('class="article-link-button"');
    expect(editor.getText()).toBe('価格.comで価格を比較する');
  });

  it('edits the whole link from its middle, switches style, and keeps surrounding text', async () => {
    const user = userEvent.setup();
    const editor = await mount(
      '前 [古い表示](https://example.com/old){.link-button} 後'
    );
    act(() => editor.commands.setTextSelection(5));
    await user.click(screen.getByTestId('toolbar-link'));
    expect(screen.getByTestId('link-dialog-text')).toHaveValue('古い表示');
    await fillLink('新しい表示', 'https://example.com/new');
    expect(getMarkdown(editor)).toBe(
      '前 [新しい表示](https://example.com/new) 後'
    );
  });

  it('keeps bold and italic when changing only the URL', async () => {
    const user = userEvent.setup();
    const editor = await mount('[**太字**と*斜体*](https://example.com/old)');
    act(() => editor.commands.setTextSelection(2));
    await user.click(screen.getByTestId('toolbar-link'));
    await fillLink('太字と斜体', 'https://example.com/new', true);
    expect(editor.getHTML()).toContain('<strong>');
    expect(editor.getHTML()).toContain('<em>');
    expect(getMarkdown(editor)).toContain('https://example.com/new');
  });

  it('removes a link without deleting its label', async () => {
    const user = userEvent.setup();
    const editor = await mount('[表示](https://example.com){.link-button}');
    act(() => editor.commands.setTextSelection(2));
    await user.click(screen.getByTestId('toolbar-link'));
    await user.click(screen.getByTestId('link-dialog-remove'));
    expect(getMarkdown(editor)).toBe('表示');
  });

  it('rejects unsafe URLs without changing the document, and cancel restores editor focus', async () => {
    const user = userEvent.setup();
    const editor = await mount('変更しない');
    await user.click(screen.getByTestId('toolbar-link'));
    await fillLink('表示', 'javascript:alert(1)');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(getMarkdown(editor)).toBe('変更しない');
    await user.clear(screen.getByTestId('link-dialog-url'));
    await user.type(
      screen.getByTestId('link-dialog-url'),
      'https://example.com'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('link-dialog-cancel'));
    expect(screen.queryByTestId('link-dialog')).not.toBeInTheDocument();
  });
});

describe('link URL input validation', () => {
  it.each([
    'https://www.amazon.co.jp/dp/x?ref=one&tag=two',
    'HTTP://example.com/a',
    '/posts/one',
    '../about',
    './next',
    '#見出し',
  ])('allows %s', (url) => expect(isValidLinkUrl(url)).toBe(true));
  it.each([
    '',
    'https://',
    'https:///evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,test',
    'mailto:test@example.com',
    'https://user:pass@example.com',
    'https://example.com/\nnext',
  ])('rejects %s', (url) => expect(isValidLinkUrl(url)).toBe(false));
});
