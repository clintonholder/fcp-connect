import { jsPDF } from "jspdf";
import { acknowledgementPdfFileName, type AckReportEntry } from "@/lib/safety-acknowledgements";
import { SAFETY_CATEGORY_LABEL } from "@/lib/safety-documents";

export function generateSafetyAcknowledgementPdf(report: AckReportEntry[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const now = new Date();
  let y = margin + 20;

  const line = (text: string, indent = 0, gap = 14) => {
    for (const wrapped of doc.splitTextToSize(text, pageW - margin * 2 - indent) as string[]) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin + 10;
      }
      doc.text(wrapped, margin + indent, y);
      y += gap;
    }
  };

  doc.setFontSize(22).setFont("helvetica", "bold");
  doc.text("Safety Document Acknowledgements", margin, y);
  y += 22;
  doc.setFontSize(11).setFont("helvetica", "normal");
  line(`Generated: ${now.toLocaleString()}`, 0, 24);

  if (report.length === 0) line("No documents require acknowledgement.");

  for (const { document: d, acknowledged, pending } of report) {
    y += 8;
    doc.setFontSize(14).setFont("helvetica", "bold");
    line(d.title, 0, 18);
    doc.setFontSize(11).setFont("helvetica", "normal");
    line(`${SAFETY_CATEGORY_LABEL[d.category]} · Version ${d.version || `Revision ${d.revision}`}`);
    doc.setFont("helvetica", "bold");
    line(`Acknowledged (${acknowledged.length})`);
    doc.setFont("helvetica", "normal");
    for (const a of acknowledged) {
      line(`${a.person.name} - ${new Date(a.acknowledgedAt).toLocaleString()}`, 12);
    }
    doc.setFont("helvetica", "bold");
    line(`Not acknowledged (${pending.length})`);
    doc.setFont("helvetica", "normal");
    for (const p of pending) line(p.name, 12);
  }

  doc.save(acknowledgementPdfFileName(now));
}
