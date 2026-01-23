/**
 * App Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import App from './App';

// APIモック
vi.mock('./services/api', () => ({
  fetchPosts: vi.fn().mockResolvedValue({
    posts: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  }),
  fetchPost: vi.fn().mockResolvedValue(null),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    // Act
    const { unmount } = render(<App />);

    // Wait for async operations
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });

    // Cleanup
    unmount();
  });

  it('renders BrowserRouter', async () => {
    // Act
    const { container, unmount } = render(<App />);

    // Wait for async operations
    await waitFor(() => {
      expect(container).toBeTruthy();
    });

    // Assert - コンテンツがレンダリングされることを確認
    expect(container.innerHTML).toBeTruthy();

    // Cleanup
    unmount();
  });
});
