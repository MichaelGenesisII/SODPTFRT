"use client";

type DeskPaginationProps = {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  /** When true, hide controls if everything fits on one page (legacy behaviour). */
  hideWhenSinglePage?: boolean;
  variant?: "footer" | "header";
};

export function DeskPagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
  itemLabel = "items",
  hideWhenSinglePage = false,
  variant = "footer",
}: DeskPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const rangeFrom = totalItems === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + pageSize, totalItems);

  if (totalItems === 0) return null;
  if (hideWhenSinglePage && totalItems <= pageSize) return null;

  const edgeClass = variant === "header" ? "border-b pb-2.5" : "border-t pt-4";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-stone/70 text-sm ${edgeClass} ${className}`}
      role="navigation"
      aria-label="Pagination"
    >
      <p className="text-ink/55">
        Showing {rangeFrom}–{rangeTo} of {totalItems} {itemLabel}
        {totalPages > 1 ? (
          <span className="text-ink/40">
            {" "}
            · page {currentPage} of {totalPages}
          </span>
        ) : null}
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
        <span className="min-w-[3rem] text-center text-xs tabular-nums text-ink/50">
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
