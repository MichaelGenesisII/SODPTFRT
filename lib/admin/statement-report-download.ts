import type { StatementReportBundle } from "@/lib/admin/overview-types";
import * as XLSX from "xlsx";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function stamp(bundle: StatementReportBundle) {
  const scope = bundle.scopeLabel.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  const day = new Date().toISOString().slice(0, 10);
  return `SOD-Statement-of-Report-${scope || "UK"}-${day}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

/** Minimal multi-page text PDF (Helvetica). */
function buildSimplePdf(lines: string[]): Blob {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const fontSize = 10;
  const leading = 13;
  const maxLines = Math.floor((pageHeight - margin * 2) / leading);

  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    pages.push(lines.slice(i, i + maxLines));
  }
  if (!pages.length) pages.push([""]);

  const fontObjNum = 3 + pages.length * 2;
  const kids: string[] = [];
  for (let p = 0; p < pages.length; p += 1) {
    kids.push(`${3 + p * 2} 0 R`);
  }

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push(
    `2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>endobj\n`,
  );

  for (let p = 0; p < pages.length; p += 1) {
    const pageLines = pages[p]!;
    const yStart = pageHeight - margin;
    const contentParts = [
      "BT",
      `/F1 ${fontSize} Tf`,
      `${margin} ${yStart} Td`,
      `${leading} TL`,
    ];
    pageLines.forEach((line, idx) => {
      const text = escapePdfText(line.slice(0, 110));
      if (idx === 0) contentParts.push(`(${text}) Tj`);
      else contentParts.push(`T* (${text}) Tj`);
    });
    contentParts.push("ET");
    const stream = contentParts.join("\n");
    const pageNum = 3 + p * 2;
    const contentNum = pageNum + 1;
    objects.push(
      `${pageNum} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentNum} 0 obj<< /Length ${utf8Length(stream)} >>stream\n${stream}\nendstream\nendobj\n`,
    );
  }

  objects.push(
    `${fontObjNum} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(utf8Length(pdf));
    pdf += obj;
  }
  const xrefPos = utf8Length(pdf);
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function reportLines(bundle: StatementReportBundle): string[] {
  const lines = [
    "School of Disciples",
    bundle.title,
    bundle.subtitle,
    `Scope: ${bundle.scopeLabel}`,
    `Issued: ${bundle.issuedAtLabel}`,
    `Issued by: ${bundle.issuedBy}`,
    "",
    `Students on this statement: ${bundle.rows.length}`,
    "",
  ];

  if (!bundle.rows.length) {
    lines.push("No students match this statement.");
    return lines;
  }

  for (const [i, row] of bundle.rows.entries()) {
    lines.push(
      `${i + 1}. ${row.student_name}  |  ${row.email}`,
      `   Ref: ${row.reference || "—"}  |  ${row.parish_name || "—"}  |  ${row.batch_label || "—"}`,
      `   Enrolled: ${row.enrolled_on || "—"}  |  Status: ${row.enrolment_status}  |  Payment: ${row.payment_status}`,
      `   Application proof: ${row.application_proof}  |  Attendance proof: ${row.attendance_proof}${
        row.attendance_percent != null
          ? ` (${row.attendance_percent}% · ${row.sessions_present}/${row.sessions_total})`
          : ""
      }`,
      "",
    );
  }

  lines.push(
    "Notes",
    "- Application / Enrolment proof is taken from the live enrolment record.",
    "- Attendance proof is taken from Records session marks.",
    "- Where tuition payment is required, only paid seats are included.",
  );
  return lines;
}

export function downloadStatementExcel(bundle: StatementReportBundle) {
  const sheetRows = bundle.rows.map((r) => ({
    Student: r.student_name,
    Email: r.email,
    Reference: r.reference ?? "",
    Parish: r.parish_name ?? "",
    Batch: r.batch_label ?? "",
    "Enrolled on": r.enrolled_on ?? "",
    "Enrolment status": r.enrolment_status,
    "Payment status": r.payment_status,
    "Tuition paid": r.tuition_paid ? "Yes" : "No",
    "Application proof": r.application_proof,
    "Attendance proof": r.attendance_proof,
    "Attendance %": r.attendance_percent ?? "",
    "Sessions present": r.sessions_present,
    "Sessions total": r.sessions_total,
  }));

  const wb = XLSX.utils.book_new();
  const meta = XLSX.utils.aoa_to_sheet([
    ["School of Disciples — Statement of Report"],
    [bundle.subtitle],
    [`Scope: ${bundle.scopeLabel}`],
    [`Issued: ${bundle.issuedAtLabel}`],
    [`Issued by: ${bundle.issuedBy}`],
    [],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Cover");
  const data = XLSX.utils.json_to_sheet(
    sheetRows.length
      ? sheetRows
      : [{ Student: "No students match this statement." }],
  );
  XLSX.utils.book_append_sheet(wb, data, "Statement");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${stamp(bundle)}.xlsx`,
  );
}

export function downloadStatementWord(bundle: StatementReportBundle) {
  const rowsHtml = bundle.rows.length
    ? bundle.rows
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.student_name)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td>${escapeHtml(r.reference || "—")}</td>
            <td>${escapeHtml(r.parish_name || "—")}</td>
            <td>${escapeHtml(r.batch_label || "—")}</td>
            <td>${escapeHtml(r.enrolled_on || "—")}</td>
            <td>${escapeHtml(r.payment_status)}</td>
            <td>${escapeHtml(r.application_proof)}</td>
            <td>${escapeHtml(
              r.attendance_proof +
                (r.attendance_percent != null
                  ? ` (${r.attendance_percent}%)`
                  : ""),
            )}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="9">No students match this statement.</td></tr>`;

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /><title>${escapeHtml(bundle.title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#1c2420;">
  <h1 style="color:#14352c;">School of Disciples</h1>
  <h2>${escapeHtml(bundle.title)}</h2>
  <p>${escapeHtml(bundle.subtitle)}</p>
  <p><strong>Scope:</strong> ${escapeHtml(bundle.scopeLabel)}<br/>
  <strong>Issued:</strong> ${escapeHtml(bundle.issuedAtLabel)}<br/>
  <strong>Issued by:</strong> ${escapeHtml(bundle.issuedBy)}</p>
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px;">
    <thead>
      <tr style="background:#e8efe9;">
        <th>Student</th><th>Email</th><th>Ref</th><th>Parish</th><th>Batch</th>
        <th>Enrolled</th><th>Payment</th><th>Application</th><th>Attendance</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body></html>`;

  downloadBlob(
    new Blob(["\ufeff", html], {
      type: "application/msword",
    }),
    `${stamp(bundle)}.doc`,
  );
}

export function downloadStatementPdf(bundle: StatementReportBundle) {
  downloadBlob(buildSimplePdf(reportLines(bundle)), `${stamp(bundle)}.pdf`);
}

export function downloadStatementJpg(bundle: StatementReportBundle) {
  const width = 1400;
  const rowH = 28;
  const headerH = 210;
  const visibleRows = Math.min(bundle.rows.length, 28);
  const height = headerH + Math.max(visibleRows, 1) * rowH + 80;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create image.");

  ctx.fillStyle = "#e8efe9";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#14352c";
  ctx.fillRect(0, 0, width, 120);

  ctx.fillStyle = "#95bfa8";
  ctx.font = "600 14px Arial";
  ctx.fillText("SCHOOL OF DISCIPLES", 40, 42);
  ctx.fillStyle = "#f7f1e6";
  ctx.font = "600 36px Georgia";
  ctx.fillText(bundle.title, 40, 88);

  ctx.fillStyle = "#1c2420";
  ctx.font = "16px Arial";
  ctx.fillText(bundle.subtitle, 40, 155);
  ctx.font = "14px Arial";
  ctx.fillStyle = "rgba(28,36,32,0.7)";
  ctx.fillText(`Scope: ${bundle.scopeLabel}`, 40, 180);
  ctx.fillText(
    `Issued ${bundle.issuedAtLabel} · ${bundle.issuedBy}`,
    40,
    200,
  );

  let y = headerH;
  ctx.font = "600 13px Arial";
  ctx.fillStyle = "#14352c";
  const headers = [
    "Student",
    "Parish",
    "Payment",
    "Application",
    "Attendance",
  ];
  const cols = [40, 360, 620, 820, 1040];
  headers.forEach((h, i) => ctx.fillText(h, cols[i]!, y));
  y += 10;
  ctx.strokeStyle = "#95bfa8";
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(width - 40, y);
  ctx.stroke();
  y += 18;

  ctx.font = "13px Arial";
  ctx.fillStyle = "#1c2420";
  const drawRows = bundle.rows.slice(0, visibleRows);
  if (!drawRows.length) {
    ctx.fillText("No students match this statement.", 40, y);
  } else {
    for (const row of drawRows) {
      ctx.fillText(row.student_name.slice(0, 34), cols[0]!, y);
      ctx.fillText((row.parish_name || "—").slice(0, 24), cols[1]!, y);
      ctx.fillText(row.payment_status.slice(0, 18), cols[2]!, y);
      ctx.fillText(row.application_proof, cols[3]!, y);
      ctx.fillText(
        row.attendance_percent != null
          ? `${row.attendance_proof} (${row.attendance_percent}%)`
          : row.attendance_proof,
        cols[4]!,
        y,
      );
      y += rowH;
    }
    if (bundle.rows.length > visibleRows) {
      ctx.fillStyle = "rgba(28,36,32,0.55)";
      ctx.fillText(
        `…and ${bundle.rows.length - visibleRows} more (use Excel/PDF/Word for the full list)`,
        40,
        y + 8,
      );
    }
  }

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      downloadBlob(blob, `${stamp(bundle)}.jpg`);
    },
    "image/jpeg",
    0.92,
  );
}
