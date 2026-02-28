import { Skeleton, SkeletonInput } from './SkeletonBase';

export const MindmapEditSkeleton: React.FC = () => (
  <div
    data-testid="mindmap-edit-skeleton"
    aria-busy="true"
    aria-label="Loading"
  >
    <div className="admin-card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <SkeletonInput />
        <SkeletonInput />
        <Skeleton className="h-[500px] w-full rounded-md" />
        <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  </div>
);
