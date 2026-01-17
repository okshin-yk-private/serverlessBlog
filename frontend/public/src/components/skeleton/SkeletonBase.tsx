interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** 基本スケルトン要素 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  style,
}) => <div className={`skeleton ${className}`} style={style} />;

/** 記事カードスケルトン */
export const SkeletonPostCard: React.FC = () => (
  <div className="skeleton-post-card">
    <Skeleton className="skeleton-title" />
    <div className="skeleton-meta">
      <Skeleton className="skeleton-category" />
      <Skeleton className="skeleton-date" />
    </div>
    <Skeleton className="skeleton-tags" />
    <Skeleton className="skeleton-excerpt" />
    <Skeleton className="skeleton-excerpt-short" />
  </div>
);

/** スケルトン用スタイル */
export const SkeletonStyles: React.FC = () => (
  <style>{`
    @keyframes skeleton-pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }

    .skeleton {
      background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
      background-size: 200% 100%;
      animation: skeleton-pulse 1.5s ease-in-out infinite;
      border-radius: 8px;
    }

    .skeleton-post-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      height: 100%;
    }

    .skeleton-title {
      height: 24px;
      width: 85%;
      margin-bottom: 12px;
    }

    .skeleton-meta {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .skeleton-category {
      height: 28px;
      width: 80px;
      border-radius: 6px;
    }

    .skeleton-date {
      height: 20px;
      width: 80px;
    }

    .skeleton-tags {
      height: 24px;
      width: 120px;
      margin-bottom: 12px;
    }

    .skeleton-excerpt {
      height: 16px;
      width: 100%;
      margin-bottom: 8px;
    }

    .skeleton-excerpt-short {
      height: 16px;
      width: 70%;
    }

    /* PostDetailPage skeleton styles */
    .skeleton-detail-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 32px 80px;
      background: #fafafa;
      min-height: 100vh;
    }

    .skeleton-back-link {
      height: 36px;
      width: 120px;
      margin-bottom: 32px;
    }

    .skeleton-article {
      background: white;
      padding: 56px;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
    }

    .skeleton-article-title {
      height: 48px;
      width: 80%;
      margin-bottom: 24px;
    }

    .skeleton-article-meta {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .skeleton-article-tags {
      display: flex;
      gap: 8px;
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 1px solid #e5e7eb;
    }

    .skeleton-tag {
      height: 32px;
      width: 70px;
      border-radius: 6px;
    }

    .skeleton-content-line {
      height: 18px;
      width: 100%;
      margin-bottom: 16px;
    }

    .skeleton-content-line.short {
      width: 85%;
    }

    .skeleton-content-line.medium {
      width: 92%;
    }

    .skeleton-content-heading {
      height: 28px;
      width: 50%;
      margin: 40px 0 20px;
    }

    @media (max-width: 768px) {
      .skeleton-detail-container {
        padding: 32px 20px 60px;
      }

      .skeleton-article {
        padding: 32px 24px;
      }

      .skeleton-article-title {
        height: 36px;
      }
    }
  `}</style>
);
