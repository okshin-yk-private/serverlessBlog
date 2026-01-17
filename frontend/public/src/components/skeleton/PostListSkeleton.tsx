import { Skeleton, SkeletonPostCard, SkeletonStyles } from './SkeletonBase';

export const PostListSkeleton: React.FC = () => (
  <div className="page-container" aria-busy="true" aria-label="Loading">
    <SkeletonStyles />

    {/* Hero Section */}
    <div className="hero-section">
      <Skeleton
        style={{
          height: '56px',
          width: '400px',
          maxWidth: '80%',
          margin: '0 auto',
        }}
      />
    </div>

    <div className="container">
      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="category-pills">
          <Skeleton
            style={{ height: '40px', width: '60px', borderRadius: '24px' }}
          />
          <Skeleton
            style={{ height: '40px', width: '100px', borderRadius: '24px' }}
          />
          <Skeleton
            style={{ height: '40px', width: '60px', borderRadius: '24px' }}
          />
        </div>
        <div className="search-box">
          <Skeleton
            style={{ height: '44px', width: '100%', borderRadius: '12px' }}
          />
        </div>
      </div>

      {/* Post Cards Grid */}
      <div className="post-list-container">
        <SkeletonPostCard />
        <SkeletonPostCard />
        <SkeletonPostCard />
        <SkeletonPostCard />
        <SkeletonPostCard />
        <SkeletonPostCard />
      </div>

      {/* Pagination */}
      <div className="pagination">
        <Skeleton
          style={{ height: '44px', width: '80px', borderRadius: '8px' }}
        />
        <Skeleton
          style={{ height: '44px', width: '160px', borderRadius: '8px' }}
        />
      </div>
    </div>

    <style>{`
      .page-container {
        min-height: 100vh;
        background: #fafafa;
      }

      .hero-section {
        background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
        padding: 80px 32px 60px;
        text-align: center;
        border-bottom: 1px solid #e5e7eb;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 32px;
      }

      .filter-bar {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 40px;
      }

      .category-pills {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .search-box {
        max-width: 400px;
      }

      .post-list-container {
        display: grid;
        grid-template-columns: 1fr;
        gap: 24px;
      }

      @media (min-width: 768px) {
        .filter-bar {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
        }

        .post-list-container {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .post-list-container {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      .pagination {
        margin-top: 60px;
        display: flex;
        gap: 12px;
        justify-content: center;
      }

      @media (max-width: 768px) {
        .hero-section {
          padding: 60px 20px 40px;
        }

        .container {
          padding: 32px 20px;
        }
      }
    `}</style>
  </div>
);
