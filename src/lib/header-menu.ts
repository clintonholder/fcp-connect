import {
  FolderKanban,
  House,
  MapPin,
  MessageSquare,
  PaintRoller,
  Shield,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type MenuChild = { to: string; label: string; exact?: boolean };
export type MenuItem = { to: string; label: string; icon: LucideIcon; children?: MenuChild[] };

const NP = "/national-paint";

/** The National Paint pages, in the order of the page tab row. Import is admin-only. */
export function nationalPaintPages(isAdmin: boolean): MenuChild[] {
  const pages: MenuChild[] = [
    { to: NP, label: "Projects", exact: true },
    { to: `${NP}/people`, label: "People and crews" },
    { to: `${NP}/timeline`, label: "Project Timeline" },
    { to: `${NP}/capacity`, label: "Crew Capacity" },
    { to: `${NP}/revenue`, label: "Revenue" },
    { to: `${NP}/dashboard`, label: "Dashboard" },
    { to: `${NP}/finance`, label: "Finance" },
    { to: `${NP}/analysis`, label: "Project Analysis" },
    { to: `${NP}/cmic`, label: "CMiC" },
  ];
  if (isAdmin) pages.push({ to: `${NP}/import`, label: "Import" });
  return pages;
}

/** Label of the National Paint page for a pathname, or null outside National Paint. */
export function nationalPaintPageLabel(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return nationalPaintPages(true).find((p) => p.to === path)?.label ?? null;
}

/** Up to two uppercase initials: first letters of the first and last words. */
export function initialsFor(name: string): string {
  const base = name.includes("@") ? name.split("@")[0] : name;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function menuGroups({
  isAdmin,
  canManageNationalPaint,
}: {
  isAdmin: boolean;
  canManageNationalPaint: boolean;
}): { navigate: MenuItem[]; admin: MenuItem[] | null } {
  const navigate: MenuItem[] = [
    { to: "/", label: "Home", icon: House },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/map", label: "Map", icon: MapPin },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/safety", label: "Safety", icon: ShieldCheck },
  ];
  if (canManageNationalPaint) {
    navigate.push({
      to: NP,
      label: "National Paint",
      icon: PaintRoller,
      children: nationalPaintPages(isAdmin),
    });
  }
  return { navigate, admin: isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : null };
}
