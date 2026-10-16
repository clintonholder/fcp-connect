import { jsPDF } from "jspdf";
import { phaseLabel } from "@/lib/photo-meta";

type Job = { name: string; address?: string | null; owner?: string | null; client?: string | null; customer?: string | null; notes?: string | null; created_at: string };
type Photo = {
  id: string; image_url: string; annotated_image_url: string | null;
  caption: string | null; tags: string[] | null; phase?: string | null;
  latitude: number | null; longitude: number | null; taken_at: string;
};

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateJobPdf({ job, photos }: { job: Job; photos: Photo[] }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Cover
  doc.setFontSize(22).setFont("helvetica", "bold");
  doc.text(job.name, margin, margin + 20);
  doc.setFontSize(11).setFont("helvetica", "normal");
  let y = margin + 45;
  if (job.customer || job.client) { doc.text(`Customer: ${job.customer || job.client}`, margin, y); y += 16; }
  if (job.owner) { doc.text(`Owner: ${job.owner}`, margin, y); y += 16; }
  if (job.address) { doc.text(`Address: ${job.address}`, margin, y); y += 16; }
  doc.text(`Created: ${new Date(job.created_at).toLocaleString()}`, margin, y); y += 16;
  doc.text(`Total photos: ${photos.length}`, margin, y); y += 16;
  if (job.notes) {
    y += 8;
    const lines = doc.splitTextToSize(job.notes, pageW - margin * 2);
    doc.text(lines, margin, y);
  }

  const groups = new Map<string, Photo[]>();
  for (const p of photos) {
    const key = phaseLabel(p.phase);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const [name, groupPhotos] of groups) {
    if (groupPhotos.length === 0) continue;
    doc.addPage();
    doc.setFontSize(16).setFont("helvetica", "bold");
    doc.text(name, margin, margin + 10);
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text(`${groupPhotos.length} photo(s)`, margin, margin + 28);

    let cy = margin + 50;
    const colW = (pageW - margin * 2 - 20) / 2;
    const imgH = 180;
    let col = 0;

    for (const p of groupPhotos) {
      const data = await urlToDataUrl(p.annotated_image_url ?? p.image_url);
      if (!data) continue;
      const x = margin + col * (colW + 20);
      if (cy + imgH + 60 > pageH - margin) { doc.addPage(); cy = margin; col = 0; }
      try { doc.addImage(data, "JPEG", x, cy, colW, imgH, undefined, "FAST"); }
      catch { /* skip bad image */ }
      doc.setFontSize(8);
      let ly = cy + imgH + 10;
      if (p.caption) { const wrap = doc.splitTextToSize(p.caption, colW); doc.text(wrap, x, ly); ly += wrap.length * 9; }
      if (p.tags?.length) { doc.text(`#${p.tags.join(" #")}`, x, ly); ly += 9; }
      if (p.latitude && p.longitude) { doc.text(`GPS ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`, x, ly); ly += 9; }
      doc.text(new Date(p.taken_at).toLocaleString(), x, ly);
      col = col === 0 ? 1 : 0;
      if (col === 0) cy += imgH + 70;
    }
  }

  doc.save(`${job.name.replace(/[^a-z0-9]+/gi, "_")}-report.pdf`);
}
