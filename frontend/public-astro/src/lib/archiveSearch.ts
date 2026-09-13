import { debounce, searchPosts, type SearchablePost } from './searchUtils';

/** Filter only archive records; the editorial feature remains in place. */
export function initArchiveSearch(controls: HTMLElement, records: HTMLElement) {
  const input = controls.querySelector<HTMLInputElement>('#search-input');
  const clear = controls.querySelector<HTMLButtonElement>('#search-clear');
  const status = controls.querySelector<HTMLElement>('#search-status');
  const empty = controls.querySelector<HTMLElement>('#no-results-message');
  const data = controls.querySelector('#search-data');
  if (!input || !clear || !status || !empty || !data) return;

  let posts: SearchablePost[];
  try {
    posts = JSON.parse(data.textContent || '[]');
  } catch {
    return; // Leave the server-rendered archive usable if search cannot initialize.
  }
  let category = '';
  let composing = false;
  const buttons =
    controls.querySelectorAll<HTMLButtonElement>('[data-category]');
  const rows = records.querySelectorAll<HTMLElement>('[data-post-id]');

  function apply() {
    const matches = new Set(searchPosts(posts, input!.value, category));
    rows.forEach((row) => {
      row.hidden = !matches.has(row.dataset.postId!);
    });
    clear!.hidden = input!.value.length === 0;
    empty!.hidden = matches.size !== 0;
    status!.textContent = `${matches.size}件の記事${category ? `（${category}）` : ''}`;
  }
  const delayedApply = debounce(() => {
    if (!composing) apply();
  }, 200);
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    apply();
  });
  input.addEventListener('input', () => {
    if (!composing) delayedApply();
  });
  input.addEventListener('search', apply);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing && !composing) {
      input.value = '';
      apply();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    apply();
    input.focus();
  });
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      category = button.dataset.category || '';
      buttons.forEach((other) =>
        other.setAttribute('aria-pressed', String(other === button))
      );
      apply();
    })
  );
  controls
    .querySelectorAll<HTMLElement>('[data-search-control]')
    .forEach((control) => {
      control.hidden = false;
    });
  apply();
}
