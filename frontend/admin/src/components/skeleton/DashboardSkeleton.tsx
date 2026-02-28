import { Skeleton, SkeletonStatCard, SkeletonListItem } from './SkeletonBase';

export const DashboardSkeleton: React.FC = () => (
  <div data-testid="dashboard-skeleton" aria-busy="true" aria-label="Loading">
    {/* 統計カード */}
    <div className="admin-stat-grid">
      <SkeletonStatCard />
      <SkeletonStatCard />
    </div>

    {/* クイックアクション */}
    <div className="admin-card">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>

    {/* 最近の公開記事 */}
    <div style={{ marginBottom: '32px' }}>
      <Skeleton className="h-6 w-40 mb-4" />
      <div className="admin-list">
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </div>
    </div>

    {/* 最近の下書き */}
    <div>
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="admin-list">
        <SkeletonListItem />
        <SkeletonListItem />
      </div>
    </div>
  </div>
);
