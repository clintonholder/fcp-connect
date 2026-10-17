export type WorkerType = "employee" | "subcontractor";

export type WorkerInfo = { workerType: WorkerType; subcontractorName: string | null };

/** Validates and normalizes a worker type; employees never keep a Sub Contractor name. */
export function normalizeWorkerType(d: {
  workerType: string;
  subcontractorName?: string | null;
}): WorkerInfo {
  if (d.workerType === "employee") return { workerType: "employee", subcontractorName: null };
  if (d.workerType !== "subcontractor") throw new Error("Choose FCP Employee or Sub Contractor");
  const subcontractorName = (d.subcontractorName ?? "").trim();
  if (!subcontractorName) throw new Error("A Sub Contractor name is required");
  return { workerType: "subcontractor", subcontractorName };
}

export function workerTypeLabel(d: WorkerInfo): string {
  return d.workerType === "subcontractor"
    ? `Sub Contractor: ${d.subcontractorName ?? ""}`
    : "FCP Employee";
}
