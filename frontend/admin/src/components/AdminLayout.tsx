/**
 * AdminLayout Component
 *
 * 管理画面の共通レイアウト（ブログトップページとデザイン統一）
 */

import React from 'react';
import AdminHeader from './AdminHeader';

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  title,
  subtitle,
  actions,
  compact = false,
}) => {
  return (
    <>
      <div className={`admin-page${compact ? ' admin-page-writing' : ''}`}>
        <AdminHeader />

        {(title || subtitle) && (
          <section className="admin-hero">
            <div className="admin-hero-content">
              {subtitle && <p className="admin-hero-subtitle">{subtitle}</p>}
              {title && <h1 className="admin-hero-title">{title}</h1>}
              {actions && <div className="admin-hero-actions">{actions}</div>}
            </div>
          </section>
        )}

        <main className="admin-main">
          <div className="admin-container">{children}</div>
        </main>
      </div>

      <style>{`
        .admin-page {
          min-height: 100vh;
        }

        /* 公開サイトの大見出し・余白・細い区切り線に合わせる。 */
        .admin-hero {
          padding: 48px 40px 36px;
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }

        .admin-hero-content {
          max-width: 1160px;
          margin: 0 auto;
        }

        /* 公開サイトの hero-eyebrow 相当 */
        .admin-hero-subtitle {
          margin: 0 0 12px;
          color: var(--color-text-muted);
          font-family: var(--font-display);
          font-size: 0.8rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        /* 公開サイトの hero-title 相当 */
        .admin-hero-title {
          margin: 0;
          color: var(--color-text-heading);
          font-family: var(--font-display);
          font-size: clamp(2rem, 4.5vw, 3.5rem);
          font-weight: 700;
          letter-spacing: -0.035em;
          line-height: 1.2;
        }

        .admin-hero-actions {
          margin-top: 28px;
          display: flex;
          gap: 12px;
          justify-content: flex-start;
          flex-wrap: wrap;
        }

        .admin-main {
          padding: 36px 0 96px;
        }

        .admin-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 40px;
        }

        @media (max-width: 768px) {
          .admin-hero {
            padding: 32px 20px 28px;
          }

          .admin-hero-subtitle {
            margin-bottom: 16px;
            font-size: 0.68rem;
          }

          .admin-hero-title {
            font-size: 2rem;
          }

          .admin-main {
            padding: 38px 0 72px;
          }

          .admin-container {
            padding: 0 20px;
          }
        }
      `}</style>
    </>
  );
};

export default AdminLayout;
