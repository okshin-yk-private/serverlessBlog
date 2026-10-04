/**
 * Keyboard shortcuts shown on the editor toolbar.
 *
 * These mirror the defaults registered by the Tiptap extensions in
 * TiptapEditor (addKeyboardShortcuts). They are labels only: changing an
 * entry here does not rebind anything. TiptapToolbar.test.tsx presses each
 * shortcut against a real editor so the labels cannot drift from the bindings.
 */
export const TOOLBAR_SHORTCUTS = {
  paragraph: ['Mod', 'Alt', '0'],
  h2: ['Mod', 'Alt', '2'],
  h3: ['Mod', 'Alt', '3'],
  h4: ['Mod', 'Alt', '4'],
  bold: ['Mod', 'B'],
  italic: ['Mod', 'I'],
  strike: ['Mod', 'Shift', 'S'],
  code: ['Mod', 'E'],
  bulletList: ['Mod', 'Shift', '8'],
  orderedList: ['Mod', 'Shift', '7'],
  blockquote: ['Mod', 'Shift', 'B'],
  codeBlock: ['Mod', 'Alt', 'C'],
  undo: ['Mod', 'Z'],
  redo: ['Mod', 'Shift', 'Z'],
} as const satisfies Record<string, readonly string[]>;

export type Shortcut = readonly string[];

const MAC_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

const PC_NAMES: Record<string, string> = {
  Mod: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
};

const ARIA_NAMES: Record<string, (mac: boolean) => string> = {
  Mod: (mac) => (mac ? 'Meta' : 'Control'),
  Alt: () => 'Alt',
  Shift: () => 'Shift',
};

/** Same platform test ProseMirror uses to map `Mod` to Cmd or Ctrl. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iP(hone|[oa]d)/.test(navigator.platform);
}

/** "⌘⇧S" on macOS, "Ctrl+Shift+S" elsewhere. */
export function formatShortcut(keys: Shortcut, mac: boolean): string {
  if (mac) return keys.map((k) => MAC_SYMBOLS[k] ?? k).join('');
  return keys.map((k) => PC_NAMES[k] ?? k).join('+');
}

/** Value for the aria-keyshortcuts attribute, e.g. "Control+Shift+S". */
export function toAriaKeyShortcuts(keys: Shortcut, mac: boolean): string {
  return keys.map((k) => ARIA_NAMES[k]?.(mac) ?? k).join('+');
}
