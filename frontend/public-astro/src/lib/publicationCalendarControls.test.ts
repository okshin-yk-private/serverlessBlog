// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicationCalendar } from './publicationCalendar';
import { initPublicationCalendar } from './publicationCalendarControls';
function setup(mobile = false) {
  let change = () => {};
  const media = {
    matches: mobile,
    addEventListener: (_: string, handler: () => void) => {
      change = handler;
    },
  };
  vi.stubGlobal('matchMedia', () => media);
  const data = {
    ...publicationCalendar([], '2026-09-20T03:00:00Z'),
    counts: { '2026-09-16': 1 },
    years: [2026, 2024],
  };
  document.body.innerHTML = `<section><script id="calendar-data" type="application/json">${JSON.stringify(data)}</script><div data-calendar-control hidden></div><select id="calendar-year"><option>2026</option><option>2024</option></select><span id="calendar-period"></span><button data-period="previous"></button><button data-period="next"></button><div class="calendar-weeks"></div><div class="calendar-fallback-mobile">SSR</div></section>`;
  const root = document.querySelector('section')!;
  const onSelect = vi.fn();
  const calendar = initPublicationCalendar(root, onSelect);
  const button = (day: string) =>
    root.querySelector<HTMLButtonElement>(`button[data-day="${day}"]`)!;
  return {
    root,
    onSelect,
    calendar,
    button,
    media,
    change,
    grid: root.querySelector<HTMLElement>('.calendar-weeks')!,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
describe('calendar controls', () => {
  it('selects/toggles a date and exposes counts through accessible labels', () => {
    const { root, button, onSelect } = setup();
    const day = button('2026-09-16');
    expect(day.tabIndex).toBe(0);
    expect(root.querySelector('.calendar-fallback-mobile')).toBeNull();
    expect(
      root.querySelector('[data-calendar-control]')!.hasAttribute('hidden')
    ).toBe(false);
    day.focus();
    expect(day.getAttribute('aria-label')).toContain('1件');
    day.click();
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-16');
    expect(day.getAttribute('aria-pressed')).toBe('true');
    day.click();
    expect(onSelect).toHaveBeenLastCalledWith('');
    expect(button('2026-09-15').title).toContain('0件');
    expect(root.querySelector('button[data-day="2026-09-21"]')).toBeNull();
  });
  it('has a single tab stop and moves by day/week with clamped boundaries', () => {
    const { button, grid } = setup();
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true })
      );
    button('2026-09-16').focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(button('2026-09-09'));
    press('ArrowRight');
    expect(document.activeElement).toBe(button('2026-09-16'));
    press('ArrowUp');
    expect(document.activeElement).toBe(button('2026-09-15'));
    press('ArrowDown');
    expect(document.activeElement).toBe(button('2026-09-16'));
    press('Home');
    press('ArrowLeft');
    expect(document.activeElement).toBe(button('2026-01-01'));
    press('End');
    press('ArrowDown');
    expect(document.activeElement).toBe(button('2026-09-20'));
    press('Tab');
    expect(document.activeElement).toBe(button('2026-09-20'));
    grid.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    );
    expect(grid.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
  });
  it('adapts to quarterly views and keeps year selection independent of date filtering', () => {
    const { root, media, change, onSelect, button, calendar } = setup();
    calendar.setDay('2026-09-16');
    expect(button('2026-09-16').getAttribute('aria-pressed')).toBe('true');
    media.matches = true;
    change();
    expect(root.querySelector('#calendar-period')!.textContent).toBe(
      '7月 – 9月'
    );
    expect(button('2026-01-01')).toBeNull();
    const next = root.querySelector<HTMLButtonElement>('[data-period="next"]')!;
    next.click();
    expect(next.disabled).toBe(true);
    const previous = root.querySelector<HTMLButtonElement>(
      '[data-period="previous"]'
    )!;
    previous.click();
    previous.click();
    previous.click();
    expect(previous.disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    const year = root.querySelector<HTMLSelectElement>('#calendar-year')!;
    year.value = '2024';
    year.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenLastCalledWith('');
    expect(button('2024-01-01').tabIndex).toBe(0);
    calendar.setDay('2023-02-03');
    expect(year.value).toBe('2023');
    expect(button('2023-02-03').getAttribute('aria-pressed')).toBe('true');
    calendar.setDay('');
    expect(button('2023-02-03').getAttribute('aria-pressed')).toBe('false');
  });
});
