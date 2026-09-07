import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type AppRole = { id: string; name: string; is_active: boolean; is_admin: boolean };

/** The signed-in user's roles, read from the account (never chosen by the user). */
export function useMyRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role_id, app_roles(id, name, is_active, is_admin)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.app_roles as unknown as AppRole | null)
        .filter((r): r is AppRole => !!r && r.is_active);
    },
  });
  const roles = q.data ?? [];
  return {
    roles,
    roleNames: roles.map((r) => r.name),
    isAdmin: roles.some((r) => r.is_admin),
    loading: q.isLoading,
  };
}
