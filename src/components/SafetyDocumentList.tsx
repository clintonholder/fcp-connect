import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, FileText, Plus, RefreshCw, Archive, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import {
  SAFETY_BUCKET,
  SAFETY_CATEGORY_LABEL,
  filterSafetyDocuments,
  safetyStoragePath,
  visibleToViewer,
  type SafetyCategory,
} from "@/lib/safety-documents";
import { pendingAcknowledgements } from "@/lib/safety-acknowledgements";
import {
  acknowledgeSafetyDocument,
  archiveSafetyDocument,
  createSafetyDocument,
  replaceSafetyDocumentVersion,
  setSafetyDocumentRequiresAcknowledgement,
} from "@/lib/safety.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

type Doc = {
  id: string;
  title: string;
  category: SafetyCategory;
  description: string | null;
  version: string | null;
  effective_date: string | null;
  archived: boolean;
  shareable_with_subs: boolean;
  requires_acknowledgement: boolean;
  revision: number;
  file_path: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function SafetyDocumentList({
  heading,
  categories,
}: {
  heading: string;
  categories: SafetyCategory[];
}) {
  const { can, loading: rolesLoading } = useMyRoles();
  const { proxy, readOnly } = useProxy();
  const { user } = useAuth();
  const qc = useQueryClient();
  const acknowledge = useServerFn(acknowledgeSafetyDocument);
  const setRequired = useServerFn(setSafetyDocumentRequiresAcknowledgement);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceDoc, setReplaceDoc] = useState<Doc | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<Doc | null>(null);

  const canSee = can.can_view_safety || can.can_manage_safety;
  const canWrite = can.can_manage_safety && !readOnly;
  const isSubcontractor = proxy?.workerType === "subcontractor";
  const key = ["safety-documents", categories.join(",")];
  const viewerId = proxy?.userId ?? user?.id;

  const q = useQuery({
    queryKey: key,
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("safety_documents")
        .select(
          "id, title, category, description, version, effective_date, archived, shareable_with_subs, requires_acknowledgement, revision, file_path",
        )
        .in("category", categories)
        .eq("archived", false);
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const acksQ = useQuery({
    queryKey: ["safety-acknowledgements", viewerId],
    enabled: canSee && !!viewerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("safety_acknowledgements")
        .select("user_id, document_id, revision, acknowledged_at")
        .eq("user_id", viewerId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(
    () =>
      filterSafetyDocuments(
        visibleToViewer(q.data ?? [], { canManage: can.can_manage_safety, isSubcontractor }),
        search,
      ),
    [q.data, can.can_manage_safety, isSubcontractor, search],
  );

  const pendingIds = useMemo(
    () => new Set(pendingAcknowledgements(rows, acksQ.data ?? [], viewerId ?? "").map((d) => d.id)),
    [rows, acksQ.data, viewerId],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const doAcknowledge = async (doc: Doc) => {
    setBusyId(doc.id);
    try {
      await acknowledge({ data: { id: doc.id } });
      toast.success("Document acknowledged");
      await qc.invalidateQueries({ queryKey: ["safety-acknowledgements"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleRequired = async (doc: Doc) => {
    setBusyId(doc.id);
    try {
      await setRequired({ data: { id: doc.id, required: !doc.requires_acknowledgement } });
      toast.success(
        doc.requires_acknowledgement
          ? "Acknowledgement no longer required"
          : "Acknowledgement required",
      );
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const open = async (doc: Doc) => {
    setOpened((prev) => new Set(prev).add(doc.id));
    // Open the tab synchronously so the browser does not block it as a popup.
    const tab = window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from(SAFETY_BUCKET)
      .createSignedUrl(doc.file_path, 300);
    if (error || !data?.signedUrl) {
      tab?.close();
      toast.error(error?.message ?? "Could not open this document");
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  };

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        {canSee && canWrite && (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Upload
          </Button>
        )}
      </div>
      <Link to="/safety" className="mt-2 inline-flex text-sm text-primary underline">
        Back to Safety
      </Link>

      {rolesLoading ? (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      ) : !canSee ? (
        <p className="mt-4 text-muted-foreground">You don't have access to safety documents.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
          />
          {q.isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : q.error ? (
            <p className="text-destructive">{errMsg(q.error)}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">
              {search.trim() ? "No documents match your search." : "No documents yet."}
            </p>
          ) : (
            rows.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <FileText className="h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{doc.title}</span>
                      {categories.length > 1 && (
                        <Badge variant="secondary">{SAFETY_CATEGORY_LABEL[doc.category]}</Badge>
                      )}
                      {can.can_manage_safety && doc.shareable_with_subs && (
                        <Badge variant="outline">Shared with subs</Badge>
                      )}
                      {can.can_manage_safety && doc.requires_acknowledgement && (
                        <Badge variant="outline">Requires acknowledgement</Badge>
                      )}
                      {pendingIds.has(doc.id) ? (
                        <Badge variant="destructive">Pending acknowledgement</Badge>
                      ) : (
                        doc.requires_acknowledgement && (
                          <Badge variant="secondary">Acknowledged</Badge>
                        )
                      )}
                    </div>
                    {(doc.version || doc.effective_date) && (
                      <div className="text-sm text-muted-foreground">
                        {[
                          doc.version && `Version ${doc.version}`,
                          doc.effective_date && `Effective ${doc.effective_date}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {doc.description && <p className="mt-1 text-sm">{doc.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => open(doc)}>
                      <ExternalLink className="mr-1 h-4 w-4" /> Open
                    </Button>
                    {!readOnly && pendingIds.has(doc.id) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!opened.has(doc.id) || busyId === doc.id}
                        title={opened.has(doc.id) ? undefined : "Open the document first"}
                        onClick={() => doAcknowledge(doc)}
                      >
                        <CheckCheck className="mr-1 h-4 w-4" />
                        {opened.has(doc.id) ? "Acknowledge" : "Open first to acknowledge"}
                      </Button>
                    )}
                    {canWrite && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === doc.id}
                          onClick={() => toggleRequired(doc)}
                        >
                          {doc.requires_acknowledgement
                            ? "Stop requiring acknowledgement"
                            : "Require acknowledgement"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReplaceDoc(doc)}>
                          <RefreshCw className="mr-1 h-4 w-4" /> Replace version
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setArchiveDoc(doc)}>
                          <Archive className="mr-1 h-4 w-4" /> Archive
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {canSee && canWrite && (
        <>
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            categories={categories}
            onDone={refresh}
          />
          <ReplaceDialog doc={replaceDoc} onClose={() => setReplaceDoc(null)} onDone={refresh} />
          <ArchiveDialog doc={archiveDoc} onClose={() => setArchiveDoc(null)} onDone={refresh} />
        </>
      )}
    </main>
  );
}

/** Uploads straight to the bucket (storage RLS allows only manage_safety); the caller then records it. */
async function uploadFile(file: File) {
  const path = safetyStoragePath(file.name);
  const { error } = await supabase.storage
    .from(SAFETY_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

function UploadDialog({
  open,
  onOpenChange,
  categories,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: SafetyCategory[];
  onDone: () => void;
}) {
  const create = useServerFn(createSafetyDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SafetyCategory>(categories[0]);
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [shareable, setShareable] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a file");
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    let path: string | null = null;
    try {
      path = await uploadFile(file);
      await create({
        data: {
          title,
          category,
          description,
          version,
          effectiveDate,
          shareableWithSubs: shareable,
          requiresAcknowledgement: requiresAck,
          filePath: path,
        },
      });
      toast.success("Document uploaded");
      setTitle("");
      setDescription("");
      setVersion("");
      setEffectiveDate("");
      setShareable(false);
      setRequiresAck(false);
      setCategory(categories[0]);
      onOpenChange(false);
      onDone();
    } catch (e) {
      if (path) await supabase.storage.from(SAFETY_BUCKET).remove([path]);
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sd-file">File</Label>
            <Input id="sd-file" type="file" accept={ACCEPT} ref={fileRef} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sd-title">Title</Label>
            <Input id="sd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {categories.length > 1 && (
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SafetyCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SAFETY_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="sd-desc">Description</Label>
            <Textarea
              id="sd-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sd-version">Version</Label>
              <Input id="sd-version" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sd-date">Effective date</Label>
              <Input
                id="sd-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sd-share"
              checked={shareable}
              onCheckedChange={(c) => setShareable(c === true)}
            />
            <Label htmlFor="sd-share">Share with subcontractors</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sd-ack"
              checked={requiresAck}
              onCheckedChange={(c) => setRequiresAck(c === true)}
            />
            <Label htmlFor="sd-ack">Requires acknowledgement</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceDialog({
  doc,
  onClose,
  onDone,
}: {
  doc: Doc | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const replace = useServerFn(replaceSafetyDocumentVersion);
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!doc) return;
    if (!file) return toast.error("Choose a file");
    setBusy(true);
    let path: string | null = null;
    try {
      path = await uploadFile(file);
      await replace({ data: { id: doc.id, filePath: path, version, effectiveDate } });
      toast.success("Version replaced");
      setVersion("");
      setEffectiveDate("");
      onClose();
      onDone();
    } catch (e) {
      if (path) await supabase.storage.from(SAFETY_BUCKET).remove([path]);
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace version{doc ? `: ${doc.title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sr-file">New file</Label>
            <Input id="sr-file" type="file" accept={ACCEPT} ref={fileRef} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sr-version">New version</Label>
              <Input id="sr-version" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-date">Effective date</Label>
              <Input
                id="sr-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Replacing…" : "Replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({
  doc,
  onClose,
  onDone,
}: {
  doc: Doc | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const archive = useServerFn(archiveSafetyDocument);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await archive({ data: { id: doc.id } });
      toast.success("Document archived");
      onClose();
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this document?</AlertDialogTitle>
          <AlertDialogDescription>
            {doc?.title} will no longer be listed. This cannot be undone from the app.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
