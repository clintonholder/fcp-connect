import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { CompanyProvider } from "@/lib/company-context";
import { Toaster } from "@/components/ui/sonner";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessageCount } from "@/lib/use-unread-messages";
import fcpLogo from "@/assets/fcp-logo.png.asset.json";
import { ProxyProvider } from "@/lib/proxy-context";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { HeaderMenu } from "@/components/HeaderMenu";

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

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="text-destructive">{error instanceof Error ? error.message : "Something went wrong."}</p>
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
  const { user } = useAuth();
  const unread = useUnreadMessageCount();
  if (!user) return null;
  return (
    <header className="sticky top-0 z-40 border-b bg-card text-foreground shadow-[var(--shadow-card)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <img src={fcpLogo.url} alt="FCP Services" className="h-10 w-auto sm:h-12" />
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/projects"
            className="hidden rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary sm:block"
            activeProps={{ className: "bg-secondary text-primary font-medium" }}
          >
            Projects
          </Link>
          <Link
            to="/map"
            className="hidden rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary sm:block"
            activeProps={{ className: "bg-secondary text-primary font-medium" }}
          >
            Map
          </Link>
          <Link
            to="/messages"
            aria-label="Messages"
            className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary"
            activeProps={{ className: "bg-secondary text-primary font-medium" }}
          >
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="px-1.5 py-0"
                  aria-label={`${unread} unread messages`}
                >
                  {unread}
                </Badge>
              )}
            </span>
          </Link>
          <HeaderMenu unread={unread} />
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
        <ProxyProvider>
          <CompanyProvider>
            <ViewAsBanner />
            <Header />
            <Outlet />
            <Toaster />
          </CompanyProvider>
        </ProxyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
