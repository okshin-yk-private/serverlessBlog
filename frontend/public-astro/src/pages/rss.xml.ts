/**
 * RSS フィードエンドポイント
 *
 * Task 3.4: RSSフィード実装
 *
 * Requirements:
 * - 5.3: RSSフィードエンドポイント (rss.xml.ts) を実装
 * - 5.4: 最新20件の公開記事をフィードに含める
 * - 5.5: title、description、linkを各エントリに設定
 * - 14.4: UTF-8エンコーディングで日本語を正しく出力
 */

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { fetchAllPosts, type Post } from '../lib/api';
import { postsToRSSItems, escapeXml } from '../lib/rssUtils';

/**
 * RSS フィード生成
 *
 * ビルド時に呼び出され、dist/rss.xml として生成される
 */
export async function GET(context: APIContext) {
  // サイトURLを取得（astro.config.mjsで設定）
  const siteUrl = context.site?.toString() ?? 'https://example.com';
  const siteName = 'Serverless Blog';

  // 全公開記事を取得
  let posts: Post[];
  try {
    posts = await fetchAllPosts();
  } catch (error) {
    // ビルド時にAPIが利用できない場合は空のフィードを返す
    // (本番環境では適切にエラーハンドリングされる)
    console.warn('Failed to fetch posts for RSS feed:', error);
    posts = [];
  }

  // 記事をRSSアイテムに変換（最新20件）
  const rssItems = postsToRSSItems(posts, siteUrl);

  // @astrojs/rss を使用してフィードを生成
  return rss({
    // フィードのタイトル
    title: siteName,
    // フィードの説明
    description: `${siteName}の最新記事をお届けします`,
    // サイトURL
    site: siteUrl,
    // 言語設定（日本語）
    customData: `<language>ja</language>`,
    // RSSアイテム
    items: rssItems.map((item) => ({
      title: item.title,
      description: escapeXml(item.description),
      pubDate: item.pubDate,
      link: item.link,
      // カテゴリがある場合は追加
      ...(item.category && { categories: [item.category] }),
      // カスタムデータとしてguidを追加
      customData: `<guid isPermaLink="true">${escapeXml(item.guid)}</guid>`,
    })),
    // XMLスタイルシート（オプション）
    stylesheet: false,
    // トレーリングスラッシュ設定
    trailingSlash: true,
  });
}
