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
            <img src="/fallacy.png" alt="Logo" className="admin-logo-image" />
            <span className="admin-site-title">Bone of my fallacy</span>
            <span className="admin-badge admin-badge-header">Admin</span>
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
            <Link
              to="/categories"
              className={`admin-nav-link ${isActive('/categories') ? 'active' : ''}`}
            >
              Categories
            </Link>
            <Link
              to="/mindmaps"
              className={`admin-nav-link ${isActive('/mindmaps') ? 'active' : ''}`}
            >
              Mindmaps
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-nav-link admin-nav-external"
            >
              View Site
              <svg
                className="external-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
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
          transition: opacity 0.2s ease;
        }

        .admin-logo:hover {
          opacity: 0.8;
        }

        .admin-logo-image {
          height: 40px;
          width: auto;
          margin-right: 12px;
        }

        .admin-site-title {
          font-family: 'Caveat', cursive;
          font-size: 1.6rem;
          font-weight: 600;
          color: #1f2937;
          letter-spacing: 0.02em;
          margin-right: 12px;
        }

        .admin-nav {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .admin-nav-link {
          color: #374151;
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
          background: #2D2A5A;
          transition: width 0.2s ease;
        }

        .admin-nav-link:hover {
          color: #1f2937;
        }

        .admin-nav-link:hover::after {
          width: 100%;
        }

        .admin-nav-link.active {
          color: #1f2937;
        }

        .admin-nav-link.active::after {
          width: 100%;
        }

        .admin-nav-external {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6b7280 !important;
        }

        .admin-nav-external:hover {
          color: #2D2A5A !important;
        }

        .admin-nav-external::after {
          display: none;
        }

        .external-icon {
          flex-shrink: 0;
        }

        .admin-nav-new {
          background: #2D2A5A;
          color: white !important;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .admin-nav-new::after {
          display: none;
        }

        .admin-nav-new:hover {
          background: #3d3a6a;
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
          border-color: #2D2A5A;
          color: #2D2A5A;
          background: #f9fafb;
        }

        @media (max-width: 768px) {
          .admin-header-container {
            height: 64px;
            padding: 0 20px;
          }

          .admin-logo-image {
            height: 32px;
            margin-right: 8px;
          }

          .admin-site-title {
            font-size: 1.2rem;
            margin-right: 8px;
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

        @media (max-width: 640px) {
          .admin-site-title {
            display: none;
          }
        }
      `}</style>
    </>
  );
};

export default AdminHeader;
