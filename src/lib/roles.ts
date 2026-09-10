import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const PERMISSIONS = [
  { key: "can_add_projects", label: "Add projects" },
  { key: "can_edit_projects", label: "Edit projects" },
  { key: "can_delete_projects", label: "Delete projects" },
  { key: "can_add_photos", label: "Add photos" },
  { key: "can_edit_photos", label: "Edit photos" },
  { key: "can_delete_photos", label: "Delete photos" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export type AppRole = {
  id: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
  is_director: boolean;
} & Record<PermissionKey, boolean>;

export type Permissions = Record<PermissionKey, boolean>;

const allow = (v: boolean): Permissions =>
  Object.fromEntries(PERMISSIONS.map((p) => [p.key, v])) as Permissions;

/** The signed-in user's roles, read from the account (never chosen by the user). */
export function useMyRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role_id, app_roles(*)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.app_roles as unknown as AppRole | null)
        .filter((r): r is AppRole => !!r && r.is_active);
    },
  });

  const d = useQuery({
    queryKey: ["my-divisions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_divisions")
        .select("division")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((x) => x.division).sort();
    },
  });

  const roles = q.data ?? [];
  const isAdmin = roles.some((r) => r.is_admin);
  const isDirector = roles.some((r) => r.is_director);

  // Admins have everything. Someone with no role has nothing until an admin assigns one.
  const can: Permissions = isAdmin
    ? allow(true)
    : roles.length === 0
      ? allow(false)
      : (Object.fromEntries(
          PERMISSIONS.map((p) => [p.key, roles.some((r) => r[p.key])]),
        ) as Permissions);

  return {
    roles,
    roleNames: roles.map((r) => r.name),
    isAdmin,
    isDirector,
    myDivisions: d.data ?? [],
    can,
    loading: q.isLoading || d.isLoading,
  };
}
