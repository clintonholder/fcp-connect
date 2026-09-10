import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import fcpLogo from "@/assets/fcp-logo.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FCP Connect" },
      { name: "description", content: "Sign in to FCP Connect to view FCP Services project documentation and photos." },
      { property: "og:title", content: "Sign in — FCP Connect" },
      { property: "og:description", content: "Sign in to FCP Connect to view FCP Services project documentation and photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
});

export const DISABLED_ACCOUNT_MESSAGE =
  "This account has been disabled. Contact an administrator.";

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match an account.";
  if (m.includes("email not confirmed")) return "Your account isn't verified yet — open the invitation or confirmation email first.";
  if (m.includes("banned") || m.includes("disabled") || m.includes("user is banned"))
    return DISABLED_ACCOUNT_MESSAGE;
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

function safeRedirect(value?: string): string {
  // Only trust same-origin relative paths; ignore absolute/protocol-relative URLs.
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{ general?: string; email?: string; password?: string }>({});
  const search = Route.useSearch();
  const navigate = useNavigate();

  const clearErrors = () => setErrors({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearErrors();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrors({ email: "Enter your work email to continue." });
      return;
    }
    if (mode === "signin" && !password) {
      setErrors({ password: "Enter your password to sign in." });
      return;
    }

    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
        toast.success("Password reset link sent — check your email.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) throw error;
        const { data: prof } = await supabase.from("profiles").select("is_disabled").eq("id", data.user.id).maybeSingle();
        if (prof?.is_disabled) {
          await supabase.auth.signOut();
          throw new Error(DISABLED_ACCOUNT_MESSAGE);
        }
        navigate({ to: safeRedirect(search.redirect) });
      }
    } catch (err) {
      const message = (err as Error).message;
      const general = friendlyError(message);
      toast.error(general);
      if (message === DISABLED_ACCOUNT_MESSAGE) {
        setErrors({ general });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--gradient-hero)" }}>
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="text-center">
          <img src={fcpLogo.url} alt="FCP Services" className="mx-auto h-10 w-auto" />
          <h1 className="mt-3 text-xl font-semibold">FCP Connect</h1>
          <p className="text-sm text-muted-foreground">Project photos and field documentation</p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We sent a password reset link to {email}. Open it to choose a new password.
              </p>
              <Button variant="outline" className="w-full" onClick={() => { setSent(false); setMode("signin"); }}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {errors.general && (
                <p
                  id="login-error"
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {errors.general}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>
              {mode === "signin" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      className="pr-10"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pl-3 pr-3 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p id="password-error" role="alert" className="text-sm text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Signing in…" : mode === "signin" ? "Sign In" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "forgot" : "signin");
                  clearErrors();
                }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                {mode === "signin" ? "Forgot your password?" : "Back to sign in"}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Accounts are created by an FCP Connect administrator.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
