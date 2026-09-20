import { describe, expect, it } from 'vitest';
import type { Post } from './api';
import {
  calendarWeeks,
  japanDay,
  publicationCalendar,
  publicationDate,
  publishedPosts,
} from './publicationCalendar';
const asOf = '2026-09-20T03:00:00Z';
function post(
  id: string,
  publishedAt?: string,
  extra: Partial<Post> = {}
): Post {
  return {
    id,
    title: id,
    contentHtml: '',
    category: 'think',
    tags: [],
    publishStatus: 'published',
    authorId: 'a',
    createdAt: '2020-01-01T00:00:00Z',
    updatedAt: asOf,
    publishedAt,
    ...extra,
  };
}
describe('publication dates and calendar', () => {
  it('uses the publication instant in Japan, including the UTC year boundary', () => {
    expect(japanDay(new Date('2023-12-31T15:00:00Z'))).toBe('2024-01-01');
    expect(
      publicationDate(post('a', '2024-01-01T00:00:00+09:00'), asOf).day
    ).toBe('2024-01-01');
    expect(publicationDate(post('a', '2024-01-01T14:59:59Z'), asOf).day).toBe(
      '2024-01-01'
    );
    expect(
      publicationDate(post('a', '2024-01-01T15:00:00.001Z'), asOf).label
    ).toBe('2024.01.02');
  });
  it.each([
    undefined,
    '',
    'bad',
    '2024-01-01',
    '2024-01-01T00:00:00',
    '2023-02-29T00:00:00Z',
    '2024-00-01T00:00:00Z',
    '2024-13-01T00:00:00Z',
    '2024-01-00T00:00:00Z',
    '0999-01-01T00:00:00Z',
    '2024-01-01T99:00:00Z',
    '2024-01-01T24:00:00Z',
    '2024-01-01T01:99:00Z',
  ])('does not invent a publication date for %s', (value) => {
    expect(publicationDate(post('a', value), asOf)).toEqual({
      day: null,
      timestamp: null,
      label: '公開日不明',
    });
  });
  it('separates future timestamps even within the snapshot day', () => {
    expect(publicationDate(post('a', '2026-09-20T04:00:00Z'), asOf).label).toBe(
      '公開日要確認'
    );
  });
  it('deduplicates currently public posts and sorts by publication rather than creation/update time', () => {
    const posts = [
      post('z'),
      post('b', '2024-01-01T00:00:00Z'),
      post('draft', asOf, { publishStatus: 'draft' }),
      post('new', '2025-01-01T00:00:00Z'),
      post('a', '2024-01-01T00:00:00Z'),
      post('y'),
      post('a', '2024-01-01T00:00:00Z'),
    ];
    expect(publishedPosts(posts, asOf).map((p) => p.id)).toEqual([
      'new',
      'a',
      'b',
      'y',
      'z',
    ]);
    expect(posts).toHaveLength(7);
    const calendar = publicationCalendar(posts, asOf);
    expect(calendar.counts).toEqual({ '2024-01-01': 2, '2025-01-01': 1 });
    expect(calendar.unknown).toBe(2);
    expect(calendar.years).toEqual([2026, 2025, 2024]);
  });
  it('counts each public article once regardless of updates or republication', () => {
    const original = post('a', '2024-01-01T00:00:00Z');
    const changed = { ...original, updatedAt: '2026-01-01T00:00:00Z' };
    expect(publicationCalendar([changed], asOf).counts).toEqual(
      publicationCalendar([original], asOf).counts
    );
    expect(
      publicationCalendar([{ ...changed, publishStatus: 'draft' }], asOf).counts
    ).toEqual({});
    expect(publicationCalendar([], asOf).counts).toEqual({});
  });
  it('accounts for all valid, unknown and future publications without coloring unknown dates', () => {
    const calendar = publicationCalendar(
      [
        post('a'),
        post('b', '2027-01-01T00:00:00Z'),
        post('c', '2026-09-16T00:00:00Z'),
      ],
      asOf
    );
    expect(calendar.unknown).toBe(1);
    expect(calendar.review).toBe(1);
    expect(
      Object.values(calendar.counts).reduce((a, b) => a + b, 0) +
        calendar.unknown +
        calendar.review
    ).toBe(3);
  });
  it('places every day once in Monday-first weeks, including leap day and padding', () => {
    const calendar = publicationCalendar([], asOf);
    const leap = calendarWeeks(calendar, 2024);
    expect(leap.flat().filter(Boolean)).toHaveLength(366);
    expect(leap.flat().filter((d) => d?.day === '2024-02-29')).toHaveLength(1);
    expect(leap[0][0]?.day).toBe('2024-01-01');
    const current = calendarWeeks(calendar, 2026);
    expect(current[0].slice(0, 3)).toEqual([null, null, null]);
    expect(current[0][3]?.day).toBe('2026-01-01');
    expect(current.flat().filter(Boolean)).toHaveLength(365);
    expect(current.flat().find((d) => d?.day === '2026-09-16')).toMatchObject({
      future: false,
    });
    expect(current.flat().find((d) => d?.day === '2026-09-21')).toMatchObject({
      future: true,
    });
  });
  it('uses the same dates and saturated levels in quarterly and annual views', () => {
    const data = publicationCalendar(
      Array.from({ length: 4 }, (_, i) =>
        post(String(i), '2026-09-16T00:00:00Z')
      ),
      asOf
    );
    const quarter = calendarWeeks(data, 2026, 2).flat().filter(Boolean);
    expect(quarter).toHaveLength(92);
    expect(quarter[0]?.day).toBe('2026-07-01');
    expect(quarter.at(-1)?.day).toBe('2026-09-30');
    expect(quarter.find((d) => d?.day === '2026-09-16')).toMatchObject({
      count: 4,
      level: 3,
    });
    expect(calendarWeeks(data, 2026, 3).flat().filter(Boolean)).toHaveLength(
      92
    );
  });
});
