import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MapPin, Building2, Camera } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/")({
  component: () => <RequireAuth><JobsPage /></RequireAuth>,
});

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", client: "", notes: "" });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, photos(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("jobs").insert({
        ...form, user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setForm({ name: "", address: "", client: "", notes: "" });
      setOpen(false);
      toast.success("Job site created");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Job Sites</h1>
          <p className="text-sm text-muted-foreground">Manage your active projects</p>
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

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : jobs && jobs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => {
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
          <p className="mt-2 font-medium">No job sites yet</p>
          <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
        </div>
      )}
    </div>
  );
}
