import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import type { Category } from '../api/categories';

interface SortableCategoryItemProps {
  category: Category;
  onDeleteClick: (id: string) => void;
}

const SortableCategoryItem = ({
  category,
  onDeleteClick,
}: SortableCategoryItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="category-item"
      className="admin-list-item"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        {/* ドラッグハンドル */}
        <button
          type="button"
          data-testid="drag-handle"
          className="admin-drag-handle"
          style={{
            cursor: 'grab',
            padding: '8px',
            border: 'none',
            background: 'transparent',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          {...attributes}
          {...listeners}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>

        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 8px 0',
            }}
            data-testid="category-name"
          >
            {category.name}
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '0.875rem',
              color: '#6b7280',
            }}
          >
            <span className="admin-badge admin-badge-dark">
              {category.slug}
            </span>
            <span>sortOrder: {category.sortOrder}</span>
          </div>
          {category.description && (
            <p
              style={{
                marginTop: '8px',
                fontSize: '0.875rem',
                color: '#6b7280',
              }}
            >
              {category.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Link
            to={`/categories/edit/${category.id}`}
            data-testid="edit-category-button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
          >
            編集
          </Link>
          <button
            onClick={() => onDeleteClick(category.id)}
            data-testid="delete-category-button"
            className="admin-btn admin-btn-danger admin-btn-sm"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
};

export default SortableCategoryItem;
