/**
 * Header Component
 *
 * サイト全体のヘッダー（視認性改善）
 */

import React from 'react';
import { Link } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <>
      <header className="site-header">
        <div className="header-container">
          <Link to="/" className="site-logo">
            <h1>My Tech Blog</h1>
          </Link>
          <nav className="site-nav">
            <Link to="/" className="nav-link">
              ホーム
            </Link>
          </nav>
        </div>
      </header>

      <style>{`
        .site-header {
          background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          position: sticky;
          top: 0;
          z-index: 1000;
        }

        .header-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 70px;
        }

        .site-logo {
          text-decoration: none;
          color: white;
        }

        .site-logo h1 {
          margin: 0;
          font-size: 1.8rem;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .site-nav {
          display: flex;
          gap: 25px;
        }

        .nav-link {
          color: white;
          text-decoration: none;
          font-size: 1.05rem;
          font-weight: 500;
          transition: opacity 0.2s;
          padding: 8px 0;
          border-bottom: 2px solid transparent;
        }

        .nav-link:hover {
          opacity: 0.85;
          border-bottom-color: white;
        }

        @media (max-width: 768px) {
          .header-container {
            height: 60px;
          }

          .site-logo h1 {
            font-size: 1.4rem;
          }

          .nav-link {
            font-size: 0.95rem;
          }
        }
      `}</style>
    </>
  );
};

export default Header;
