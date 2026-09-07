import JSZip from "jszip";
import { phaseLabel } from "@/lib/photo-meta";

export type ExportablePhoto = {
  id: string;
  image_url: string;
  annotated_image_url?: string | null;
  storage_path?: string | null;
  phase: string | null;
  taken_at: string | null;
  created_at?: string | null;
};

export type ExportProject = {
  customer?: string | null;
  client?: string | null;
  name?: string | null;
  title?: string | null;
  cmic_number?: string | null;
};

/** Removes characters that are invalid in file and folder names. */
export function sanitizeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD_HH-mm-ss in the viewer's local timezone, consistent for every photo. */
export function timestampName(photo: ExportablePhoto): string {
  const raw = photo.taken_at ?? photo.created_at ?? null;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return `photo-${photo.id}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function fileExtension(photo: ExportablePhoto): string {
  const source = photo.storage_path || photo.image_url || "";
  const clean = source.split("?")[0]?.split("#")[0] ?? "";
  const match = clean.match(/\.([a-zA-Z0-9]{1,5})$/);
  return match ? match[1].toLowerCase() : "jpg";
}

export function zipFileName(project: ExportProject | null | undefined): string {
  const customer = sanitizeName(project?.customer || project?.client || "");
  const name = sanitizeName(project?.name || project?.title || "Project");
  const cmic = sanitizeName(project?.cmic_number || "");
  const base = [customer, name].filter(Boolean).join(" ");
  return `${cmic ? `${base} - ${cmic}` : base}.zip`;
}

export type ExportResult = { ok: number; failed: string[]; blob: Blob | null; fileName: string };

/** Downloads each selected photo at its stored quality into one ZIP, foldered by phase. */
export async function buildPhotoZip(
  photos: ExportablePhoto[],
  project: ExportProject | null | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];
  let ok = 0;

  for (const p of photos) {
    try {
      const res = await fetch(p.annotated_image_url ?? p.image_url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const folder = sanitizeName(phaseLabel(p.phase)) || "Unassigned";
      const ext = fileExtension(p);
      let base = timestampName(p);
      let candidate = `${folder}/${base}.${ext}`;
      if (used.has(candidate)) {
        let i = 1;
        while (used.has(`${folder}/${base}_${i}.${ext}`)) i++;
        candidate = `${folder}/${base}_${i}.${ext}`;
      }
      used.add(candidate);
      zip.file(candidate, blob);
      ok++;
    } catch {
      failed.push(p.id);
    }
    onProgress?.(ok + failed.length, photos.length);
  }

  const blob = ok ? await zip.generateAsync({ type: "blob" }) : null;
  return { ok, failed, blob, fileName: zipFileName(project) };
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  // Must be in the DOM for the click to trigger a download in most browsers.
  document.body.appendChild(a);
  a.click();

  // In sandboxed previews/iframes the download can be blocked silently.
  // Fall back to opening the file in a new tab so the user still gets it.
  setTimeout(() => {
    a.remove();
    try {
      const inFrame = window.self !== window.top;
      if (inFrame) window.open(url, "_blank", "noopener");
    } catch {
      window.open(url, "_blank", "noopener");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 300);
}

