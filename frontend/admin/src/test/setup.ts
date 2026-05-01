import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './mocks/server';

// ProseMirror (Tiptap) requires DOM APIs that jsdom does not implement.
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => {
      const list: DOMRect[] = [];
      return Object.assign(list, {
        item: (index: number) => list[index] ?? null,
      }) as unknown as DOMRectList;
    };
  }
}

if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// jsdom does not implement URL.createObjectURL / revokeObjectURL,
// which the UploadImage Tiptap extension uses for placeholder previews.
if (typeof URL !== 'undefined') {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () =>
      'blob:mock-' + Math.random().toString(36).slice(2);
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {};
  }
}

afterEach(() => {
  cleanup();
});
