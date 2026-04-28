import React from 'react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string; // e.g., "rooms", "users", "items"
}

/**
 * Reusable pagination controls component
 * Extracted from Users.tsx pattern for consistency across the application
 * 
 * Features:
 * - First/Last page buttons
 * - Previous/Next navigation
 * - Page number buttons (smart selection of visible pages)
 * - Page size selector
 * - Item count display
 * - Full keyboard accessibility
 * - ARIA labels for screen readers
 */
export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [25, 50, 100, 200],
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
}) => {
  // Calculate display range
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate visible page numbers (up to 5)
  const getPageNumbers = (): number[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    // Smart selection based on current page position
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    } else if (currentPage >= totalPages - 2) {
      return [
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    } else {
      return [
        currentPage - 2,
        currentPage - 1,
        currentPage,
        currentPage + 1,
        currentPage + 2,
      ];
    }
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav 
      aria-label={`${itemLabel} pagination`}
      className="card"
      style={{ marginTop: '1.5rem' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {/* Left: Item count display */}
        <div
          style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}
          role="status"
          aria-live="polite"
        >
          Showing {startItem} to {endItem} of {totalItems} {itemLabel}
        </div>

        {/* Right: Page size selector and navigation */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Page size selector */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor="page-size" className="form-label" style={{ marginBottom: 0 }}>
              Rows per page:
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="form-select"
              style={{ width: 'auto' }}
              aria-label="Select number of rows per page"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* First page */}
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="btn btn-sm btn-secondary"
              style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
              aria-label="Go to first page"
              aria-disabled={currentPage === 1}
            >
              ««
            </button>

            {/* Previous page */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn btn-sm btn-secondary"
              style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
              aria-label="Go to previous page"
              aria-disabled={currentPage === 1}
            >
              ‹ Prev
            </button>

            {/* Page numbers */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`btn btn-sm ${
                    currentPage === pageNum ? 'btn-primary' : 'btn-secondary'
                  }`}
                  style={{ minWidth: '2.5rem' }}
                  aria-label={`Page ${pageNum}`}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            {/* Next page */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn btn-sm btn-secondary"
              style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
              aria-label="Go to next page"
              aria-disabled={currentPage === totalPages}
            >
              Next ›
            </button>

            {/* Last page */}
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="btn btn-sm btn-secondary"
              style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
              aria-label="Go to last page"
              aria-disabled={currentPage === totalPages}
            >
              »»
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default PaginationControls;
