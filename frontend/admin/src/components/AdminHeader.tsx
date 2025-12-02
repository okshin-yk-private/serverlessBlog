/**
 * AdminHeader Component
 *
 * 管理画面のヘッダー（ブログトップページとデザイン統一）
 */

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AdminHeader: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + '/')
    );
  };

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-container">
          <Link to="/dashboard" className="admin-logo">
            <img
              src="/logo_name.png"
              alt="Polylex Admin"
              className="admin-logo-image"
            />
            <span className="admin-badge">Admin</span>
          </Link>
          <nav className="admin-nav">
            <Link
              to="/dashboard"
              className={`admin-nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            >
              Dashboard
            </Link>
            <Link
              to="/posts"
              className={`admin-nav-link ${isActive('/posts') ? 'active' : ''}`}
            >
              Articles
            </Link>
            <Link to="/posts/new" className="admin-nav-link admin-nav-new">
              + New
            </Link>
            <button onClick={handleLogout} className="admin-logout-btn">
              Logout
            </button>
          </nav>
        </div>
      </header>

      <style>{`
        .admin-header {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          position: sticky;
          top: 0;
          z-index: 1000;
          backdrop-filter: blur(8px);
          background: rgba(255, 255, 255, 0.95);
        }

        .admin-header-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 72px;
        }

        .admin-logo {
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: opacity 0.2s ease;
        }

        .admin-logo:hover {
          opacity: 0.8;
        }

        .admin-logo-image {
          height: 48px;
          width: auto;
        }

        .admin-badge {
          background: #111827;
          color: white;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .admin-nav {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .admin-nav-link {
          color: #6b7280;
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 500;
          transition: color 0.2s ease;
          padding: 8px 0;
          position: relative;
        }

        .admin-nav-link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 2px;
          background: #111827;
          transition: width 0.2s ease;
        }

        .admin-nav-link:hover {
          color: #111827;
        }

        .admin-nav-link:hover::after {
          width: 100%;
        }

        .admin-nav-link.active {
          color: #111827;
        }

        .admin-nav-link.active::after {
          width: 100%;
        }

        .admin-nav-new {
          background: #111827;
          color: white !important;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .admin-nav-new::after {
          display: none;
        }

        .admin-nav-new:hover {
          background: #374151;
          color: white !important;
        }

        .admin-logout-btn {
          background: transparent;
          border: 1px solid #e5e7eb;
          color: #6b7280;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .admin-logout-btn:hover {
          border-color: #d1d5db;
          color: #374151;
          background: #f9fafb;
        }

        @media (max-width: 768px) {
          .admin-header-container {
            height: 64px;
            padding: 0 20px;
          }

          .admin-logo-image {
            height: 36px;
          }

          .admin-badge {
            font-size: 0.65rem;
            padding: 3px 8px;
          }

          .admin-nav {
            gap: 12px;
          }

          .admin-nav-link {
            font-size: 0.85rem;
          }

          .admin-nav-new {
            padding: 6px 12px;
          }

          .admin-logout-btn {
            padding: 6px 12px;
            font-size: 0.85rem;
          }
        }
      `}</style>
    </>
  );
};

export default AdminHeader;
