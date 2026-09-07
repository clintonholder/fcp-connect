import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
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
});

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match an account.";
  if (m.includes("email not confirmed")) return "Your account isn't verified yet — open the invitation or confirmation email first.";
  if (m.includes("banned") || m.includes("disabled") || m.includes("user is banned")) return "This account has been disabled. Contact an administrator.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
        toast.success("Password reset link sent — check your email.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        const { data: prof } = await supabase.from("profiles").select("is_disabled").eq("id", data.user.id).maybeSingle();
        if (prof?.is_disabled) {
          await supabase.auth.signOut();
          throw new Error("This account has been disabled. Contact an administrator.");
        }
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(friendlyError((err as Error).message));
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode === "signin" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "…" : mode === "signin" ? "Sign In" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "forgot" : "signin")}
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
