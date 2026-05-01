import type { Editor } from '@tiptap/core';
import { useCallback } from 'react';

interface TiptapToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId: string;
  ariaLabel: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  testId,
  ariaLabel,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      data-testid={testId}
      className={[
        'inline-flex items-center justify-center min-w-[32px] h-8 px-2 text-sm rounded',
        'border border-transparent',
        'hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed',
        active ? 'bg-gray-200 border-gray-300 font-semibold' : 'text-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function TiptapToolbar({
  editor,
  disabled = false,
}: TiptapToolbarProps) {
  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL を入力してください', previousUrl ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1 bg-gray-50 rounded-t-md"
        data-testid="tiptap-toolbar"
        aria-busy="true"
      />
    );
  }

  const isDisabled = disabled || !editor.isEditable;

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-2 py-1 bg-gray-50 rounded-t-md"
      data-testid="tiptap-toolbar"
      role="toolbar"
      aria-label="本文書式"
    >
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive('paragraph')}
        disabled={isDisabled}
        testId="toolbar-paragraph"
        ariaLabel="段落"
      >
        P
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        disabled={isDisabled}
        testId="toolbar-h2"
        ariaLabel="見出し2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        disabled={isDisabled}
        testId="toolbar-h3"
        ariaLabel="見出し3"
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        active={editor.isActive('heading', { level: 4 })}
        disabled={isDisabled}
        testId="toolbar-h4"
        ariaLabel="見出し4"
      >
        H4
      </ToolbarButton>
      <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        disabled={isDisabled}
        testId="toolbar-bold"
        ariaLabel="太字"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        disabled={isDisabled}
        testId="toolbar-italic"
        ariaLabel="斜体"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        disabled={isDisabled}
        testId="toolbar-strike"
        ariaLabel="取り消し線"
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        disabled={isDisabled}
        testId="toolbar-code"
        ariaLabel="インラインコード"
      >
        {'<>'}
      </ToolbarButton>
      <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        disabled={isDisabled}
        testId="toolbar-bullet-list"
        ariaLabel="箇条書き"
      >
        •
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        disabled={isDisabled}
        testId="toolbar-ordered-list"
        ariaLabel="番号付きリスト"
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        disabled={isDisabled}
        testId="toolbar-blockquote"
        ariaLabel="引用"
      >
        &gt;
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        disabled={isDisabled}
        testId="toolbar-code-block"
        ariaLabel="コードブロック"
      >
        {'{}'}
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        disabled={isDisabled}
        testId="toolbar-hr"
        ariaLabel="区切り線"
      >
        ―
      </ToolbarButton>
      <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden />
      <ToolbarButton
        onClick={handleSetLink}
        active={editor.isActive('link')}
        disabled={isDisabled}
        testId="toolbar-link"
        ariaLabel="リンク"
      >
        🔗
      </ToolbarButton>
      <span className="w-px h-5 bg-gray-300 mx-1" aria-hidden />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={isDisabled || !editor.can().undo()}
        testId="toolbar-undo"
        ariaLabel="元に戻す"
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={isDisabled || !editor.can().redo()}
        testId="toolbar-redo"
        ariaLabel="やり直し"
      >
        ↷
      </ToolbarButton>
    </div>
  );
}
