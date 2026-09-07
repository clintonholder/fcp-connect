import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CompanyProvider } from "@/lib/company-context";
import { useMyRoles } from "@/lib/roles";
import { Toaster } from "@/components/ui/sonner";
import { MapPin, LogOut, FolderKanban, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import fcpLogo from "@/assets/fcp-logo.png.asset.json";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <Link to="/" className="mt-4 inline-block text-primary underline">Go home</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="text-destructive">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 underline">Retry</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FCP Connect — Project Photos & Field Documentation" },
      { name: "description", content: "FCP Services project documentation: capture, geotag and organize job site photos by project." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function Header() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useMyRoles();
  if (!user) return null;
  return (
    <header className="sticky top-0 z-40 border-b bg-card text-foreground shadow-[var(--shadow-card)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <img src={fcpLogo.url} alt="FCP Services" className="h-9 w-auto sm:h-11" />
          <span className="hidden text-sm font-semibold tracking-wide text-primary sm:inline">FCP Connect</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary" activeOptions={{ exact: true }} activeProps={{ className: "bg-secondary text-primary font-medium" }}>
            <span className="flex items-center gap-1.5"><FolderKanban className="h-4 w-4" /><span className="hidden sm:inline">Projects</span></span>
          </Link>
          <Link to="/map" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary" activeProps={{ className: "bg-secondary text-primary font-medium" }}>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /><span className="hidden sm:inline">Map</span></span>
          </Link>
          {isAdmin && (
            <Link to="/admin" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary" activeProps={{ className: "bg-secondary text-primary font-medium" }}>
              <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /><span className="hidden sm:inline">Admin</span></span>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CompanyProvider>
          <Header />
          <Outlet />
          <Toaster />
        </CompanyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
