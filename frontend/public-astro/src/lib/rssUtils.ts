/**
 * RSS フィード ユーティリティ関数
 *
 * Task 3.4: RSSフィード実装
 *
 * Requirements:
 * - 5.3: RSSフィードエンドポイント (rss.xml.ts) を実装
 * - 5.4: 最新20件の公開記事をフィードに含める
 * - 5.5: title、description、linkを各エントリに設定
 * - 14.4: UTF-8エンコーディングで日本語を正しく出力
 */

import type { Post } from './api';
import { stripHtml } from './postUtils';

/**
 * RSSフィードアイテムの型定義
 */
export interface RSSItem {
  /** 記事タイトル */
  title: string;
  /** 記事の概要 */
  description: string;
  /** 記事への完全URL */
  link: string;
  /** 記事の公開日 (Date object) */
  pubDate: Date;
  /** 記事の一意識別子 (guid) */
  guid: string;
  /** カテゴリ（オプション） */
  category?: string;
  /** 著者（オプション） */
  author?: string;
}

/**
 * RSSフィード設定
 */
export interface RSSConfig {
  /** フィードタイトル */
  title: string;
  /** フィードの説明 */
  description: string;
  /** サイトURL */
  siteUrl: string;
  /** フィードの言語 */
  language?: string;
}

/**
 * 最大RSSアイテム数
 * (Requirements 5.4: 最新20件の公開記事)
 */
export const MAX_RSS_ITEMS = 20;

/**
 * RSS descriptionの最大文字数
 */
export const MAX_DESCRIPTION_LENGTH = 200;

/**
 * 記事をRSSアイテムに変換する
 *
 * @param post - 記事オブジェクト
 * @param siteUrl - サイトURL
 * @returns RSSアイテム
 */
export function postToRSSItem(post: Post, siteUrl: string): RSSItem {
  // タイトルをエスケープ（XML安全）
  const title = post.title;

  // descriptionはHTMLからプレーンテキストを抽出し、最大200文字に切り詰め
  const description = generateRSSDescription(post.contentHtml);

  // 完全なURLを生成
  const link = buildPostUrl(post.id, siteUrl);

  // 公開日または作成日を使用
  const pubDate = new Date(post.publishedAt ?? post.createdAt);

  // GUIDはリンクURLを使用（記事の一意性を保証）
  const guid = link;

  return {
    title,
    description,
    link,
    pubDate,
    guid,
    category: post.category || undefined,
    author: post.authorId || undefined,
  };
}

/**
 * RSS用のdescriptionを生成する（最大200文字）
 *
 * @param contentHtml - HTMLコンテンツ
 * @returns サニタイズ済みプレーンテキスト
 */
export function generateRSSDescription(contentHtml: string): string {
  const plainText = stripHtml(contentHtml);
  if (plainText.length <= MAX_DESCRIPTION_LENGTH) {
    return plainText;
  }
  return plainText.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
}

/**
 * 記事の完全URLを生成
 *
 * @param postId - 記事ID
 * @param siteUrl - サイトURL
 * @returns 完全なURL
 */
export function buildPostUrl(postId: string, siteUrl: string): string {
  // 末尾のスラッシュを正規化
  const normalizedSiteUrl = siteUrl.endsWith('/')
    ? siteUrl.slice(0, -1)
    : siteUrl;
  return `${normalizedSiteUrl}/posts/${postId}/`;
}

/**
 * 記事リストを最新20件に絞り、公開日順でソート
 *
 * @param posts - 記事リスト
 * @returns 最新20件の記事（公開日降順）
 */
export function getLatestPostsForRSS(posts: Post[]): Post[] {
  // 公開日または作成日でソート（降順）
  const sorted = [...posts].sort((a, b) => {
    const dateA = new Date(a.publishedAt ?? a.createdAt).getTime();
    const dateB = new Date(b.publishedAt ?? b.createdAt).getTime();
    return dateB - dateA;
  });

  // 最新20件に限定
  return sorted.slice(0, MAX_RSS_ITEMS);
}

/**
 * 記事リストをRSSアイテムリストに変換
 *
 * @param posts - 記事リスト
 * @param siteUrl - サイトURL
 * @returns RSSアイテムリスト（最新20件）
 */
export function postsToRSSItems(posts: Post[], siteUrl: string): RSSItem[] {
  const latestPosts = getLatestPostsForRSS(posts);
  return latestPosts.map((post) => postToRSSItem(post, siteUrl));
}

/**
 * XML特殊文字をエスケープする
 *
 * @param str - 文字列
 * @returns エスケープ済み文字列
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 日付をRFC 2822形式に変換
 * (RSSで使用される標準形式)
 *
 * @param date - Date object
 * @returns RFC 2822形式の日付文字列
 */
export function formatRFC2822(date: Date): string {
  return date.toUTCString();
}

/**
 * RSSフィードのデフォルト設定を生成
 *
 * @param siteUrl - サイトURL
 * @param siteName - サイト名
 * @returns RSS設定
 */
export function createDefaultRSSConfig(
  siteUrl: string,
  siteName: string
): RSSConfig {
  return {
    title: siteName,
    description: `${siteName}の最新記事をお届けします`,
    siteUrl,
    language: 'ja',
  };
}
