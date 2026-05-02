import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-label={
          isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える'
        }
        onClick={toggleTheme}
      >
        {isDark ? (
          <svg
            className="theme-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg
            className="theme-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      <style>{`
        .theme-toggle {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 6px;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--color-text-muted);
          transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .theme-toggle:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-surface-elevated);
        }

        .theme-icon {
          width: 18px;
          height: 18px;
        }
      `}</style>
    </>
  );
};

export default ThemeToggle;
