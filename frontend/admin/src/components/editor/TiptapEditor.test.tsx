import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { TiptapEditor, type TiptapEditorHandle } from './TiptapEditor';

async function getEditor() {
  await waitFor(() => {
    if (!window.__tiptapEditor) {
      throw new Error('editor not exposed');
    }
  });
  return window.__tiptapEditor!;
}

describe('TiptapEditor', () => {
  it('contenteditable と toolbar をレンダリングする', () => {
    render(<TiptapEditor value="" onChange={() => {}} />);
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
    expect(screen.getByTestId('tiptap-toolbar')).toBeInTheDocument();
    const editable = screen
      .getByTestId('tiptap-editor')
      .querySelector('[contenteditable]');
    expect(editable).not.toBeNull();
  });

  it('初期 markdown 値が編集領域に反映される (H2-H4 のみ有効)', async () => {
    render(<TiptapEditor value={'## 見出し\n\n本文'} onChange={() => {}} />);
    await waitFor(() => {
      const html = screen.getByTestId('tiptap-editor').innerHTML;
      expect(html).toContain('<h2>見出し</h2>');
      expect(html).toContain('本文');
    });
  });

  it('## 以外の H1 は段落として扱われる (Heading.levels=[2,3,4])', async () => {
    render(
      <TiptapEditor value={'# H1 になる予定だった'} onChange={() => {}} />
    );
    await waitFor(() => {
      const html = screen.getByTestId('tiptap-editor').innerHTML;
      // h1 タグでは出ない
      expect(html).not.toMatch(/<h1[ >]/);
    });
  });

  it('value が外部から変わると editor の内容が更新される', async () => {
    const { rerender } = render(<TiptapEditor value="" onChange={() => {}} />);
    await getEditor();

    rerender(<TiptapEditor value="# 後から流入" onChange={() => {}} />);

    await waitFor(() => {
      const html = screen.getByTestId('tiptap-editor').innerHTML;
      expect(html).toContain('後から流入');
    });
  });

  it('onChange が markdown を返す', async () => {
    const onChange = vi.fn();
    render(<TiptapEditor value="" onChange={onChange} />);
    const editor = await getEditor();

    act(() => {
      editor.commands.setContent('hello world');
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(typeof last).toBe('string');
    expect(last).toContain('hello world');
  });

  it('mindmap マーカーが round-trip で原文一致する', async () => {
    const marker =
      '本文1\n\n{{mindmap:550e8400-e29b-41d4-a716-446655440000}}\n\n本文2';
    render(<TiptapEditor value={marker} onChange={() => {}} />);
    const editor = await getEditor();

    await waitFor(() => {
      const md = editor.storage.markdown.getMarkdown() as string;
      expect(md).toContain('{{mindmap:550e8400-e29b-41d4-a716-446655440000}}');
      expect(md).toContain('本文1');
      expect(md).toContain('本文2');
    });
  });

  it('toolbar の太字ボタンで bold が適用される', async () => {
    const user = userEvent.setup();
    render(<TiptapEditor value="hello" onChange={() => {}} />);
    const editor = await getEditor();

    // 全文選択して bold をトグル
    act(() => {
      editor.commands.focus();
      editor.commands.selectAll();
    });
    await user.click(screen.getByTestId('toolbar-bold'));

    await waitFor(() => {
      const md = editor.storage.markdown.getMarkdown() as string;
      expect(md).toMatch(/\*\*hello\*\*/);
    });
  });

  it('placeholder 文言が表示される', () => {
    render(
      <TiptapEditor value="" onChange={() => {}} placeholder="ここに書く" />
    );
    // Placeholder extension renders a `data-placeholder` on empty paragraph
    const empty = screen
      .getByTestId('tiptap-editor')
      .querySelector('[data-placeholder]');
    expect(empty?.getAttribute('data-placeholder')).toBe('ここに書く');
  });

  it('ref.getEditor() で Editor インスタンスを取得できる', async () => {
    const ref = createRef<TiptapEditorHandle>();
    render(<TiptapEditor ref={ref} value="x" onChange={() => {}} />);
    await waitFor(() => {
      expect(ref.current?.getEditor()).not.toBeNull();
    });
  });

  it('disabled で editable=false になる', async () => {
    const { rerender } = render(<TiptapEditor value="x" onChange={() => {}} />);
    const editor = await getEditor();
    expect(editor.isEditable).toBe(true);

    rerender(<TiptapEditor value="x" onChange={() => {}} disabled />);
    await waitFor(() => {
      expect(editor.isEditable).toBe(false);
    });
  });
});
