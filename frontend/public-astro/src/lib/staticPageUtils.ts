/**
 * Static Page Utility Functions
 *
 * Task 2.4: Aboutページと404ページ実装
 *
 * Requirements:
 * - 2.4: Aboutページを静的に生成
 * - 15.1: カスタム404ページを作成
 * - 15.2: 404ページにホームへのナビゲーションを含める
 * - 15.4: 404ページに `<meta name="robots" content="noindex">` を設定
 * - 15.5: 404ページでもサイトヘッダーとナビゲーションを維持
 */

export interface SiteMetadata {
  siteName: string;
  siteDescription: string;
  author: {
    name: string;
    bio?: string;
  };
}

export interface AboutPageContent {
  title: string;
  description: string;
  sections: {
    heading: string;
    content: string;
  }[];
}

export interface NotFoundPageContent {
  title: string;
  message: string;
  noindex: boolean;
  homeLink: string;
  homeButtonText: string;
  suggestions: {
    text: string;
    link: string;
  }[];
}

/**
 * Get site-wide metadata
 */
export function getSiteMetadata(): SiteMetadata {
  return {
    siteName: 'bone of my fallacy',
    siteDescription:
      'テクノロジー、ライフスタイル、プログラミングなど様々なトピックを扱う個人ブログ。',
    author: {
      name: 'okshin',
      bio: 'ソフトウェアエンジニア。クラウドアーキテクチャ、サーバーレス、AIに興味があります。',
    },
  };
}

/**
 * Get About page content
 */
export function getAboutPageContent(): AboutPageContent {
  const metadata = getSiteMetadata();

  return {
    title: 'About',
    description: `${metadata.siteName}について - ${metadata.siteDescription}`,
    sections: [
      {
        heading: 'このブログについて',
        content:
          'このブログは、テクノロジー、プログラミング、ライフスタイルなど、様々なトピックについて発信する個人ブログです。AWSを使ったサーバーレスアーキテクチャで構築されています。',
      },
      {
        heading: '著者について',
        content:
          metadata.author.bio || 'ソフトウェアエンジニアとして活動しています。',
      },
      {
        heading: '技術スタック',
        content:
          'このブログはAstro SSG、AWS Lambda（Go）、DynamoDB、CloudFront、S3を使用して構築されています。インフラはTerraformで管理されています。',
      },
    ],
  };
}

/**
 * Get 404 page content
 */
export function get404PageContent(): NotFoundPageContent {
  return {
    title: '404 - ページが見つかりません',
    message:
      'お探しのページは存在しないか、移動または削除された可能性があります。',
    noindex: true,
    homeLink: '/',
    homeButtonText: 'ホームに戻る',
    suggestions: [
      {
        text: 'トップページから記事を探す',
        link: '/',
      },
      {
        text: 'サイトについて知る',
        link: '/about',
      },
    ],
  };
}
