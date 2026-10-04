import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import './AdminHeader.css';

const AdminHeader = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/');

  useEffect(() => {
    if (!accountOpen) return;
    const outside = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [accountOpen]);

  return (
    <header className="admin-header">
      <div className="admin-header-container">
        <div className="admin-identity">
          <Link
            to="/dashboard"
            className="admin-logo"
            aria-label="Bone of my fallacy"
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
          </Link>
          <div className="admin-area-label">
            <span>管理画面</span>
            <small>Admin</small>
          </div>
        </div>
        <nav className="admin-nav" aria-label="管理画面のナビゲーション">
          {[
            ['/posts', 'Articles'],
            ['/categories', 'Categories'],
            ['/dashboard', 'Dashboard'],
          ].map(([path, label]) => (
            <Link
              key={path}
              to={path}
              aria-current={isActive(path) ? 'page' : undefined}
              className={`admin-nav-link ${isActive(path) ? 'active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="admin-header-tools">
          <Link to="/posts/new" className="admin-nav-link admin-nav-new">
            + New article
          </Link>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-nav-link"
          >
            View site <span aria-hidden="true">↗</span>
          </a>
          <div
            className="admin-account"
            ref={account}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setAccountOpen(false);
            }}
          >
            <button
              ref={trigger}
              type="button"
              className={`admin-nav-link ${isActive('/security') ? 'active' : ''}`}
              aria-expanded={accountOpen}
              aria-controls="admin-account-panel"
              onClick={() => setAccountOpen(!accountOpen)}
            >
              Account <span aria-hidden="true">▾</span>
            </button>
            {accountOpen && (
              <div id="admin-account-panel" className="admin-account-panel">
                <Link
                  to="/security"
                  aria-current={isActive('/security') ? 'page' : undefined}
                  className={`admin-nav-link ${isActive('/security') ? 'active' : ''}`}
                  onClick={() => setAccountOpen(false)}
                >
                  Security
                </Link>
                <div className="admin-account-theme">
                  <span>外観</span>
                  <ThemeToggle />
                </div>
                <button
                  className="admin-logout-btn"
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
export default AdminHeader;
