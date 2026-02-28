import { Skeleton, SkeletonListItem } from './SkeletonBase';

export const PostListSkeleton: React.FC = () => (
  <div data-testid="post-list-skeleton" aria-busy="true" aria-label="Loading">
    {/* 検索バー */}
    <div style={{ marginBottom: '24px' }}>
      <Skeleton className="h-12 w-96 max-w-full rounded-xl" />
    </div>

    {/* タブ */}
    <div className="admin-tabs">
      <Skeleton className="h-10 w-20 rounded-3xl" />
      <Skeleton className="h-10 w-20 rounded-3xl" />
    </div>

    {/* 記事リスト */}
    <div className="admin-list">
      <SkeletonListItem />
      <SkeletonListItem />
      <SkeletonListItem />
      <SkeletonListItem />
      <SkeletonListItem />
    </div>
  </div>
);
