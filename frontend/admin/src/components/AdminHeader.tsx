/**
 * AdminHeader Component
 *
 * 管理画面のヘッダー（ブログトップページとデザイン統一）
 */

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';

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
          <Link
            to="/dashboard"
            className="admin-logo"
            aria-label="Bone of my fallacy - Admin"
          >
            <img
              src="/logo-light.png"
              alt="Bone of my fallacy"
              className="admin-logo-image admin-logo-image-light"
            />
            <img
              src="/logo-dark.png"
              alt=""
              aria-hidden="true"
              className="admin-logo-image admin-logo-image-dark"
            />
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
            <ThemeToggle />
            <button onClick={handleLogout} className="admin-logout-btn">
              Logout
            </button>
          </nav>
        </div>
      </header>

      <style>{`
        /* 公開サイト (public-astro) の Header.astro と同じヘッダー表現 */
        .admin-header {
          background: color-mix(in srgb, var(--color-bg) 88%, transparent);
          border-bottom: 1px solid var(--color-border);
          position: sticky;
          top: 0;
          z-index: 1000;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .admin-header-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 88px;
        }

        .admin-logo {
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 12px;
          line-height: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .admin-logo:hover {
          opacity: 0.82;
          transform: translateY(-1px);
        }

        .admin-logo-image {
          display: block;
          height: 58px;
          width: auto;
          max-width: 230px;
          object-fit: contain;
        }

        .admin-logo-image-light {
          mix-blend-mode: multiply;
        }

        .admin-logo-image-dark {
          display: none;
        }

        :root[data-theme="dark"] .admin-logo-image-light {
          display: none;
        }

        :root[data-theme="dark"] .admin-logo-image-dark {
          display: block;
        }

        .admin-nav {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .admin-nav-link {
          color: var(--color-text-muted);
          text-decoration: none;
          font-family: var(--font-display);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: color 0.2s ease, background 0.2s ease;
          padding: 10px 14px;
          border-radius: 999px;
          position: relative;
        }

        .admin-nav-link:hover {
          color: var(--color-text-heading);
          background: var(--color-primary-soft);
        }

        .admin-nav-link.active {
          color: var(--color-primary);
          background: var(--color-primary-soft);
        }

        .admin-nav-external {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .admin-nav-external:hover {
          color: var(--color-accent);
        }

        .external-icon {
          flex-shrink: 0;
        }

        .admin-nav-new {
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-primary);
        }

        .admin-nav-new:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
          background: var(--color-primary-soft);
        }

        .admin-logout-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--color-text-muted);
          padding: 10px 14px;
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }

        .admin-logout-btn:hover {
          border-color: var(--color-border);
          color: var(--color-accent);
          background: var(--color-surface);
        }

        @media (max-width: 768px) {
          .admin-header-container {
            height: 72px;
            padding: 0 20px;
          }

          .admin-logo {
            gap: 8px;
          }

          .admin-logo-image {
            height: 46px;
            max-width: 178px;
          }

          .admin-nav {
            gap: 2px;
          }

          .admin-nav-link,
          .admin-logout-btn {
            font-size: 0.68rem;
            padding: 8px 9px;
          }
        }

        @media (max-width: 640px) {
          .admin-badge-header {
            display: none;
          }

          .admin-nav-external {
            display: none;
          }
        }
      `}</style>
    </>
  );
};

export default AdminHeader;
