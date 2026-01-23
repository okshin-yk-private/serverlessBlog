/**
 * Header Component
 *
 * サイト全体のヘッダー（モダンデザイン）
 */

import React from 'react';
import { Link } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <>
      <header className="site-header">
        <div className="header-container">
          <Link to="/" className="site-logo">
            <img src="/fallacy.png" alt="Logo" className="logo-image" />
            <span className="site-title">Bone of my fallacy</span>
          </Link>
          <nav className="site-nav">
            <Link to="/" className="nav-link">
              Articles
            </Link>
            <Link to="/about" className="nav-link">
              About
            </Link>
            <a href="/admin/" className="admin-icon-link" title="Admin">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="admin-icon-svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </a>
          </nav>
        </div>
      </header>

      <style>{`
        .site-header {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          position: sticky;
          top: 0;
          z-index: 1000;
          backdrop-filter: blur(8px);
          background: rgba(255, 255, 255, 0.95);
        }

        .header-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 72px;
        }

        .site-logo {
          text-decoration: none;
          display: flex;
          align-items: center;
          transition: opacity 0.2s ease;
        }

        .site-logo:hover {
          opacity: 0.8;
        }

        .logo-image {
          height: 40px;
          width: auto;
          margin-right: 12px;
        }

        .site-title {
          font-family: 'Caveat', cursive;
          font-size: 1.6rem;
          font-weight: 600;
          color: #1f2937;
          letter-spacing: 0.02em;
        }

        .site-nav {
          display: flex;
          gap: 32px;
          align-items: center;
        }

        .nav-link {
          color: #374151;
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 500;
          transition: color 0.2s ease;
          padding: 8px 0;
          position: relative;
        }

        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 2px;
          background: #374151;
          transition: width 0.2s ease;
        }

        .nav-link:hover {
          color: #111827;
        }

        .nav-link:hover::after {
          width: 100%;
        }

        .admin-icon-link {
          color: #6b7280;
          text-decoration: none;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          padding: 8px;
          margin-left: 8px;
        }

        .admin-icon-link:hover {
          color: #374151;
        }

        .admin-icon-svg {
          width: 20px;
          height: 20px;
        }

        @media (max-width: 768px) {
          .header-container {
            height: 64px;
            padding: 0 20px;
          }

          .logo-image {
            height: 32px;
            margin-right: 8px;
          }

          .site-title {
            font-size: 1.2rem;
          }

          .site-nav {
            gap: 20px;
          }

          .nav-link {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </>
  );
};

export default Header;
