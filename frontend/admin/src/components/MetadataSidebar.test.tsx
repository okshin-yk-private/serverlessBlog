import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import {
  MetadataSidebar,
  type MetadataSidebarValue,
  type CategoryOption,
} from './MetadataSidebar';

const baseCategories: CategoryOption[] = [
  { slug: 'tech', name: '技術', sortOrder: 1 },
  { slug: 'life', name: '生活', sortOrder: 2 },
];

const baseValue: MetadataSidebarValue = {
  slug: '',
  excerpt: '',
  coverImageUrl: '',
  category: '',
  tags: [],
  publishStatus: 'draft',
  slugLocked: false,
};

describe('MetadataSidebar', () => {
  it('タイトル入力で slug が自動更新される', () => {
    function Driver() {
      const [title, setTitle] = useState('');
      const [v, setV] = useState<MetadataSidebarValue>(baseValue);
      return (
        <>
          <input
            data-testid="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <MetadataSidebar
            value={v}
            onChange={(p) => setV((prev) => ({ ...prev, ...p }))}
            title={title}
            contentMarkdown=""
            categories={baseCategories}
          />
        </>
      );
    }
    render(<Driver />);
    const titleInput = screen.getByTestId('title-input') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Hello World' } });
    const slug = screen.getByTestId('metadata-slug-input') as HTMLInputElement;
    expect(slug.value).toBe('hello-world');
  });

  it('ロック中はタイトル変更でslugが更新されない', () => {
    function Driver() {
      const [title, setTitle] = useState('initial');
      const [v, setV] = useState<MetadataSidebarValue>({
        ...baseValue,
        slug: 'manual-slug',
        slugLocked: true,
      });
      return (
        <>
          <input
            data-testid="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <MetadataSidebar
            value={v}
            onChange={(p) => setV((prev) => ({ ...prev, ...p }))}
            title={title}
            contentMarkdown=""
            categories={baseCategories}
          />
        </>
      );
    }
    render(<Driver />);
    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'New Title' },
    });
    const slug = screen.getByTestId('metadata-slug-input') as HTMLInputElement;
    expect(slug.value).toBe('manual-slug');
  });

  it('ロック解除→ロックで isPressed が反映される', () => {
    const onChange = vi.fn();
    render(
      <MetadataSidebar
        value={baseValue}
        onChange={onChange}
        title=""
        contentMarkdown=""
        categories={baseCategories}
      />
    );
    const lock = screen.getByTestId('metadata-slug-lock');
    expect(lock.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(lock);
    expect(onChange).toHaveBeenCalledWith({ slugLocked: true });
  });

  it('excerpt が161文字でカウンターが赤になる', () => {
    function Driver() {
      const [v, setV] = useState<MetadataSidebarValue>(baseValue);
      return (
        <MetadataSidebar
          value={v}
          onChange={(p) => setV((prev) => ({ ...prev, ...p }))}
          title=""
          contentMarkdown=""
          categories={baseCategories}
        />
      );
    }
    render(<Driver />);
    const excerpt = screen.getByTestId(
      'metadata-excerpt-input'
    ) as HTMLTextAreaElement;
    fireEvent.change(excerpt, { target: { value: 'x'.repeat(161) } });
    const counter = screen.getByTestId('metadata-excerpt-counter');
    expect(counter.className).toContain('text-red-600');
  });

  it('「本文先頭画像から」で coverImageUrl が埋まる', () => {
    function Driver() {
      const [v, setV] = useState<MetadataSidebarValue>(baseValue);
      return (
        <MetadataSidebar
          value={v}
          onChange={(p) => setV((prev) => ({ ...prev, ...p }))}
          title=""
          contentMarkdown="text ![](https://cdn/x.jpg) more"
          categories={baseCategories}
        />
      );
    }
    render(<Driver />);
    fireEvent.click(screen.getByTestId('metadata-cover-autofill'));
    expect(
      (screen.getByTestId('metadata-cover-input') as HTMLInputElement).value
    ).toBe('https://cdn/x.jpg');
  });

  it('カテゴリ select に options が表示される', () => {
    render(
      <MetadataSidebar
        value={baseValue}
        onChange={() => {}}
        title=""
        contentMarkdown=""
        categories={baseCategories}
      />
    );
    const select = screen.getByTestId(
      'post-category-select'
    ) as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(2);
    expect(Array.from(select.options).map((o) => o.value)).toContain('tech');
  });

  it('Enterキーでタグを追加できる', () => {
    function Driver() {
      const [v, setV] = useState<MetadataSidebarValue>(baseValue);
      return (
        <MetadataSidebar
          value={v}
          onChange={(p) => setV((prev) => ({ ...prev, ...p }))}
          title=""
          contentMarkdown=""
          categories={baseCategories}
        />
      );
    }
    render(<Driver />);
    const input = screen.getByTestId('tag-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'go' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('tags-list').textContent).toContain('go');
  });
});
