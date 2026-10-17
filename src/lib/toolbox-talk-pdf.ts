import { jsPDF } from "jspdf";
import { toolboxPdfFileName, type Attendee } from "@/lib/toolbox-talks";

type Job = {
  name: string;
  owner?: string | null;
  customer?: string | null;
  client?: string | null;
  address?: string | null;
};
type Talk = {
  topic_title: string;
  talk_date: string;
  completed_at: string;
  notes?: string | null;
  attendees: Attendee[];
};

export function generateToolboxTalkPdf({
  job,
  talk,
  ledByName,
}: {
  job: Job;
  talk: Talk;
  ledByName: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const textW = pageW - margin * 2;

  doc.setFontSize(22).setFont("helvetica", "bold");
  doc.text("Toolbox Talk Sign-In Sheet", margin, margin + 20);
  doc.setFontSize(14);
  doc.text(job.name, margin, margin + 44);
  doc.setFontSize(11).setFont("helvetica", "normal");
  let y = margin + 68;
  const customer = job.customer || job.client;
  const lines = [
    job.owner && `Owner: ${job.owner}`,
    customer && `Customer: ${customer}`,
    job.address && `Address: ${job.address}`,
    `Topic: ${talk.topic_title}`,
    `Date: ${talk.talk_date}`,
    `Led by: ${ledByName}`,
    `Completed at: ${new Date(talk.completed_at).toLocaleString()}`,
  ].filter(Boolean) as string[];
  for (const line of lines) {
    for (const wrapped of doc.splitTextToSize(line, textW) as string[]) {
      doc.text(wrapped, margin, y);
      y += 16;
    }
  }

  if (talk.notes) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", margin, y);
    doc.setFont("helvetica", "normal");
    y += 16;
    for (const line of doc.splitTextToSize(talk.notes, textW) as string[]) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin + 10;
      }
      doc.text(line, margin, y);
      y += 14;
    }
  }

  const rowH = 44;
  const header = (at: number) => {
    doc.setFont("helvetica", "bold");
    doc.text("#", margin, at);
    doc.text("Name", margin + 30, at);
    doc.text("Signature", margin + 280, at);
    doc.setFont("helvetica", "normal");
  };
  y += 14;
  if (y + rowH * 2 > pageH - margin) {
    doc.addPage();
    y = margin + 10;
  }
  header(y);
  y += 10;
  talk.attendees.forEach((a, i) => {
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin + 10;
      header(y);
      y += 10;
    }
    doc.text(String(i + 1), margin, y + 24);
    doc.text(doc.splitTextToSize(a.name, 230) as string[], margin + 30, y + 24);
    doc.addImage(a.signature, "PNG", margin + 280, y, 120, rowH - 4);
    y += rowH;
  });

  doc.save(toolboxPdfFileName(job.name, talk.talk_date));
}
