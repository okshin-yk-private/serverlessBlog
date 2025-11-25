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
            <img src="/logo_name.png" alt="Polylex" className="logo-image" />
          </Link>
          <nav className="site-nav">
            <Link to="/" className="nav-link">
              Articles
            </Link>
            <Link to="/" className="nav-link">
              About
            </Link>
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
          height: 48px;
          width: auto;
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

        @media (max-width: 768px) {
          .header-container {
            height: 64px;
            padding: 0 20px;
          }

          .logo-image {
            height: 40px;
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
