import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Heading } from '@tiptap/extension-heading';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Strike } from '@tiptap/extension-strike';
import { Code } from '@tiptap/extension-code';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import { Blockquote } from '@tiptap/extension-blockquote';
import { CodeBlock } from '@tiptap/extension-code-block';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Typography } from '@tiptap/extension-typography';
import { History } from '@tiptap/extension-history';
import { Image } from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import { TiptapToolbar } from './TiptapToolbar';

export interface TiptapEditorHandle {
  getEditor: () => Editor | null;
}

export interface TiptapEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onImagePaste?: (file: File) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  toolbarSlot?: ReactNode;
}

const buildExtensions = (placeholder: string) => [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [2, 3, 4] }),
  Bold,
  Italic,
  Strike,
  Code,
  BulletList,
  OrderedList,
  ListItem,
  Blockquote,
  CodeBlock,
  HorizontalRule,
  HardBreak,
  Link.configure({ openOnClick: false, autolink: true }),
  Image.configure({ inline: false, allowBase64: false }),
  Placeholder.configure({ placeholder }),
  Typography,
  History,
  Markdown.configure({
    html: false,
    tightLists: true,
    bulletListMarker: '-',
    linkify: true,
    breaks: false,
    transformPastedText: true,
    transformCopiedText: false,
  }),
];

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  (
    {
      value,
      onChange,
      onImagePaste,
      placeholder = '本文を入力...',
      disabled = false,
    },
    ref
  ) => {
    // Track the markdown that originated from this editor so external value
    // changes (e.g. async load) can be applied without bouncing through onUpdate.
    const internalValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const onImagePasteRef = useRef(onImagePaste);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onImagePasteRef.current = onImagePaste;
    }, [onImagePaste]);

    const editor = useEditor({
      extensions: buildExtensions(placeholder),
      content: value,
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            'prose prose-sm max-w-none focus:outline-none min-h-[360px] px-3 py-2 font-sans text-sm',
        },
        handlePaste: (_view, event) => {
          if (!onImagePasteRef.current) return false;
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                event.preventDefault();
                void onImagePasteRef.current(file);
                return true;
              }
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const markdown =
          editor.storage.markdown?.getMarkdown?.() ?? editor.getText();
        internalValueRef.current = markdown;
        onChangeRef.current(markdown);
      },
    });

    useEffect(() => {
      if (!editor) return;
      if (value !== internalValueRef.current) {
        editor.commands.setContent(value);
        internalValueRef.current = value;
      }
    }, [value, editor]);

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
    }, [editor, disabled]);

    useEffect(() => {
      if (!editor) return;
      if (import.meta.env.MODE === 'test') {
        window.__tiptapEditor = editor;
        return () => {
          if (window.__tiptapEditor === editor) {
            delete window.__tiptapEditor;
          }
        };
      }
    }, [editor]);

    useImperativeHandle(
      ref,
      () => ({
        getEditor: () => editor,
      }),
      [editor]
    );

    return (
      <div className="border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white">
        <TiptapToolbar editor={editor} disabled={disabled} />
        <div data-testid="tiptap-editor" className="border-t border-gray-200">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);

TiptapEditor.displayName = 'TiptapEditor';
