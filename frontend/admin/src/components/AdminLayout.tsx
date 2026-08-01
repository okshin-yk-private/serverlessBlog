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
}

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  title,
  subtitle,
  actions,
}) => {
  return (
    <>
      <div className="admin-page">
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

        /* 公開サイト (index.astro / about.astro) のヒーローと同じ表現 */
        .admin-hero {
          position: relative;
          overflow: hidden;
          padding: 68px 32px;
          text-align: center;
          border-bottom: 1px solid var(--color-border);
        }

        .admin-hero::before,
        .admin-hero::after {
          content: '';
          position: absolute;
          border: 1px solid var(--color-border);
          border-radius: 50%;
          opacity: 0.52;
          pointer-events: none;
        }

        .admin-hero::before {
          width: 500px;
          height: 500px;
          top: -330px;
          left: -110px;
        }

        .admin-hero::after {
          width: 360px;
          height: 360px;
          right: -180px;
          bottom: -245px;
        }

        .admin-hero-content {
          position: relative;
          z-index: 1;
          max-width: 850px;
          margin: 0 auto;
        }

        /* 公開サイトの hero-eyebrow 相当 */
        .admin-hero-subtitle {
          margin: 0 0 20px;
          color: var(--color-text-muted);
          font-family: var(--font-display);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        /* 公開サイトの hero-title 相当 */
        .admin-hero-title {
          margin: 0;
          color: var(--color-text-muted);
          font-family: var(--font-body);
          font-size: clamp(1.25rem, 2.4vw, 1.75rem);
          font-weight: 500;
          letter-spacing: 0.06em;
          line-height: 1.45;
        }

        .admin-hero-actions {
          margin-top: 28px;
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .admin-main {
          padding: 52px 0 112px;
        }

        .admin-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 40px;
        }

        /* Shared styles moved to styles/admin.css */

        @media (max-width: 768px) {
          .admin-hero {
            padding: 50px 20px;
          }

          .admin-hero-subtitle {
            margin-bottom: 16px;
            font-size: 0.68rem;
          }

          .admin-hero-title {
            font-size: 1.05rem;
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
