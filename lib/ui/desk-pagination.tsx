"use client";

type DeskPaginationProps = {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
};

export function DeskPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
  itemLabel = "items",
}: DeskPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const rangeFrom = totalItems === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + pageSize, totalItems);

  if (totalItems <= pageSize) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-stone/70 pt-4 text-sm ${className}`}
    >
      <p className="text-ink/55">
        Showing {rangeFrom}–{rangeTo} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="border border-stone px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs tabular-nums text-ink/50">
          {currentPage}/{totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="border border-stone px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
