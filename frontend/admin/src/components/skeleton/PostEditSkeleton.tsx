import { Skeleton, SkeletonInput, SkeletonTextarea } from './SkeletonBase';

export const PostEditSkeleton: React.FC = () => (
  <div data-testid="post-edit-skeleton" aria-busy="true" aria-label="Loading">
    {/* 画像アップローダーカード */}
    <div className="admin-card">
      <Skeleton className="h-5 w-32 mb-4" />
      <Skeleton className="h-32 w-full rounded-lg border-2 border-dashed border-gray-200" />
    </div>

    {/* エディターカード */}
    <div className="admin-card">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: フォーム */}
        <div className="space-y-4">
          <SkeletonInput />
          <SkeletonTextarea height="h-80" />
          <SkeletonInput />
          <SkeletonInput />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-20 rounded-md" />
          </div>
        </div>

        {/* 右: プレビュー */}
        <div>
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-96 w-full rounded-md" />
        </div>
      </div>
    </div>
  </div>
);
