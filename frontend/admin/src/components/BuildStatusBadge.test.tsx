import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';

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

  it('shows the real phase and elapsed time without inventing a percentage', async () => {
    vi.setSystemTime(new Date('2026-09-16T00:01:00Z'));
    mockedFetch.mockResolvedValue({
      status: 'in-progress',
      phase: 'POST_BUILD',
      startTime: '2026-09-16T00:00:00Z',
      phases: [{ name: 'BUILD', status: 'SUCCEEDED', durationSeconds: 12 }],
    });
    render(<BuildStatusBadge postId="p-1" enabled />);
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(
      'ファイル配置・配信先切替中'
    );
    const steps = within(
      screen.getByRole('list', { name: '公開までの工程' })
    ).getAllByRole('listitem');
    expect(steps.map((step) => step.dataset.state)).toEqual([
      'done',
      'done',
      'done',
      'active',
    ]);
    expect(screen.getByText('ビルド開始から 1分0秒')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('ビルド開始から 1分1秒')).toBeInTheDocument();
    expect(screen.getByText('12秒')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps queued saves at the waiting step with no build clock', async () => {
    mockedFetch.mockResolvedValue({ status: 'queued', phase: 'QUEUED' });
    render(<BuildStatusBadge postId="p-1" enabled targetRevision={5} />);
    await flush();
    const steps = screen.getAllByRole('listitem');
    expect(steps.map((step) => step.dataset.state)).toEqual([
      'active',
      'pending',
      'pending',
      'pending',
    ]);
    expect(screen.queryByText(/ビルド開始から/)).not.toBeInTheDocument();
  });

  it('identifies the failed phase instead of showing later cleanup as progress', async () => {
    mockedFetch.mockResolvedValue({
      status: 'failed',
      phase: 'COMPLETED',
      failedPhase: 'BUILD',
    });
    render(<BuildStatusBadge postId="p-1" enabled />);
    await flush();
    expect(
      screen.getAllByRole('listitem').map((step) => step.dataset.state)
    ).toEqual(['done', 'done', 'failed', 'pending']);
    expect(
      screen.getByText('記事の保存は完了しています。公開処理に失敗しました。')
    ).toBeInTheDocument();
  });

  it('explains unavailable details and does not assume the BUILD phase', async () => {
    mockedFetch.mockResolvedValue({
      status: 'in-progress',
      progressUnavailable: true,
    });
    render(<BuildStatusBadge postId="p-1" enabled />);
    await flush();
    expect(
      screen.getByText(/工程の詳細を一時的に取得できません/)
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('listitem')
        .every((step) => step.dataset.state === 'pending')
    ).toBe(true);
  });

  it('freezes elapsed time at the build end and distinguishes propagation from completion', async () => {
    mockedFetch.mockResolvedValue({
      status: 'succeeded',
      startTime: '2026-09-16T00:00:00Z',
      endTime: '2026-09-16T00:01:12Z',
    });
    render(<BuildStatusBadge postId="p-1" enabled />);
    await flush();
    expect(screen.getByText('ビルド開始から 1分12秒')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByText('ビルド開始から 1分12秒')).toBeInTheDocument();
    expect(screen.getByText(/閲覧先によって反映まで/)).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
