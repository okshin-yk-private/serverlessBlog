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

export interface SocialLink {
  name: string;
  url: string;
}

export interface SiteMetadata {
  siteName: string;
  siteDescription: string;
  author: {
    name: string;
    role?: string;
    bio?: string;
  };
  socialLinks: SocialLink[];
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
    siteName: 'Bone of my fallacy',
    siteDescription:
      'テクノロジー、ライフスタイル、プログラミングなど様々なトピックを扱う個人ブログ。',
    author: {
      name: 'okimoto(yokichi)',
      role: 'Cloud Engineer',
      bio: 'つくば市 / 2025 Japan All AWS Certifications Engineers / JAWS-UG 茨城運営 / INTJ / 自作キーボード / ルビコン塾',
    },
    socialLinks: [
      { name: 'X', url: 'https://x.com/WfallGo' },
      { name: 'GitHub', url: 'https://github.com/okshn-yk' },
      { name: 'GitHub Org', url: 'https://github.com/okshin-yk-private' },
    ],
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
        heading: 'About This Blog',
        content:
          'Welcome to Bone of my fallacy.\n\nこのサイトの内容は個人の感想です。\n何かを代表したり正しさを担保するものでは全くありません。',
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
