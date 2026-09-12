"use client";

export function RemittancePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-pine px-4 py-2.5 text-sm font-semibold text-mist hover:bg-celadon"
    >
      Print / save PDF
    </button>
  );
}
