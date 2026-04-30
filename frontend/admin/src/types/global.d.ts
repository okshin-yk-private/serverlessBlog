import type { Editor } from '@tiptap/core';

declare global {
  interface Window {
    __tiptapEditor?: Editor;
  }
}

export {};
