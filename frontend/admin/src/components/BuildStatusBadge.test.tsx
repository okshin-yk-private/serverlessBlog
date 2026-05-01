import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('../api/posts');
const postsApi = await import('../api/posts');
const mockedFetch = vi.mocked(postsApi.fetchBuildStatus);

const { BuildStatusBadge } = await import('./BuildStatusBadge');

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('BuildStatusBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when disabled', () => {
    const { container } = render(
      <BuildStatusBadge postId="p-1" enabled={false} />
    );
    expect(container.firstChild).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('renders nothing when postId is undefined', () => {
    const { container } = render(
      <BuildStatusBadge postId={undefined} enabled={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows in-progress label and no link while building', async () => {
    mockedFetch.mockResolvedValue({
      status: 'in-progress',
      buildId: 'b-1',
      phase: 'BUILD',
    });

    render(
      <BuildStatusBadge
        postId="p-1"
        enabled
        publicUrl="https://example.com/posts/p-1"
        intervalMs={1000}
      />
    );

    await flush();
    const badge = screen.getByTestId('build-status-badge');
    expect(badge.dataset.status).toBe('in-progress');
    expect(badge.textContent).toContain('ビルド中');
    expect(screen.queryByText('公開サイトを開く')).toBeNull();
  });

  it('shows succeeded label with public-site link', async () => {
    mockedFetch.mockResolvedValue({
      status: 'succeeded',
      buildId: 'b-1',
    });

    render(
      <BuildStatusBadge
        postId="p-1"
        enabled
        publicUrl="https://example.com/posts/p-1"
        intervalMs={1000}
      />
    );

    await flush();
    expect(screen.getByTestId('build-status-badge').dataset.status).toBe(
      'succeeded'
    );
    const link = screen.getByText('公開サイトを開く').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com/posts/p-1');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('does not render the public-site link when publicUrl is missing', async () => {
    mockedFetch.mockResolvedValue({ status: 'succeeded', buildId: 'b-1' });

    render(<BuildStatusBadge postId="p-1" enabled intervalMs={1000} />);

    await flush();
    expect(screen.queryByText('公開サイトを開く')).toBeNull();
  });

  it('shows failed label with red styling', async () => {
    mockedFetch.mockResolvedValue({ status: 'failed', buildId: 'b-1' });

    render(<BuildStatusBadge postId="p-1" enabled intervalMs={1000} />);

    await flush();
    const badge = screen.getByTestId('build-status-badge');
    expect(badge.dataset.status).toBe('failed');
    expect(badge.textContent).toContain('ビルド失敗');
  });

  it('renders error message via role=alert when fetch fails', async () => {
    mockedFetch.mockRejectedValue(new Error('AccessDenied'));

    render(<BuildStatusBadge postId="p-1" enabled intervalMs={1000} />);

    await flush();
    expect(screen.getByRole('alert').textContent).toBe('AccessDenied');
  });
});
