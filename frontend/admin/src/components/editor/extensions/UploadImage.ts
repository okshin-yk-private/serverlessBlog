import type { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { UploadImageNodeView } from '../UploadImageNodeView';
import {
  validateImageFile,
  type ImageValidationResult,
} from '../../../utils/imageValidation';

export type UploadFn = (file: File) => Promise<string>;
export type UploadErrorHandler = (message: string, retry: () => void) => void;

export interface UploadImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
  uploadFn: UploadFn;
  onError: UploadErrorHandler | null;
  validate: (file: File) => ImageValidationResult;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    uploadImage: {
      uploadImage: (file: File) => ReturnType;
    };
  }
}

const newUploadId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* ignore (crypto.randomUUID is restricted to secure contexts) */
    }
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const findImageByUploadId = (
  editor: Editor,
  uploadId: string
): { pos: number; size: number } | null => {
  let found: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'image' && node.attrs.uploadId === uploadId) {
      found = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
};

const replaceImageAttrs = (
  editor: Editor,
  uploadId: string,
  attrs: Record<string, unknown>
): boolean => {
  if (editor.isDestroyed) return false;
  const target = findImageByUploadId(editor, uploadId);
  if (!target) return false;
  const { state, view } = editor;
  const node = state.doc.nodeAt(target.pos);
  if (!node) return false;
  const tr = state.tr.setNodeMarkup(target.pos, undefined, {
    ...node.attrs,
    ...attrs,
  });
  view.dispatch(tr);
  return true;
};

const removeImageNode = (editor: Editor, uploadId: string): boolean => {
  if (editor.isDestroyed) return false;
  const target = findImageByUploadId(editor, uploadId);
  if (!target) return false;
  const tr = editor.state.tr.delete(target.pos, target.pos + target.size);
  editor.view.dispatch(tr);
  return true;
};

const startUpload = (
  editor: Editor,
  options: UploadImageOptions,
  file: File
): void => {
  const validation = options.validate(file);
  if (!validation.ok) {
    options.onError?.(validation.reason, () =>
      startUpload(editor, options, file)
    );
    return;
  }

  const uploadId = newUploadId();
  const blobUrl = URL.createObjectURL(file);

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs: {
        src: blobUrl,
        alt: file.name,
        uploading: true,
        uploadId,
      },
    })
    .run();

  options
    .uploadFn(file)
    .then((finalUrl) => {
      const replaced = replaceImageAttrs(editor, uploadId, {
        src: finalUrl,
        uploading: false,
        uploadId: null,
      });
      URL.revokeObjectURL(blobUrl);
      if (!replaced) {
        // Node was removed (e.g. user undo) — nothing to update.
      }
    })
    .catch((err: unknown) => {
      removeImageNode(editor, uploadId);
      URL.revokeObjectURL(blobUrl);
      const message =
        err instanceof Error && err.message
          ? `画像のアップロードに失敗しました: ${err.message}`
          : '画像のアップロードに失敗しました';
      options.onError?.(message, () => startUpload(editor, options, file));
    });
};

const extractImageFiles = (transfer: DataTransfer | null): File[] => {
  if (!transfer) return [];
  const files: File[] = [];
  if (transfer.items && transfer.items.length > 0) {
    for (const item of Array.from(transfer.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  if (files.length === 0 && transfer.files && transfer.files.length > 0) {
    for (const f of Array.from(transfer.files)) {
      if (f.type.startsWith('image/')) files.push(f);
    }
  }
  return files;
};

export const UploadImage = Image.extend<UploadImageOptions>({
  name: 'image',

  addOptions() {
    const parent = this.parent?.() as Partial<UploadImageOptions> | undefined;
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
      ...(parent ?? {}),
      uploadFn: async () => {
        throw new Error('UploadImage: uploadFn is not configured');
      },
      onError: null,
      validate: validateImageFile,
    };
  },

  addAttributes() {
    const parent = this.parent?.();
    return {
      ...(parent ?? {}),
      uploading: {
        default: false,
        rendered: false,
      },
      uploadId: {
        default: null,
        rendered: false,
      },
    };
  },

  addCommands() {
    return {
      uploadImage:
        (file: File) =>
        ({ editor }) => {
          // Defer the actual insertion to the next microtask so we do not
          // collide with the wrapping CommandManager transaction. Inserting
          // a node inside the command body can leave CommandManager holding
          // a stale tr (built from the pre-insert state), which then throws
          // "Applying a mismatched transaction" on dispatch.
          queueMicrotask(() => startUpload(editor, this.options, file));
          return true;
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(UploadImageNodeView);
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;
    return [
      new Plugin({
        props: {
          handlePaste(_view, event) {
            const clipboardEvent = event as ClipboardEvent;
            const files = extractImageFiles(
              clipboardEvent.clipboardData ?? null
            );
            if (files.length === 0) return false;
            event.preventDefault();
            for (const f of files) startUpload(editor, options, f);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;
            const dragEvent = event as DragEvent;
            const files = extractImageFiles(dragEvent.dataTransfer ?? null);
            if (files.length === 0) return false;
            event.preventDefault();

            const coords = view.posAtCoords({
              left: dragEvent.clientX,
              top: dragEvent.clientY,
            });
            if (coords) {
              const $pos = view.state.doc.resolve(coords.pos);
              const tr = view.state.tr.setSelection(TextSelection.near($pos));
              view.dispatch(tr);
            }
            for (const f of files) startUpload(editor, options, f);
            return true;
          },
        },
      }),
    ];
  },
});
