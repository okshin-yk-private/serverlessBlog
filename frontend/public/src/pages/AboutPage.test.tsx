/**
 * AboutPage Component Tests
 *
 * ブログ紹介・プロフィールページのテスト
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AboutPage from './AboutPage';

describe('AboutPage', () => {
  beforeEach(() => {
    // Clean up meta tags from previous tests
    document
      .querySelectorAll('meta[name="description"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[name="keywords"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[property^="og:"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[name^="twitter:"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('link[rel="canonical"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((el) => el.remove());
  });

  const renderAboutPage = () => {
    return render(
      <MemoryRouter initialEntries={['/about']}>
        <Routes>
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('ページレンダリング', () => {
    test('Aboutタイトルが表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('heading', { level: 1, name: 'About' })
      ).toBeInTheDocument();
    });

    test('ブログ紹介セクションが表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'About This Blog' })
      ).toBeInTheDocument();
    });

    test('プロフィールセクションが表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Profile' })
      ).toBeInTheDocument();
    });

    test('Connectセクションが表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Connect' })
      ).toBeInTheDocument();
    });

    test('ブログ名が紹介文に含まれる', () => {
      renderAboutPage();
      expect(screen.getByText(/Bone of my fallacy/)).toBeInTheDocument();
    });
  });

  describe('ソーシャルリンク', () => {
    test('Xリンクが表示される', () => {
      renderAboutPage();
      expect(screen.getByRole('link', { name: 'X' })).toBeInTheDocument();
    });

    test('GitHubリンクが表示される', () => {
      renderAboutPage();
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    });

    test('GitHub Orgリンクが表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('link', { name: 'GitHub Org' })
      ).toBeInTheDocument();
    });

    test('ソーシャルリンクが新しいタブで開く設定になっている', () => {
      renderAboutPage();
      const xLink = screen.getByRole('link', { name: 'X' });
      expect(xLink).toHaveAttribute('target', '_blank');
      expect(xLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('プロフィール', () => {
    test('プロフィール画像が表示される', () => {
      renderAboutPage();
      const avatar = screen.getByAltText('Profile');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', '/profile.png');
    });

    test('著者名が表示される', () => {
      renderAboutPage();
      expect(
        screen.getByRole('heading', { level: 3, name: 'okimoto(yokichi)' })
      ).toBeInTheDocument();
    });

    test('役職が表示される', () => {
      renderAboutPage();
      expect(screen.getByText('Cloud Engineer')).toBeInTheDocument();
    });
  });

  describe('SEO', () => {
    test('ページタイトルにAboutが含まれる', () => {
      renderAboutPage();
      // SEOHead componentがtitleを設定
      expect(document.title).toContain('About');
    });
  });
});
