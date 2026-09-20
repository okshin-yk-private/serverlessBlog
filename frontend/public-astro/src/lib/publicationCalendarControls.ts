import { calendarWeeks, type CalendarData } from './publicationCalendar';

export function initPublicationCalendar(
  root: HTMLElement,
  onSelect: (day: string) => void
) {
  const data = JSON.parse(
    root.querySelector('#calendar-data')!.textContent!
  ) as CalendarData;
  const grid = root.querySelector<HTMLElement>('.calendar-weeks')!;
  const select = root.querySelector<HTMLSelectElement>('#calendar-year')!;
  const period = root.querySelector<HTMLElement>('#calendar-period')!;
  const detail = root.querySelector<HTMLElement>('#calendar-detail')!;
  const previous = root.querySelector<HTMLButtonElement>(
    '[data-period="previous"]'
  )!;
  const next = root.querySelector<HTMLButtonElement>('[data-period="next"]')!;
  const media = window.matchMedia('(max-width: 899px)');
  let year = Number(data.today.slice(0, 4));
  let quarter = Math.floor((Number(data.today.slice(5, 7)) - 1) / 3);
  let selected = '';

  function describe(day: string) {
    detail.textContent = `${day.replaceAll('-', '.')} · ${data.counts[day] ?? 0}件（公開記事全体）`;
  }

  function render() {
    root.querySelector('.calendar-fallback-mobile')?.remove();
    root.dataset.ready = 'true';
    select.value = String(year);
    period.textContent = `${quarter * 3 + 1}月 – ${quarter * 3 + 3}月`;
    previous.disabled = quarter === 0;
    next.disabled = quarter === 3;
    const weeks = calendarWeeks(
      data,
      year,
      media.matches ? quarter : undefined
    );
    grid.style.setProperty('--weeks', String(weeks.length));
    grid.replaceChildren();
    const buttons: HTMLButtonElement[] = [];
    for (const week of weeks) {
      const column = document.createElement('div');
      column.className = 'calendar-week';
      const label = document.createElement('span');
      label.className = 'calendar-month';
      const boundary = week.find((day) => day?.day.endsWith('-01'));
      label.textContent = boundary
        ? `${Number(boundary.day.slice(5, 7))}月`
        : '';
      column.append(label);
      for (const day of week) {
        const cell = document.createElement(
          day && !day.future ? 'button' : 'span'
        );
        cell.className = 'calendar-cell';
        if (!day) cell.classList.add('calendar-padding');
        else {
          cell.dataset.level = String(day.level);
          cell.dataset.day = day.day;
          const text = `${day.day.replaceAll('-', '.')} · ${day.future ? '未集計' : `${day.count}件`}`;
          cell.title = text;
          cell.setAttribute('aria-label', text);
          if (day.future) {
            cell.classList.add('calendar-future');
            cell.setAttribute('role', 'img');
          } else {
            const button = cell as HTMLButtonElement;
            button.type = 'button';
            button.tabIndex = -1;
            button.setAttribute('aria-pressed', String(selected === day.day));
            button.setAttribute('aria-controls', 'article-records');
            button.addEventListener('click', () => {
              selected = selected === day.day ? '' : day.day;
              buttons.forEach((b) =>
                b.setAttribute(
                  'aria-pressed',
                  String(b.dataset.day === selected)
                )
              );
              describe(day.day);
              onSelect(selected);
            });
            button.addEventListener('focus', () => {
              buttons.forEach((b) => {
                b.tabIndex = b === button ? 0 : -1;
              });
              describe(day.day);
            });
            button.addEventListener('mouseenter', () => describe(day.day));
            buttons.push(button);
          }
        }
        column.append(cell);
      }
      grid.append(column);
    }
    const initial =
      buttons.find((b) => b.dataset.day === selected) ??
      buttons.find((b) => (data.counts[b.dataset.day!] ?? 0) > 0) ??
      buttons[0];
    if (initial) initial.tabIndex = 0;
  }

  grid.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(target as HTMLButtonElement);
    const offsets: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    let destination: number;
    if (event.key === 'Home') destination = 0;
    else if (event.key === 'End') destination = buttons.length - 1;
    else if (event.key in offsets) destination = index + offsets[event.key];
    else return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, destination))]?.focus();
  });
  select.addEventListener('change', () => {
    year = Number(select.value);
    selected = '';
    detail.textContent = '日付を選ぶと、その日の記事を表示します。';
    render();
    onSelect('');
  });
  previous.addEventListener('click', () => {
    quarter = Math.max(0, quarter - 1);
    render();
  });
  next.addEventListener('click', () => {
    quarter = Math.min(3, quarter + 1);
    render();
  });
  media.addEventListener('change', render);
  root
    .querySelectorAll<HTMLElement>('[data-calendar-control]')
    .forEach((el) => {
      el.hidden = false;
    });
  render();
  return {
    setDay(day: string) {
      selected = day;
      if (day) {
        year = Number(day.slice(0, 4));
        quarter = Math.floor((Number(day.slice(5, 7)) - 1) / 3);
        if (!data.years.includes(year)) {
          data.years.push(year);
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = `${year}年`;
          select.append(option);
        }
        describe(day);
      } else detail.textContent = '日付を選ぶと、その日の記事を表示します。';
      render();
    },
  };
}
