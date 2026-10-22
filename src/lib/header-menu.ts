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

export type MenuItem = { to: string; label: string; icon: LucideIcon };

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
    navigate.push({ to: "/national-paint", label: "National Paint", icon: PaintRoller });
  }
  return { navigate, admin: isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : null };
}
