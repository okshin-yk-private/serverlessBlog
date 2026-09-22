import { Text } from '@tiptap/extension-text';
import type { Node } from '@tiptap/pm/model';

interface TextSerializerState {
  inAutolink?: boolean;
  text: (text: string, escape?: boolean) => void;
  write: (text: string) => void;
}

// Braces normally need no escaping in Markdown. Our presentation marker does:
// literal text after a link must not silently become a button on the next load.
export const ArticleText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: TextSerializerState, node: Node) {
          const text = node.text ?? '';
          if (state.inAutolink) {
            state.text(text, false);
            return;
          }
          const parts = text.split('{.link-button}');
          parts.forEach((part, index) => {
            if (index) state.write('\\{.link-button}');
            state.text(part);
          });
        },
      },
    };
  },
});
