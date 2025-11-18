/**
 * App Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    // Act & Assert
    expect(() => render(<App />)).not.toThrow();
  });

  it('renders BrowserRouter', () => {
    // Act
    const { container } = render(<App />);

    // Assert - コンテンツがレンダリングされることを確認
    expect(container).toBeTruthy();
    expect(container.innerHTML).toBeTruthy();
  });
});
