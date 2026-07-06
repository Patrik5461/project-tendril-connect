import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({
  mode: z.enum(["login", "signup"]).catch("login"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Prihlásenie – Tendrik" },
      { name: "description", content: "Prihláste sa alebo si vytvorte bezplatný účet Tendrik." },
    ],
  }),
  component: AuthPage,
});

const TEST_EMAIL = "test@tendrik.sk";
const TEST_PASSWORD = "Tendrik123!";

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";

  async function loginAsTest() {
    setLoading(true);
    try {
      let res = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      if (res.error) {
        const signup = await supabase.auth.signUp({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          options: { emailRedirectTo: window.location.origin + "/onboarding" },
        });
        if (signup.error) throw signup.error;
        res = await supabase.auth.signInWithPassword({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        });
        if (res.error) throw res.error;
      }
      toast.success("Prihlásené ako testovací účet");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Nastala chyba");
    } finally {
      setLoading(false);
    }
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/onboarding" },
        });
        if (error) throw error;
        // If email confirmation is disabled, session is available immediately
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          toast.success("Účet vytvorený");
          navigate({ to: "/onboarding" });
        } else {
          toast.success("Skontrolujte si e-mail pre potvrdenie účtu.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Prihlásené");
        navigate({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Nastala chyba");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-8 text-2xl font-bold text-primary">
          Tendrik.sk
        </Link>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-center">
            {isSignup ? "Vytvoriť účet" : "Prihlásiť sa"}
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {isSignup ? "Zadarmo, bez záväzkov" : "Vitajte späť"}
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Heslo</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Moment..." : isSignup ? "Registrovať sa" : "Prihlásiť sa"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {isSignup ? (
              <>
                Už máte účet?{" "}
                <Link to="/auth" search={{ mode: "login" }} className="text-primary font-medium">
                  Prihláste sa
                </Link>
              </>
            ) : (
              <>
                Nemáte účet?{" "}
                <Link to="/auth" search={{ mode: "signup" }} className="text-primary font-medium">
                  Zaregistrujte sa
                </Link>
              </>
            )}
          </div>
        </div>


        <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-primary">Testovací účet (dočasné)</p>
          <p className="mt-1 text-muted-foreground">
            E-mail: <span className="font-mono">{TEST_EMAIL}</span>
            <br />
            Heslo: <span className="font-mono">{TEST_PASSWORD}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={loginAsTest}
            disabled={loading}
          >
            Prihlásiť sa ako test
          </Button>
        </div>
      </div>
    </div>
  );
}
