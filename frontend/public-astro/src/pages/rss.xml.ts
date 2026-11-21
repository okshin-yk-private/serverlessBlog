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
import { getCollection } from 'astro:content';
import { publishedPosts } from '../lib/publicationCalendar';
import { postsToRSSItems, escapeXml } from '../lib/rssUtils';
import { SITE_NAME } from '../lib/site';

/**
 * RSS フィード生成
 *
 * ビルド時に呼び出され、dist/rss.xml として生成される
 */
export async function GET(context: APIContext) {
  // サイトURLを取得（astro.config.mjsで設定）
  const siteUrl = context.site?.toString() ?? 'https://example.com';
  const asOf = new Date().toISOString();

  // 公開記事を重複排除・整形（未来日時記事は後続の postsToRSSItems で除外）
  const posts = publishedPosts(
    (await getCollection('posts')).map((entry) => entry.data),
    asOf
  );

  // 記事をRSSアイテムに変換（未来日時の予約記事を除外し最新20件）
  const rssItems = postsToRSSItems(posts, siteUrl, asOf);

  // @astrojs/rss を使用してフィードを生成
  return rss({
    // フィードのタイトル
    title: SITE_NAME,
    // フィードの説明
    description: `${SITE_NAME}の最新記事をお届けします`,
    // サイトURL
    site: siteUrl,
    // 言語設定（日本語）
    customData: `<language>ja</language>`,
    // RSSアイテム（@astrojs/rss 側が title / description を XML エスケープする）
    items: rssItems.map((item) => ({
      title: item.title,
      description: item.description,
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
