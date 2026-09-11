"use client";

import { useMemo, useState } from "react";
import { DeskPagination } from "@/lib/ui/desk-pagination";
import { teacherDisplayName } from "@/lib/teacher/types";

const PAGE_SIZE = 12;

type TeacherRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  hasPaymentDetails: boolean;
  paymentMethodLabel: string | null;
  paymentPayeeMask: string | null;
  paymentRecentlyChanged: boolean;
};

export function FinanceTeachersDirectory({
  teachers,
}: {
  teachers: TeacherRow[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teachers.filter((teacher) => {
      if (status === "active" && !teacher.is_active) return false;
      if (status === "inactive" && teacher.is_active) return false;
      if (!q) return true;
      const name = teacherDisplayName(teacher).toLowerCase();
      return (
        name.includes(q) ||
        teacher.email.toLowerCase().includes(q) ||
        (teacher.paymentPayeeMask ?? "").toLowerCase().includes(q)
      );
    });
  }, [teachers, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border border-stone/80 bg-white/55 p-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <label className="block min-w-0 flex-1 text-sm font-medium text-ink">
          Search
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Name, email, or payee"
            className="mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["inactive", "Inactive"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setStatus(id);
                setPage(1);
              }}
              className={`px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] transition-colors ${
                status === id
                  ? "bg-pine text-mist"
                  : "border border-pine/20 text-pine hover:border-pine"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
          <p className="font-display text-lg text-pine">No matches</p>
          <p className="mt-2 text-sm text-ink/55">
            Try another name, email, or status filter.
          </p>
        </div>
      ) : (
        <div className="border border-stone/80 bg-white/55">
          <DeskPagination
            page={currentPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="teachers"
            variant="header"
            className="px-4 sm:px-5"
          />
          <ul className="divide-y divide-stone/70">
            {pageRows.map((teacher) => (
              <li
                key={teacher.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {teacherDisplayName(teacher)}
                    {teacher.paymentRecentlyChanged ? (
                      <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-amber-800">
                        Recently changed
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-ink/55">{teacher.email}</p>
                  <p className="mt-1 text-sm text-ink/55">
                    {teacher.hasPaymentDetails
                      ? `${teacher.paymentMethodLabel} · ${teacher.paymentPayeeMask}`
                      : "No payment details on file"}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium uppercase tracking-[0.12em] ${
                    teacher.is_active ? "text-celadon" : "text-ink/40"
                  }`}
                >
                  {teacher.is_active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
          <DeskPagination
            page={currentPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="teachers"
            className="px-4 sm:px-5"
          />
        </div>
      )}
    </div>
  );
}
