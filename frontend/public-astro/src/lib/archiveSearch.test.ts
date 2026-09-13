// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initArchiveSearch } from './archiveSearch';

const posts = [
  { id: 'a', title: 'AWSの設計', category: '技術', tags: ['Lambda'] },
  { id: 'b', title: 'AWSを学んだ日', category: '日常', tags: [] },
  { id: 'c', title: '読書の記録', category: '日常', tags: ['本'] },
];

function setup() {
  document.body.innerHTML = `
    <section data-testid="feature-article" data-post-id="a">主役</section>
    <div id="controls">
      <div data-search-control hidden><input id="search-input"></div>
      <button id="search-clear" hidden>クリア</button>
      <p id="search-status"></p><p id="no-results-message" hidden>検索結果がありません</p>
      <button data-category="" aria-pressed="true">すべて</button>
      <button data-category="技術" aria-pressed="false">技術</button>
      <button data-category="日常" aria-pressed="false">日常</button>
      <script id="search-data" type="application/json">${JSON.stringify(posts)}</script>
    </div>
    <div id="records">${posts.map((post) => `<article data-post-id="${post.id}">${post.title}</article>`).join('')}</div>`;
  const controls = document.getElementById('controls')!;
  const records = document.getElementById('records')!;
  initArchiveSearch(controls, records);
  const input = controls.querySelector<HTMLInputElement>('input')!;
  const select = (category: string) =>
    controls
      .querySelector<HTMLButtonElement>(`[data-category="${category}"]`)!
      .click();
  const visible = () =>
    [...records.querySelectorAll<HTMLElement>('article')]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset.postId);
  const search = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
  };
  return { controls, input, select, visible, search };
}

describe('archive search interactions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('combines exact category selection with title/tag search, leaving the feature intact', () => {
    const { select, search, visible, controls } = setup();
    search('aws');
    expect(visible()).toEqual(['a', 'b']);
    select('日常');
    expect(visible()).toEqual(['b']);
    expect(
      controls
        .querySelector('[data-category="日常"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true');
    search('本');
    expect(visible()).toEqual(['c']);
    expect(
      document.querySelector<HTMLElement>('[data-testid="feature-article"]')!
        .hidden
    ).toBe(false);
  });

  it('announces zero results and restores the selected category when clearing a pending search', () => {
    const { input, search, select, visible, controls } = setup();
    select('日常');
    search('存在しない');
    expect(visible()).toEqual([]);
    expect(
      controls.querySelector<HTMLElement>('#no-results-message')!.hidden
    ).toBe(false);
    expect(controls.querySelector('#search-status')!.textContent).toBe(
      '0件の記事（日常）'
    );
    input.value = 'AWS';
    input.dispatchEvent(new Event('input'));
    controls.querySelector<HTMLButtonElement>('#search-clear')!.click();
    vi.advanceTimersByTime(200);
    expect(visible()).toEqual(['b', 'c']);
    expect(document.activeElement).toBe(input);
    expect(
      controls.querySelector<HTMLElement>('#no-results-message')!.hidden
    ).toBe(true);
    select('');
    expect(visible()).toEqual(['a', 'b', 'c']);
  });

  it('defers filtering and preserves Escape during Japanese IME composition', () => {
    const { input, visible } = setup();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = '読書';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true })
    );
    vi.advanceTimersByTime(300);
    expect(input.value).toBe('読書');
    expect(visible()).toEqual(['a', 'b', 'c']);
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(visible()).toEqual(['c']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(input.value).toBe('');
    expect(visible()).toEqual(['a', 'b', 'c']);
  });

  it('keeps server-rendered articles available if the search data is invalid', () => {
    document.body.innerHTML =
      '<div id="controls"><div data-search-control hidden></div><input id="search-input"><button id="search-clear"></button><p id="search-status"></p><p id="no-results-message"></p><script id="search-data" type="application/json">invalid</script></div><div id="records"><article>記事</article></div>';
    const controls = document.getElementById('controls')!;
    const records = document.getElementById('records')!;
    initArchiveSearch(controls, records);
    expect(
      controls.querySelector<HTMLElement>('[data-search-control]')!.hidden
    ).toBe(true);
    expect(records.textContent).toBe('記事');
  });
});
