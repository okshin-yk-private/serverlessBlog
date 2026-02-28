import { Skeleton, SkeletonStyles } from './SkeletonBase';

export const PostDetailSkeleton: React.FC = () => (
  <div
    className="skeleton-detail-container"
    aria-busy="true"
    aria-label="Loading"
  >
    <SkeletonStyles />

    {/* Back Link */}
    <Skeleton className="skeleton-back-link" />

    {/* Article */}
    <article className="skeleton-article">
      {/* Header */}
      <header>
        <Skeleton className="skeleton-article-title" />
        <div className="skeleton-article-meta">
          <Skeleton className="skeleton-category" />
          <Skeleton className="skeleton-date" />
          <Skeleton style={{ height: '20px', width: '60px' }} />
        </div>
        <div className="skeleton-article-tags">
          <Skeleton className="skeleton-tag" />
          <Skeleton className="skeleton-tag" />
          <Skeleton className="skeleton-tag" />
        </div>
      </header>

      {/* Content */}
      <div>
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line medium" />
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line short" />

        <Skeleton className="skeleton-content-heading" />
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line medium" />
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line short" />

        <Skeleton className="skeleton-content-heading" />
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line" />
        <Skeleton className="skeleton-content-line medium" />
      </div>
    </article>
  </div>
);
