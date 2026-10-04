import { describe, it, expect } from 'vitest';
import { formatShortcut, toAriaKeyShortcuts } from './shortcuts';

describe('formatShortcut', () => {
  it('macOS では記号で連結する', () => {
    expect(formatShortcut(['Mod', 'Shift', 'S'], true)).toBe('⌘⇧S');
    expect(formatShortcut(['Mod', 'Alt', '2'], true)).toBe('⌘⌥2');
  });

  it('macOS 以外では Ctrl を + で連結する', () => {
    expect(formatShortcut(['Mod', 'Shift', 'S'], false)).toBe('Ctrl+Shift+S');
    expect(formatShortcut(['Mod', 'B'], false)).toBe('Ctrl+B');
  });
});

describe('toAriaKeyShortcuts', () => {
  it('Mod を Meta / Control に読み替える', () => {
    expect(toAriaKeyShortcuts(['Mod', 'Alt', 'C'], true)).toBe('Meta+Alt+C');
    expect(toAriaKeyShortcuts(['Mod', 'Alt', 'C'], false)).toBe(
      'Control+Alt+C'
    );
  });
});
