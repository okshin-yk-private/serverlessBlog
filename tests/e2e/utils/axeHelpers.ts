import { Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * 軸のアクセシビリティ違反を 0 に保つアサーション。
 *
 * 主要画面 (Login, Dashboard, PostList, PostEditor, PostDetail) で 1 アサート
 * 入れる前提。検出ルールは axe-core デフォルトの WCAG 2.1 A/AA。
 *
 * 使用側で意図的に許容したい違反がある場合は exclude / disableRules で絞る。
 */
export async function assertNoA11yViolations(
  page: Page,
  options: {
    /** axe.run の対象セレクタを絞る (例: 主要コンテンツのみ) */
    include?: string;
    /** 検査から除外するセレクタ */
    exclude?: string[];
    /** 一時的に無効化したい axe ルール ID */
    disableRules?: string[];
    /** 検査タグで絞り込み (デフォルト: WCAG 2.1 A/AA) */
    tags?: string[];
  } = {}
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(
    options.tags ?? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  );
  if (options.include) builder = builder.include(options.include);
  if (options.exclude?.length) {
    for (const sel of options.exclude) builder = builder.exclude(sel);
  }
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }
  const results = await builder.analyze();
  expect(
    results.violations,
    `axe a11y violations:\n${formatViolations(results.violations)}`
  ).toEqual([]);
}

function formatViolations(
  violations: {
    id: string;
    impact?: string | null;
    help: string;
    nodes: { target: unknown[] }[];
  }[]
): string {
  if (violations.length === 0) return '(none)';
  return violations
    .map(
      (v) =>
        `- [${v.impact ?? 'unknown'}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`
    )
    .join('\n');
}
