import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Company = { id: string; name: string; owner_id: string; role: string };

type CompanyCtx = {
  company: Company | null;
  companies: Company[];
  loading: boolean;
  setActive: (id: string) => void;
  reload: () => Promise<void>;
};

const Ctx = createContext<CompanyCtx>({
  company: null, companies: [], loading: true, setActive: () => {}, reload: async () => {},
});

const KEY = "active_company_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(KEY) : null
  );
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const { data: mems } = await supabase
      .from("company_members")
      .select("role, company_id, companies(id, name, owner_id)")
      .eq("user_id", user.id);
    const raw = (mems ?? []).map((m) => {
      const c = m.companies as unknown as { id: string; name: string; owner_id: string } | null;
      return c ? ({ id: c.id, name: c.name, owner_id: c.owner_id, role: m.role as string } as Company) : null;
    });
    let list: Company[] = raw.filter((x): x is Company => x !== null);

    if (list.length === 0) {
      // Auto-create a personal company
      const { data: co, error } = await supabase
        .from("companies").insert({ name: "My Company", owner_id: user.id }).select().single();
      if (!error && co) {
        await supabase.from("company_members").insert({ company_id: co.id, user_id: user.id, role: "owner" });
        list = [{ id: co.id, name: co.name, owner_id: co.owner_id, role: "owner" }];
      }
    }
    setCompanies(list);
    if (!activeId || !list.find((c) => c.id === activeId)) {
      const first = list[0]?.id ?? null;
      setActiveId(first);
      if (first) localStorage.setItem(KEY, first);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) reload(); else { setCompanies([]); setActiveId(null); setLoading(false); } }, [user?.id]);

  const setActive = (id: string) => { setActiveId(id); localStorage.setItem(KEY, id); };

  const company = companies.find((c) => c.id === activeId) ?? companies[0] ?? null;
  return <Ctx.Provider value={{ company, companies, loading, setActive, reload }}>{children}</Ctx.Provider>;
}

export const useCompany = () => useContext(Ctx);
