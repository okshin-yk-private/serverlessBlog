import { Link } from '@tiptap/extension-link';
import type { Mark, Node } from '@tiptap/pm/model';
import {
  defaultMarkdownSerializer,
  type MarkdownSerializerState,
} from 'prosemirror-markdown';

// This deliberately supports one presentation marker, not arbitrary HTML attributes.
const BUTTON_MARKER = '{.link-button}';
const linkSerializer = defaultMarkdownSerializer.marks.link;
const configuredParsers = new WeakSet<object>();

export const ArticleLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      button: {
        default: false,
        rendered: false,
        parseHTML: (element: HTMLElement) =>
          element.classList.contains('article-link-button'),
      },
    };
  },

  renderHTML(props) {
    // Keep the parent URI guard; only add the locally defined presentation class.
    const output = this.parent!(props);
    if (props.mark.attrs.button && Array.isArray(output)) {
      const attrs = output[1] as Record<string, unknown>;
      output[1] = { ...attrs, class: 'article-link-button' };
    }
    return output;
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          ...linkSerializer,
          close(
            state: MarkdownSerializerState,
            mark: Mark,
            parent: Node,
            index: number
          ) {
            const close = linkSerializer.close;
            const suffix =
              typeof close === 'function'
                ? close(state, mark, parent, index)
                : close;
            return suffix + (mark.attrs.button ? BUTTON_MARKER : '');
          },
        },
        parse: {
          setup(md: import('markdown-it')) {
            if (configuredParsers.has(md)) return;
            configuredParsers.add(md);
            md.inline.ruler.after(
              'link',
              'article_link_button',
              (state, silent) => {
                if (!state.src.startsWith(BUTTON_MARKER, state.pos))
                  return false;
                const last = state.tokens[state.tokens.length - 1];
                if (!last || last.type !== 'link_close' || state.pending)
                  return false;
                // Inline rules run before automatic linkification. Escaped markers and
                // markers inside code spans remain ordinary text.
                if (!silent) {
                  for (let i = state.tokens.length - 2; i >= 0; i--) {
                    if (state.tokens[i].type === 'link_open') {
                      state.tokens[i].attrSet('class', 'article-link-button');
                      break;
                    }
                  }
                }
                state.pos += BUTTON_MARKER.length;
                return true;
              }
            );
          },
        },
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  // Match the existing server policy. Presentation changes do not change navigation.
  HTMLAttributes: { target: null, rel: 'nofollow noreferrer', class: null },
});
