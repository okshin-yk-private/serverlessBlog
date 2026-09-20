import { debounce, searchPosts, type SearchablePost } from './searchUtils';
import { initPublicationCalendar } from './publicationCalendarControls';

/** Filter the complete Articles collection by text, category and publication day. */
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
  const dateInput =
    controls.querySelector<HTMLInputElement>('#publication-date');
  const dateClear = controls.querySelector<HTMLButtonElement>('#date-clear');
  const filtersClear =
    controls.querySelector<HTMLButtonElement>('#filters-clear');
  const calendarRoot = document.getElementById('publication-calendar');
  let selectedDay = '';
  const calendar = calendarRoot
    ? initPublicationCalendar(calendarRoot, (day) => {
        selectedDay = day;
        if (dateInput) dateInput.value = day;
        apply();
      })
    : null;
  let composing = false;
  const buttons =
    controls.querySelectorAll<HTMLButtonElement>('[data-category]');
  const rows = records.querySelectorAll<HTMLElement>('[data-post-id]');

  function apply() {
    const candidates = selectedDay
      ? posts.filter((post) => post.publicationDay === selectedDay)
      : posts;
    const matches = new Set(searchPosts(candidates, input!.value, category));
    rows.forEach((row) => {
      row.hidden = !matches.has(row.dataset.postId!);
    });
    clear!.hidden = input!.value.length === 0;
    empty!.hidden = matches.size !== 0 || posts.length === 0;
    status!.textContent = `${matches.size} ${matches.size === 1 ? 'article' : 'articles'}${category ? ` (${category})` : ''}${selectedDay ? ` · Published ${selectedDay.replaceAll('-', '.')}` : ''}`;
    if (dateClear) {
      dateClear.hidden = !selectedDay;
      dateClear.textContent = `Published: ${selectedDay.replaceAll('-', '.')} ×`;
    }
    if (filtersClear)
      filtersClear.hidden = !selectedDay && !category && !input!.value;
  }
  dateInput?.addEventListener('change', () => {
    if (!dateInput.validity.valid) return;
    selectedDay = dateInput.value;
    calendar?.setDay(selectedDay);
    apply();
  });
  dateClear?.addEventListener('click', () => {
    selectedDay = '';
    if (dateInput) {
      dateInput.value = '';
      dateInput.focus();
    }
    calendar?.setDay('');
    apply();
  });
  filtersClear?.addEventListener('click', () => {
    selectedDay = '';
    category = '';
    input!.value = '';
    if (dateInput) dateInput.value = '';
    buttons.forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.category === '')
      )
    );
    calendar?.setDay('');
    apply();
    input!.focus();
  });
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
      control.hidden = posts.length === 0;
    });
  controls.dataset.ready = 'true';
  apply();
}
