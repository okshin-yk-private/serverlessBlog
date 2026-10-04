import { describe, it, expect } from 'vitest';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { TiptapEditor } from './TiptapEditor';
import { TOOLBAR_SHORTCUTS, type Shortcut } from './shortcuts';

async function getEditor() {
  await waitFor(() => {
    if (!window.__tiptapEditor) {
      throw new Error('editor not exposed');
    }
  });
  return window.__tiptapEditor!;
}

// jsdom reports an empty navigator.platform, so ProseMirror maps Mod to Ctrl.
function press(editor: Editor, keys: Shortcut) {
  const main = keys[keys.length - 1];
  const shiftKey = keys.includes('Shift');
  fireEvent.keyDown(editor.view.dom, {
    key: shiftKey ? main.toUpperCase() : main.toLowerCase(),
    keyCode: main.toUpperCase().charCodeAt(0),
    ctrlKey: keys.includes('Mod'),
    altKey: keys.includes('Alt'),
    shiftKey,
  });
}

function selectFirstWord(editor: Editor) {
  editor.commands.setTextSelection({ from: 1, to: 6 });
}

type Case = {
  name: keyof typeof TOOLBAR_SHORTCUTS;
  setup?: (editor: Editor) => void;
  check: (editor: Editor) => boolean;
};

const cases: Case[] = [
  {
    name: 'paragraph',
    setup: (e) => e.commands.setHeading({ level: 2 }),
    check: (e) => e.isActive('paragraph'),
  },
  { name: 'h2', check: (e) => e.isActive('heading', { level: 2 }) },
  { name: 'h3', check: (e) => e.isActive('heading', { level: 3 }) },
  { name: 'h4', check: (e) => e.isActive('heading', { level: 4 }) },
  { name: 'bold', setup: selectFirstWord, check: (e) => e.isActive('bold') },
  {
    name: 'italic',
    setup: selectFirstWord,
    check: (e) => e.isActive('italic'),
  },
  {
    name: 'strike',
    setup: selectFirstWord,
    check: (e) => e.isActive('strike'),
  },
  { name: 'code', setup: selectFirstWord, check: (e) => e.isActive('code') },
  { name: 'bulletList', check: (e) => e.isActive('bulletList') },
  { name: 'orderedList', check: (e) => e.isActive('orderedList') },
  { name: 'blockquote', check: (e) => e.isActive('blockquote') },
  { name: 'codeBlock', check: (e) => e.isActive('codeBlock') },
  {
    name: 'undo',
    setup: (e) => e.commands.insertContentAt(6, ' world'),
    check: (e) => e.getText() === 'hello',
  },
  {
    name: 'redo',
    setup: (e) => {
      e.commands.insertContentAt(6, ' world');
      e.commands.undo();
    },
    check: (e) => e.getText() === 'hello world',
  },
];

describe('TiptapToolbar shortcuts', () => {
  it('表示しているショートカットはすべて検証対象になっている', () => {
    expect(cases.map((c) => c.name).sort()).toEqual(
      Object.keys(TOOLBAR_SHORTCUTS).sort()
    );
  });

  it.each(cases)(
    '$name のショートカットが実際に効く',
    async ({ name, setup, check }) => {
      render(<TiptapEditor value="hello" onChange={() => {}} />);
      const editor = await getEditor();

      act(() => {
        editor.commands.setTextSelection(3);
        setup?.(editor);
      });
      expect(check(editor)).toBe(false);

      act(() => press(editor, TOOLBAR_SHORTCUTS[name]));
      expect(check(editor)).toBe(true);
    }
  );

  it('ショートカットをツールチップと aria-keyshortcuts に出す', () => {
    render(<TiptapEditor value="" onChange={() => {}} />);
    const bold = screen.getByTestId('toolbar-bold');
    expect(bold).toHaveAttribute('title', '太字 (Ctrl+B)');
    expect(bold).toHaveAttribute('aria-keyshortcuts', 'Control+B');
    expect(bold).toHaveAccessibleName('太字');
  });

  it('ショートカットの無い操作はヒントだけを出す', () => {
    render(<TiptapEditor value="" onChange={() => {}} />);
    const hr = screen.getByTestId('toolbar-hr');
    expect(hr).toHaveAttribute('title', '区切り線 (行頭で ---)');
    expect(hr).not.toHaveAttribute('aria-keyshortcuts');
    expect(screen.getByTestId('toolbar-link')).toHaveAttribute(
      'title',
      'リンク'
    );
  });
});
