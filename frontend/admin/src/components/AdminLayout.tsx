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
          <div className="admin-hero">
            <div className="admin-hero-content">
              {title && <h1 className="admin-hero-title">{title}</h1>}
              {subtitle && <p className="admin-hero-subtitle">{subtitle}</p>}
              {actions && <div className="admin-hero-actions">{actions}</div>}
            </div>
          </div>
        )}

        <main className="admin-main">
          <div className="admin-container">{children}</div>
        </main>
      </div>

      <style>{`
        .admin-page {
          min-height: 100vh;
          background: #fafafa;
        }

        .admin-hero {
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          padding: 48px 32px;
          border-bottom: 1px solid #e5e7eb;
        }

        .admin-hero-content {
          max-width: 1200px;
          margin: 0 auto;
        }

        .admin-hero-title {
          font-family: 'Caveat', cursive;
          font-size: 2.5rem;
          font-weight: 600;
          color: #2D2A5A;
          margin: 0 0 8px 0;
          letter-spacing: 0.02em;
        }

        .admin-hero-subtitle {
          font-size: 1.125rem;
          color: #6b7280;
          margin: 0;
          line-height: 1.6;
        }

        .admin-hero-actions {
          margin-top: 24px;
          display: flex;
          gap: 12px;
        }

        .admin-main {
          padding: 40px 0;
        }

        .admin-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
        }

        /* Shared styles moved to styles/admin.css */

        @media (max-width: 768px) {
          .admin-hero {
            padding: 32px 20px;
          }

          .admin-hero-title {
            font-size: 1.75rem;
          }

          .admin-hero-subtitle {
            font-size: 1rem;
          }

          .admin-main {
            padding: 24px 0;
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
