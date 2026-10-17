import { jsPDF } from "jspdf";
import { jhaAnswerLabel, jhaPdfFileName, type JhaSnapshotItem } from "@/lib/jha";

type Job = {
  name: string;
  owner?: string | null;
  customer?: string | null;
  client?: string | null;
  address?: string | null;
};
type JhaRecord = { completed_at: string; answers: JhaSnapshotItem[]; signature: string };

export function generateJhaPdf({
  job,
  record,
  completedByName,
}: {
  job: Job;
  record: JhaRecord;
  completedByName: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const textW = pageW - margin * 2;

  doc.setFontSize(22).setFont("helvetica", "bold");
  doc.text("Job Hazard Analysis", margin, margin + 20);
  doc.setFontSize(14);
  doc.text(job.name, margin, margin + 44);
  doc.setFontSize(11).setFont("helvetica", "normal");
  let y = margin + 68;
  const customer = job.customer || job.client;
  const lines = [
    job.owner && `Owner: ${job.owner}`,
    customer && `Customer: ${customer}`,
    job.address && `Address: ${job.address}`,
    `Completed by: ${completedByName}`,
    `Completed at: ${new Date(record.completed_at).toLocaleString()}`,
  ].filter(Boolean) as string[];
  for (const line of lines) {
    doc.text(line, margin, y);
    y += 16;
  }

  y += 10;
  for (const item of record.answers) {
    const wrapped = doc.splitTextToSize(item.prompt, textW - 70) as string[];
    const h = wrapped.length * 14 + 8;
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin + 10;
    }
    doc.text(wrapped, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(jhaAnswerLabel(item.answer), pageW - margin - 50, y);
    doc.setFont("helvetica", "normal");
    y += h;
  }

  const sigH = 80;
  if (y + sigH + 30 > pageH - margin) {
    doc.addPage();
    y = margin + 10;
  }
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Signature", margin, y);
  doc.setFont("helvetica", "normal");
  doc.addImage(record.signature, "PNG", margin, y + 8, 200, sigH);

  doc.save(jhaPdfFileName(job.name, record.completed_at));
}
