/**
 * 記事詳細ページ用ユーティリティ関数
 *
 * Task 2.3: 記事詳細ページ実装
 *
 * Requirements:
 * - 2.3: 記事詳細ページ実装
 * - 3.6: 記事本文から最初の160文字でdescriptionを自動生成
 */

import type { Post } from './api';
import { stripHtml } from './postUtils';

/**
 * 記事のメタdescriptionを生成する（最大160文字）
 *
 * @param contentHtml - HTMLコンテンツ
 * @returns サニタイズ済みプレーンテキスト（最大160文字）
 */
export function generateDescription(contentHtml: string): string {
  const plainText = stripHtml(contentHtml);
  if (plainText.length <= 160) {
    return plainText;
  }
  return plainText.substring(0, 160) + '...';
}

/**
 * 記事の公開日を日本語フォーマットで取得
 * publishedAtがあればそれを、なければcreatedAtを使用
 *
 * @param post - 記事オブジェクト
 * @returns 日本語フォーマットの日付文字列
 */
export function formatPublishedDate(post: Post): string {
  const dateString = post.publishedAt ?? post.createdAt;
  return formatPostDate(dateString);
}

/**
 * 日付文字列を日本語フォーマットに変換
 *
 * @param dateString - ISO 8601形式の日付文字列
 * @returns 日本語フォーマットの日付文字列 (例: "2024年1月15日")
 */
export function formatPostDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 記事の最初の画像URLを取得
 *
 * @param imageUrls - 画像URLの配列
 * @returns 最初の画像URL、存在しない場合はundefined
 */
export function getFirstImage(
  imageUrls: string[] | undefined
): string | undefined {
  if (!imageUrls || imageUrls.length === 0) {
    return undefined;
  }
  return imageUrls[0];
}

/**
 * 記事の画像URL配列を取得（undefinedの場合は空配列を返す）
 *
 * @param post - 記事オブジェクト
 * @returns 画像URL配列
 */
export function getPostImageUrls(post: Post): string[] {
  return post.imageUrls ?? [];
}
