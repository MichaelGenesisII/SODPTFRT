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

function attendanceCell(row: StatementReportBundle["rows"][number]) {
  if (row.attendance_percent != null) {
    return `${row.attendance_proof} · ${row.attendance_percent}% (${row.sessions_present}/${row.sessions_total})`;
  }
  return row.attendance_proof;
}

function summaryLines(bundle: StatementReportBundle): string[] {
  const { summary } = bundle;
  const avg =
    summary.averageAttendancePercent != null
      ? `${summary.averageAttendancePercent}%`
      : "—";
  return [
    `Students on this statement: ${summary.total}`,
    `Application reference on file: ${summary.applicationOnFile}`,
    `Attendance marked in Records: ${summary.attendanceOnFile}`,
    `Attendance not yet marked: ${summary.attendanceNotMarked}`,
    `Average attendance (where marked): ${avg}`,
  ];
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
    "SCHOOL OF DISCIPLES",
    bundle.title,
    bundle.subtitle,
    "",
    bundle.purpose,
    "",
    `Scope: ${bundle.scopeLabel}`,
    `Filter: ${bundle.filterLabel}`,
    `Issued: ${bundle.issuedAtLabel}`,
    `Issued by: ${bundle.issuedBy}`,
    "",
    "Summary",
    ...summaryLines(bundle).map((line) => `  ${line}`),
    "",
    "————————————————————————————",
    "",
  ];

  if (!bundle.rows.length) {
    lines.push("No students match this statement.");
    return lines;
  }

  for (const [i, row] of bundle.rows.entries()) {
    lines.push(
      `${i + 1}. ${row.student_name}`,
      `   ${row.email || "No email on file"}`,
      `   Ref ${row.reference || "—"}  ·  ${row.parish_name || "—"}  ·  ${row.batch_label || "—"}`,
      `   Enrolled ${row.enrolled_on || "—"}  ·  ${row.enrolment_status}  ·  ${row.payment_status}`,
      `   Application: ${row.application_proof}  ·  Attendance: ${attendanceCell(row)}`,
      "",
    );
  }

  lines.push(
    "Notes",
    "- Application proof reflects whether an enrolment reference is on file.",
    "- Attendance proof is taken from session marks on the student’s Records scorecard.",
    "- This statement is generated from the live School of Disciples portal desk.",
  );
  return lines;
}

export function downloadStatementExcel(bundle: StatementReportBundle) {
  const sheetRows = bundle.rows.map((r, index) => ({
    "#": index + 1,
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
    ["School of Disciples"],
    [bundle.title],
    [bundle.subtitle],
    [],
    [bundle.purpose],
    [],
    ["Scope", bundle.scopeLabel],
    ["Filter", bundle.filterLabel],
    ["Issued", bundle.issuedAtLabel],
    ["Issued by", bundle.issuedBy],
    [],
    ["Summary"],
    ["Students on statement", bundle.summary.total],
    ["Application reference on file", bundle.summary.applicationOnFile],
    ["Attendance marked", bundle.summary.attendanceOnFile],
    ["Attendance not marked", bundle.summary.attendanceNotMarked],
    [
      "Average attendance % (where marked)",
      bundle.summary.averageAttendancePercent ?? "",
    ],
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
          (r, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.student_name)}<br/><span style="color:#5a655f;font-size:11px;">${escapeHtml(r.email || "—")}</span></td>
            <td>${escapeHtml(r.reference || "—")}</td>
            <td>${escapeHtml(r.parish_name || "—")}<br/><span style="color:#5a655f;font-size:11px;">${escapeHtml(r.batch_label || "—")}</span></td>
            <td>${escapeHtml(r.enrolled_on || "—")}</td>
            <td>${escapeHtml(r.enrolment_status)}<br/><span style="color:#5a655f;font-size:11px;">${escapeHtml(r.payment_status)}</span></td>
            <td>${escapeHtml(r.application_proof)}</td>
            <td>${escapeHtml(attendanceCell(r))}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="8">No students match this statement.</td></tr>`;

  const summaryHtml = summaryLines(bundle)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /><title>${escapeHtml(bundle.title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#1c2420;line-height:1.45;">
  <p style="letter-spacing:0.12em;text-transform:uppercase;color:#5f8f7a;font-size:12px;margin:0;">School of Disciples</p>
  <h1 style="color:#14352c;margin:8px 0 4px;">${escapeHtml(bundle.title)}</h1>
  <p style="margin:0 0 12px;color:#3d4a44;">${escapeHtml(bundle.subtitle)}</p>
  <p style="max-width:42rem;">${escapeHtml(bundle.purpose)}</p>
  <p><strong>Scope:</strong> ${escapeHtml(bundle.scopeLabel)}<br/>
  <strong>Filter:</strong> ${escapeHtml(bundle.filterLabel)}<br/>
  <strong>Issued:</strong> ${escapeHtml(bundle.issuedAtLabel)}<br/>
  <strong>Issued by:</strong> ${escapeHtml(bundle.issuedBy)}</p>
  <h3 style="color:#14352c;">Summary</h3>
  <ul>${summaryHtml}</ul>
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px;margin-top:16px;">
    <thead>
      <tr style="background:#e8efe9;">
        <th>#</th><th>Student</th><th>Ref</th><th>Parish / batch</th>
        <th>Enrolled</th><th>Status</th><th>Application</th><th>Attendance</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin-top:18px;font-size:11px;color:#5a655f;">
    Application proof reflects whether an enrolment reference is on file.
    Attendance is taken from Records session marks. Generated from the live portal desk.
  </p>
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
  const width = 1480;
  const rowH = 30;
  const headerH = 268;
  const visibleRows = Math.min(bundle.rows.length, 26);
  const height = headerH + Math.max(visibleRows, 1) * rowH + 90;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create image.");

  ctx.fillStyle = "#e8efe9";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#14352c";
  ctx.fillRect(0, 0, width, 128);

  ctx.fillStyle = "#95bfa8";
  ctx.font = "600 13px Arial";
  ctx.fillText("SCHOOL OF DISCIPLES", 44, 40);
  ctx.fillStyle = "#f7f1e6";
  ctx.font = "600 34px Georgia";
  ctx.fillText(bundle.title, 44, 84);
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(247,241,230,0.8)";
  ctx.fillText(bundle.subtitle, 44, 112);

  ctx.fillStyle = "#1c2420";
  ctx.font = "14px Arial";
  const purpose =
    bundle.purpose.length > 120
      ? `${bundle.purpose.slice(0, 117)}…`
      : bundle.purpose;
  ctx.fillText(purpose, 44, 160);
  ctx.fillStyle = "rgba(28,36,32,0.7)";
  ctx.fillText(
    `Scope: ${bundle.scopeLabel}  ·  ${bundle.filterLabel}`,
    44,
    186,
  );
  ctx.fillText(
    `Issued ${bundle.issuedAtLabel}  ·  ${bundle.issuedBy}`,
    44,
    208,
  );
  ctx.fillStyle = "#14352c";
  ctx.font = "600 13px Arial";
  const avg =
    bundle.summary.averageAttendancePercent != null
      ? `${bundle.summary.averageAttendancePercent}% avg attendance`
      : "No attendance average yet";
  ctx.fillText(
    `${bundle.summary.total} students  ·  ${bundle.summary.applicationOnFile} refs on file  ·  ${bundle.summary.attendanceOnFile} attendance marked  ·  ${avg}`,
    44,
    236,
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
  const cols = [44, 380, 640, 860, 1080];
  headers.forEach((h, i) => ctx.fillText(h, cols[i]!, y));
  y += 10;
  ctx.strokeStyle = "#95bfa8";
  ctx.beginPath();
  ctx.moveTo(44, y);
  ctx.lineTo(width - 44, y);
  ctx.stroke();
  y += 20;

  ctx.font = "13px Arial";
  ctx.fillStyle = "#1c2420";
  const drawRows = bundle.rows.slice(0, visibleRows);
  if (!drawRows.length) {
    ctx.fillText("No students match this statement.", 44, y);
  } else {
    for (const row of drawRows) {
      ctx.fillText(row.student_name.slice(0, 36), cols[0]!, y);
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
        `…and ${bundle.rows.length - visibleRows} more (use Excel, PDF, or Word for the full list)`,
        44,
        y + 10,
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
