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
          font-size: 2.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px 0;
          letter-spacing: -0.02em;
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

        /* Common card styles */
        .admin-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          transition: all 0.2s ease;
        }

        .admin-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .admin-card-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 16px 0;
        }

        /* Button styles */
        .admin-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
        }

        .admin-btn-primary {
          background: #111827;
          color: white;
        }

        .admin-btn-primary:hover {
          background: #374151;
        }

        .admin-btn-secondary {
          background: white;
          color: #374151;
          border: 1px solid #e5e7eb;
        }

        .admin-btn-secondary:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .admin-btn-success {
          background: #059669;
          color: white;
        }

        .admin-btn-success:hover {
          background: #047857;
        }

        .admin-btn-danger {
          background: #dc2626;
          color: white;
        }

        .admin-btn-danger:hover {
          background: #b91c1c;
        }

        .admin-btn-warning {
          background: #d97706;
          color: white;
        }

        .admin-btn-warning:hover {
          background: #b45309;
        }

        .admin-btn-sm {
          padding: 6px 14px;
          font-size: 0.875rem;
        }

        .admin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Stat card styles */
        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }

        .admin-stat-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          transition: all 0.2s ease;
        }

        .admin-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
        }

        .admin-stat-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 8px 0;
          font-weight: 500;
        }

        .admin-stat-value {
          font-size: 2.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .admin-stat-value.accent {
          color: #111827;
        }

        /* List styles */
        .admin-list {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        .admin-list-item {
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
          transition: background 0.2s ease;
        }

        .admin-list-item:last-child {
          border-bottom: none;
        }

        .admin-list-item:hover {
          background: #f9fafb;
        }

        /* Input styles */
        .admin-input {
          width: 100%;
          padding: 12px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.95rem;
          background: white;
          transition: all 0.2s ease;
        }

        .admin-input:focus {
          outline: none;
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
        }

        .admin-input::placeholder {
          color: #9ca3af;
        }

        /* Tab styles */
        .admin-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }

        .admin-tab {
          padding: 10px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          background: white;
          color: #6b7280;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .admin-tab:hover {
          border-color: #d1d5db;
          color: #374151;
        }

        .admin-tab.active {
          background: #111827;
          color: white;
          border-color: #111827;
        }

        /* Alert styles */
        .admin-alert {
          padding: 16px 20px;
          border-radius: 12px;
          margin-bottom: 24px;
          font-size: 0.95rem;
        }

        .admin-alert-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .admin-alert-success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .admin-alert-warning {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        /* Badge styles */
        .admin-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .admin-badge-dark {
          background: #111827;
          color: white;
        }

        .admin-badge-light {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #e5e7eb;
        }

        .admin-badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .admin-badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        /* Empty state */
        .admin-empty {
          text-align: center;
          padding: 48px 24px;
          color: #6b7280;
        }

        .admin-empty-title {
          font-size: 1.125rem;
          font-weight: 500;
          color: #374151;
          margin: 0 0 8px 0;
        }

        .admin-empty-desc {
          margin: 0;
        }

        /* Loading state */
        .admin-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 48px;
          color: #6b7280;
        }

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

          .admin-card {
            padding: 20px;
          }
        }
      `}</style>
    </>
  );
};

export default AdminLayout;
