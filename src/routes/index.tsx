import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MapPin, Building2, Camera, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/")({
  component: () => <RequireAuth><JobsPage /></RequireAuth>,
});

function JobsPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", address: "", client: "", notes: "" });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs").select("*, photos(count)")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.name, j.address, j.client, j.notes].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))
    );
  }, [jobs, search]);

  const create = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company selected");
      const { data, error } = await supabase.from("jobs").insert({
        ...form, user_id: user!.id, company_id: company.id,
      }).select().single();
      if (error) throw error;
      await logActivity({ company_id: company.id, job_id: data.id, kind: "job_created", meta: { name: data.name } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", company?.id] });
      setForm({ name: "", address: "", client: "", notes: "" });
      setOpen(false);
      toast.success("Job site created");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Job Sites</h1>
          <p className="text-sm text-muted-foreground">{company?.name ?? "—"}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />New Job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Job Site</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <div><Label>Job name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Client</Label><Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={create.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search jobs by name, address, client…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((j) => {
            const count = (j.photos as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Link key={j.id} to="/job/$jobId" params={{ jobId: j.id }}>
                <Card className="transition hover:shadow-[var(--shadow-elegant)] hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-accent/20 p-2"><Building2 className="h-5 w-5 text-accent-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <h3 className="truncate font-semibold">{j.name}</h3>
                        {j.client && <p className="text-xs text-muted-foreground truncate">{j.client}</p>}
                        {j.address && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground truncate"><MapPin className="h-3 w-3" />{j.address}</p>}
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><Camera className="h-3 w-3" />{count} photos</span>
                          <span className="text-muted-foreground">{formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 font-medium">{search ? "No matches" : "No job sites yet"}</p>
          <p className="text-sm text-muted-foreground">{search ? "Try another search." : "Create your first project to get started."}</p>
        </div>
      )}
    </div>
  );
}
