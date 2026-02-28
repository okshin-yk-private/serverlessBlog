/**
 * AboutPage Component
 *
 * ブログの紹介と管理者プロフィールページ
 */

import React from 'react';
import { SEOHead } from '../components/SEOHead';

// ソーシャルリンクの型定義
interface SocialLink {
  name: string;
  url: string;
  icon: React.ReactNode;
}

// X (Twitter) アイコン
const XIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="social-icon">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// GitHub アイコン
const GitHubIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="social-icon">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

// ソーシャルリンクの設定（プレースホルダー - 実際の値は設定で変更可能）
const socialLinks: SocialLink[] = [
  {
    name: 'X',
    url: 'https://x.com/WfallGo',
    icon: <XIcon />,
  },
  {
    name: 'GitHub',
    url: 'https://github.com/okshn-yk',
    icon: <GitHubIcon />,
  },
  {
    name: 'GitHub Org',
    url: 'https://github.com/okshin-yk-private',
    icon: <GitHubIcon />,
  },
];

const AboutPage: React.FC = () => {
  return (
    <div className="page-container">
      <SEOHead
        title="About - Bone of my fallacy"
        description="このブログについてと管理者のプロフィール"
        keywords={['about', 'profile', 'blog']}
        url={window.location.href}
        type="website"
      />

      {/* Hero Section */}
      <div className="hero-section">
        <h1 className="hero-title">About</h1>
      </div>

      <div className="container">
        {/* Blog Introduction */}
        <section className="about-section">
          <h2 className="section-title">About This Blog</h2>
          <div className="section-content">
            <p>
              Welcome to <strong>Bone of my fallacy</strong>.
            </p>
            <p>
              このサイトの内容は個人の感想です。
              <br />
              何かを代表したり正しさを担保するものでは全くありません。
            </p>
          </div>
        </section>

        {/* Profile Section */}
        <section className="about-section">
          <h2 className="section-title">Profile</h2>
          <div className="profile-card">
            <div className="profile-avatar">
              <img src="/profile.png" alt="Profile" className="avatar-image" />
            </div>
            <div className="profile-info">
              <h3 className="profile-name">okimoto(yokichi)</h3>
              <p className="profile-role">Cloud Engineer</p>
              <p className="profile-bio">
                つくば市 / 2025 Japan All AWS Certifications Engineers / JAWS-UG
                茨城運営 / INTJ / 自作キーボード / ルビコン塾
              </p>
            </div>
          </div>
        </section>

        {/* Social Links */}
        <section className="about-section">
          <h2 className="section-title">Connect</h2>
          <div className="social-links">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-link"
                title={link.name}
                aria-label={link.name}
              >
                {link.icon}
                <span className="social-name">{link.name}</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .page-container {
          min-height: 100vh;
          background: #fafafa;
        }

        .hero-section {
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          padding: 80px 32px 60px;
          text-align: center;
          border-bottom: 1px solid #e5e7eb;
        }

        .hero-title {
          font-size: 3.5rem;
          font-weight: 500;
          color: #111827;
          margin: 0;
          letter-spacing: 0.02em;
          font-family: 'Caveat', cursive;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 60px 32px;
        }

        .about-section {
          margin-bottom: 60px;
        }

        .about-section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: #2D2A5A;
          margin: 0 0 24px 0;
          padding-bottom: 12px;
          border-bottom: 2px solid #C9A857;
          display: inline-block;
        }

        .section-content {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 32px;
        }

        .section-content p {
          color: #4b5563;
          font-size: 1rem;
          line-height: 1.8;
          margin: 0 0 16px 0;
          white-space: pre-line;
        }

        .section-content p:last-child {
          margin-bottom: 0;
        }

        .section-content strong {
          color: #2D2A5A;
        }

        /* Profile Card */
        .profile-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 32px;
          display: flex;
          gap: 32px;
          align-items: flex-start;
        }

        .profile-avatar {
          flex-shrink: 0;
        }

        .avatar-image {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #e5e7eb;
        }

        .profile-info {
          flex: 1;
        }

        .profile-name {
          font-size: 1.5rem;
          font-weight: 600;
          color: #2D2A5A;
          margin: 0 0 8px 0;
        }

        .profile-role {
          font-size: 1rem;
          color: #C9A857;
          font-weight: 500;
          margin: 0 0 16px 0;
        }

        .profile-bio {
          color: #4b5563;
          font-size: 1rem;
          line-height: 1.8;
          margin: 0;
        }

        /* Social Links */
        .social-links {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        .social-link {
          display: flex;
          align-items: center;
          gap: 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px 24px;
          text-decoration: none;
          color: #374151;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .social-link:hover {
          border-color: #2D2A5A;
          color: #2D2A5A;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(45, 42, 90, 0.15);
        }

        .social-icon {
          width: 24px;
          height: 24px;
        }

        .social-name {
          font-size: 0.95rem;
        }

        @media (max-width: 768px) {
          .hero-section {
            padding: 60px 20px 40px;
          }

          .hero-title {
            font-size: 2.5rem;
          }

          .container {
            padding: 40px 20px;
          }

          .profile-card {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .avatar-image {
            width: 100px;
            height: 100px;
          }

          .social-links {
            justify-content: center;
          }

          .social-link {
            padding: 12px 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default AboutPage;
