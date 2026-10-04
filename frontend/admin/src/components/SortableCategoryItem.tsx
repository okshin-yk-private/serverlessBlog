import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Category } from '../api/categories';

interface Props {
  category: Category;
  index: number;
  total: number;
  selected: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMove: (offset: number) => void;
}

export default function SortableCategoryItem({
  category,
  index,
  total,
  selected,
  disabled,
  onEdit,
  onMove,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        gridRow: index + 1,
      }}
      data-testid="category-item"
      className={`category-row${selected ? ' is-selected' : ''}`}
    >
      <button
        type="button"
        data-testid="drag-handle"
        className="category-drag"
        aria-label={`${category.name}の表示順を変更`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span
        className="category-order-number"
        aria-label={`表示順 ${index + 1}`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="category-record">
        <h2 data-testid="category-name">{category.name}</h2>
        <p className="category-slug">
          <span className="category-slug-label">slug: </span>
          <span>{category.slug}</span>
        </p>
        {category.description && (
          <p className="category-description">{category.description}</p>
        )}
      </div>
      <div className="category-move">
        <button
          type="button"
          disabled={disabled || index === 0}
          aria-label={`${category.name}を上へ`}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={disabled || index === total - 1}
          aria-label={`${category.name}を下へ`}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        className="admin-btn admin-btn-secondary admin-btn-sm"
        disabled={disabled}
        onClick={onEdit}
        aria-label={`${category.name}を編集`}
        data-testid="edit-category-button"
        data-category-id={category.id}
      >
        編集
      </button>
    </div>
  );
}
