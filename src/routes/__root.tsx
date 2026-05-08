import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { HardHat, MapPin, LogOut, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <Link to="/" className="mt-4 inline-block text-accent underline">Go home</Link>
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
      { title: "SiteSnap — Job Site Photos with GPS" },
      { name: "description", content: "Capture, geotag, and organize commercial job site photos." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
  if (!user) return null;
  return (
    <header className="sticky top-0 z-40 border-b bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <HardHat className="h-5 w-5 text-accent" />
          <span>SiteSnap</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/" className="rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent" activeOptions={{ exact: true }} activeProps={{ className: "bg-sidebar-accent" }}>
            <span className="flex items-center gap-1.5"><FolderKanban className="h-4 w-4" />Jobs</span>
          </Link>
          <Link to="/map" className="rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent" }}>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />Map</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-primary-foreground hover:bg-sidebar-accent hover:text-primary-foreground">
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
        <Header />
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
