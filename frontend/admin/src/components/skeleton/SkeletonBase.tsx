interface SkeletonProps {
  className?: string;
}

/** 基本スケルトン要素 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

/** テキスト行スケルトン */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 1,
  className = '',
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
      />
    ))}
  </div>
);

/** 統計カードスケルトン（admin-stat-card用） */
export const SkeletonStatCard: React.FC = () => (
  <div className="admin-stat-card">
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-10 w-16" />
  </div>
);

/** リストアイテムスケルトン（admin-list-item用） */
export const SkeletonListItem: React.FC = () => (
  <div className="admin-list-item">
    <div className="flex justify-between items-start gap-4">
      <div className="flex-1">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <div className="flex gap-3 items-center">
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-12 rounded-lg" />
      </div>
    </div>
  </div>
);

/** 入力フィールドスケルトン */
export const SkeletonInput: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div className={className}>
    <Skeleton className="h-4 w-20 mb-2" />
    <Skeleton className="h-10 w-full rounded-md" />
  </div>
);

/** テキストエリアスケルトン */
export const SkeletonTextarea: React.FC<{ height?: string }> = ({
  height = 'h-64',
}) => (
  <div>
    <Skeleton className="h-4 w-32 mb-2" />
    <Skeleton className={`w-full rounded-md ${height}`} />
  </div>
);
