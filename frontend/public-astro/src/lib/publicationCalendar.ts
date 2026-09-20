import type { Post } from './api';

export interface PublicationDate {
  day: string | null;
  timestamp: number | null;
  label: string;
}

/** Calendar dates are always Japanese local dates, independent of browser TZ. */
export function japanDay(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function publicationDate(
  post: Pick<Post, 'publishedAt'>,
  asOf: string
): PublicationDate {
  const value = post.publishedAt;
  const unknown = { day: null, timestamp: null, label: '公開日不明' };
  // Require an explicit timezone and reject dates that JS would silently roll over.
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    return unknown;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    return unknown;
  if (Number(value.slice(11, 13)) > 23) return unknown;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return unknown;
  if (timestamp > Date.parse(asOf))
    return { ...unknown, label: '公開日要確認' };
  const key = japanDay(new Date(timestamp));
  return { day: key, timestamp, label: key.replaceAll('-', '.') };
}

export function publishedPosts(posts: Post[], asOf: string): Post[] {
  const unique = new Map(
    posts.filter((p) => p.publishStatus === 'published').map((p) => [p.id, p])
  );
  return [...unique.values()].sort((a, b) => {
    const left = publicationDate(a, asOf).timestamp;
    const right = publicationDate(b, asOf).timestamp;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    return (right ?? 0) - (left ?? 0) || a.id.localeCompare(b.id);
  });
}

export interface CalendarData {
  asOf: string;
  today: string;
  years: number[];
  counts: Record<string, number>;
  unknown: number;
  review: number;
}

export function publicationCalendar(posts: Post[], asOf: string): CalendarData {
  const today = japanDay(new Date(asOf));
  const years = new Set([Number(today.slice(0, 4))]);
  const counts: Record<string, number> = {};
  let unknown = 0;
  let review = 0;
  for (const post of publishedPosts(posts, asOf)) {
    const date = publicationDate(post, asOf);
    if (date.day) {
      counts[date.day] = (counts[date.day] ?? 0) + 1;
      years.add(Number(date.day.slice(0, 4)));
    } else if (date.label === '公開日要確認') review++;
    else unknown++;
  }
  return {
    asOf,
    today,
    years: [...years].sort((a, b) => b - a),
    counts,
    unknown,
    review,
  };
}

export interface CalendarDay {
  day: string;
  count: number;
  level: number;
  future: boolean;
}

/** Weeks start on Monday. Null cells pad only the boundaries of the period. */
export function calendarWeeks(
  data: CalendarData,
  year: number,
  quarter?: number
): (CalendarDay | null)[][] {
  const firstMonth = quarter === undefined ? 0 : quarter * 3;
  const endMonth = quarter === undefined ? 12 : firstMonth + 3;
  const first = new Date(Date.UTC(year, firstMonth, 1));
  const end = new Date(Date.UTC(year, endMonth, 1));
  const cells: (CalendarDay | null)[] = Array((first.getUTCDay() + 6) % 7).fill(
    null
  );
  for (let time = first.getTime(); time < end.getTime(); time += 86400000) {
    const day = new Date(time).toISOString().slice(0, 10);
    const count = data.counts[day] ?? 0;
    cells.push({
      day,
      count,
      level: Math.min(count, 3),
      future: day > data.today,
    });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7)
  );
}
