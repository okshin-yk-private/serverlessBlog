/**
 * 記事関連のユーティリティ関数
 *
 * Requirements:
 * - 2.2: 記事一覧ページ実装
 * - 記事カードに必要な抜粋テキスト生成
 */

import type { Post } from './api';

/**
 * HTMLからプレーンテキストを抽出する
 *
 * Iteratively strips `<...>` patterns until the string is idempotent so that
 * residual fragments (e.g. `<<script>>` collapsing into `<script>` after one
 * pass) cannot survive. The output is used for excerpts and SEO descriptions
 * where it is rendered as React/Astro text content (escaped automatically),
 * not as `innerHTML`.
 */
export function stripHtml(html: string): string {
  const tagPattern = /<[^>]*>/g;
  let prev = html;
  let next = html.replace(tagPattern, '');
  while (next !== prev) {
    prev = next;
    next = next.replace(tagPattern, '');
  }
  return next.trim();
}

/**
 * 記事の抜粋を生成する
 * HTMLタグを除去し、指定した文字数で切り詰める
 *
 * @param contentHtml - HTMLコンテンツ
 * @param maxLength - 最大文字数（デフォルト: 100）
 * @returns 抜粋テキスト
 */
export function generateExcerpt(contentHtml: string, maxLength = 100): string {
  const plainText = stripHtml(contentHtml);
  if (plainText.length <= maxLength) {
    return plainText;
  }
  return plainText.substring(0, maxLength) + '...';
}

/**
 * 日付を日本語フォーマットで表示する
 *
 * @param dateString - ISO 8601形式の日付文字列
 * @returns 日本語フォーマットの日付文字列 (例: "2024年1月15日")
 */
export function formatDateJa(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 記事を作成日時の降順でソートする
 */
export function sortPostsByDate(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });
}
