import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created — you can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--gradient-hero)" }}>
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <HardHat className="h-6 w-6 text-accent-foreground" />
          </div>
          <CardTitle className="text-2xl">SiteSnap</CardTitle>
          <p className="text-sm text-muted-foreground">Geotag and organize job site photos</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="w-full text-sm text-muted-foreground hover:text-foreground">
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
