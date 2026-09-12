import type { FinanceLedgerEntry } from "@/lib/finance/ledger";

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Accountant-friendly ledger CSV (UTF-8 BOM for Excel). */
export function ledgerEntriesCsv(entries: FinanceLedgerEntry[]): string {
  const header = [
    "date",
    "description",
    "category",
    "payee",
    "amount",
    "currency",
    "reference",
    "proof_attached",
  ];

  const rows = entries.map((entry) => {
    const descriptionParts = [
      entry.direction === "out" ? "Out" : "In",
      entry.reverses_entry_id ? "reversal" : null,
      entry.status === "reversed" ? "reversed" : null,
      entry.reason,
    ].filter(Boolean);

    return [
      csvCell(entry.incurred_on),
      csvCell(descriptionParts.join(" · ")),
      csvCell(entry.category_name ?? ""),
      csvCell(entry.payee),
      csvCell(entry.amount_gbp.toFixed(2)),
      csvCell(entry.currency || "GBP"),
      csvCell(entry.period_key),
      csvCell(entry.has_proof ? "yes" : "no"),
    ].join(",");
  });

  return `\uFEFF${[header.join(","), ...rows].join("\r\n")}\r\n`;
}
