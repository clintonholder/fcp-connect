import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useProxy } from "@/lib/proxy-context";
import { useMyRoles } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { initialsFor, menuGroups, type MenuItem } from "@/lib/header-menu";

const itemMotion =
  "animate-in fade-in-0 slide-in-from-right-2 fill-mode-both motion-reduce:animate-none";
const stagger = (i: number): CSSProperties => ({ animationDelay: `${i * 30}ms` });

function SectionLabel({ children, index }: { children: string; index: number }) {
  return (
    <p
      className={`px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${itemMotion}`}
      style={stagger(index)}
    >
      {children}
    </p>
  );
}

export function HeaderMenu({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { proxy } = useProxy();
  const { isAdmin, can, roleNames, myDivisions } = useMyRoles();

  const profile = useQuery({
    queryKey: ["my-display-name", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.display_name ?? null;
    },
  });

  const name = proxy?.name || profile.data || user?.email || "";
  const groups = menuGroups({
    isAdmin,
    canManageNationalPaint: !!can.can_manage_national_paint,
  });
  const close = () => setOpen(false);

  let index = 0;
  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={close}
        activeOptions={{ exact: item.to === "/" }}
        className={`relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary motion-reduce:transition-none ${itemMotion}`}
        activeProps={{ className: "bg-primary/10 font-medium text-primary" }}
        style={stagger(index++)}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
            )}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1">{item.label}</span>
            {item.to === "/messages" && unread > 0 && (
              <Badge
                variant="destructive"
                className="px-1.5 py-0"
                aria-label={`${unread} unread messages`}
              >
                {unread}
              </Badge>
            )}
          </>
        )}
      </Link>
    );
  };

  const identityIndex = index++;
  const navLabelIndex = index++;
  const navItems = groups.navigate.map(renderItem);
  const adminLabelIndex = groups.admin ? index++ : 0;
  const adminItems = groups.admin?.map(renderItem);
  const signOutIndex = index++;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative h-5 w-5">
          <Menu
            className={`absolute inset-0 h-5 w-5 transition-all duration-200 motion-reduce:transition-none ${open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`}
          />
          <X
            className={`absolute inset-0 h-5 w-5 transition-all duration-200 motion-reduce:transition-none ${open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`}
          />
        </span>
        {unread > 0 && !open && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </button>
      <SheetContent
        side="right"
        overlayClassName="bg-black/40 backdrop-blur-sm duration-250 motion-reduce:animate-none"
        className="flex flex-col gap-0 p-4 ease-out data-[state=closed]:duration-250 data-[state=open]:duration-250 motion-reduce:animate-none motion-reduce:transition-none"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div
          className={`flex items-center gap-3 rounded-lg border bg-card p-3 pr-10 ${itemMotion}`}
          style={stagger(identityIndex)}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initialsFor(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roleNames.length ? roleNames.join(", ") : "No role"}
            </p>
            {myDivisions.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">{myDivisions.join(", ")}</p>
            )}
          </div>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto">
          <SectionLabel index={navLabelIndex}>Navigate</SectionLabel>
          <div className="flex flex-col gap-0.5">{navItems}</div>
          {adminItems && (
            <>
              <SectionLabel index={adminLabelIndex}>Admin</SectionLabel>
              <div className="flex flex-col gap-0.5">{adminItems}</div>
            </>
          )}
        </nav>
        <div className="mt-2 border-t pt-2">
          <button
            type="button"
            onClick={() => {
              close();
              signOut();
            }}
            className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none motion-reduce:transition-none ${itemMotion}`}
            style={stagger(signOutIndex)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
              <LogOut className="h-4 w-4" />
            </span>
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
