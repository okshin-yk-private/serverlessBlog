import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';

export function UploadImageNodeView({ node }: NodeViewProps) {
  const src = node.attrs.src as string | null;
  const alt = (node.attrs.alt as string | null) ?? '';
  const title = (node.attrs.title as string | null) ?? undefined;
  const uploading = node.attrs.uploading === true;
  const uploadId = (node.attrs.uploadId as string | null) ?? undefined;

  return (
    <NodeViewWrapper
      as="figure"
      className="relative inline-block my-2"
      data-upload-id={uploadId}
      data-uploading={uploading ? 'true' : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          title={title}
          className={uploading ? 'opacity-50 max-w-full' : 'max-w-full'}
        />
      ) : null}
      {uploading ? (
        <div
          data-testid="image-upload-spinner"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span className="block w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
