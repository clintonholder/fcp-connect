import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/team")({
  component: () => <RequireAuth><TeamPage /></RequireAuth>,
});

function TeamPage() {
  const { user } = useAuth();
  const { company, companies, reload, setActive } = useCompany();
  const qc = useQueryClient();
  const [newCo, setNewCo] = useState("");
  const [coOpen, setCoOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const myRole = company?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  const { data: members } = useQuery({
    queryKey: ["members", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_members")
        .select("*, profiles(display_name, email)")
        .eq("company_id", company!.id);
      if (error) throw error;
      return data;
    },
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("companies").insert({ name: newCo, owner_id: user!.id }).select().single();
      if (error) throw error;
      const { error: mErr } = await supabase.from("company_members").insert({ company_id: data.id, user_id: user!.id, role: "owner" });
      if (mErr) throw mErr;
      return data;
    },
    onSuccess: async (d) => {
      setNewCo(""); setCoOpen(false);
      toast.success("Company created");
      await reload();
      setActive(d.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company");
      // Look up user by email in profiles
      const { data: prof, error } = await supabase.from("profiles").select("id").eq("email", inviteEmail.trim().toLowerCase()).maybeSingle();
      if (error) throw error;
      if (!prof) throw new Error("No user with that email has signed up yet. Ask them to sign up first.");
      const { error: mErr } = await supabase.from("company_members").insert({
        company_id: company.id, user_id: prof.id, role: "member",
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["members", company?.id] });
      toast.success("Member added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", company?.id] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-2"><Users className="h-6 w-6 text-accent-foreground" />Team</h1>
          <p className="text-sm text-muted-foreground">{company?.name ?? "—"}</p>
        </div>
        <Dialog open={coOpen} onOpenChange={setCoOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />New company</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create company</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createCompany.mutate(); }} className="space-y-3">
              <div><Label>Company name</Label><Input required value={newCo} onChange={(e) => setNewCo(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={createCompany.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-2 flex items-center gap-2"><Building2 className="h-4 w-4" />Your companies</h2>
          <div className="space-y-1">
            {companies.map((c) => (
              <button key={c.id} onClick={() => setActive(c.id)}
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm ${c.id === company?.id ? "bg-accent/30" : "hover:bg-muted"}`}>
                <span>{c.name}</span>
                <Badge variant="outline">{c.role}</Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-2">Members</h2>
          {canManage && (
            <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }} className="flex gap-2 mb-3">
              <Input type="email" required placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <Button type="submit" disabled={invite.isPending}>Add</Button>
            </form>
          )}
          <div className="space-y-1">
            {(members ?? []).map((m) => {
              const p = m.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
              return (
                <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <div className="font-medium">{p?.display_name || p?.email || m.user_id.slice(0, 8)}</div>
                    {p?.email && p?.display_name && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                    {canManage && m.role !== "owner" && (
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.id)}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Tip: teammates must sign up first, then you can add them by email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
