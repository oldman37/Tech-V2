/**
 * MobileCard — renders a single row as a card for mobile table views.
 * Shows primary field as title, secondary as subtitle,
 * remaining visible fields as label/value pairs, and actions at the bottom.
 */
import { ReactNode } from 'react';
import type { Column } from './ResponsiveTable';

interface MobileCardProps<T> {
  row: T;
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
}

export function MobileCard<T>({ row, columns, onRowClick, rowActions }: MobileCardProps<T>) {
  const primaryCol = columns.find((c) => c.isPrimary);
  const secondaryCol = columns.find((c) => c.isSecondary);
  const detailCols = columns.filter(
    (c) => !c.isPrimary && !c.isSecondary && !c.hideOnMobile
  );

  const getCellValue = (col: Column<T>): ReactNode => {
    if (col.render) return col.render(row);
    const key = col.key as keyof T;
    const val = row[key];
    if (val == null) return '—';
    return String(val);
  };

  return (
    <div
      className="mobile-card"
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(row);
              }
            }
          : undefined
      }
    >
      {/* Header */}
      <div className="mobile-card__header">
        {primaryCol && (
          <div className="mobile-card__title">{getCellValue(primaryCol)}</div>
        )}
        {secondaryCol && (
          <div className="mobile-card__subtitle">{getCellValue(secondaryCol)}</div>
        )}
      </div>

      {/* Detail fields */}
      {detailCols.length > 0 && (
        <div className="mobile-card__details">
          {detailCols.map((col) => (
            <div
              key={String(col.key)}
              className={`mobile-card__field${String(col.key) === 'actions' ? ' mobile-card__field--actions' : ''}`}
            >
              <span className="mobile-card__label">{col.label}</span>
              <span className="mobile-card__value">{getCellValue(col)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {rowActions && (
        <div
          className="mobile-card__actions"
          onClick={(e) => e.stopPropagation()}
        >
          {rowActions(row)}
        </div>
      )}
    </div>
  );
}
