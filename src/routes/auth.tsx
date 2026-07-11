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
      { name: "description", content: "Prihláste sa alebo si vytvorte účet Tendrik. Prvé 2 mesiace zadarmo, potom 4,99 €/mesiac." },
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
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeGdpr, setAgreeGdpr] = useState(false);
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
    if (isSignup && (!agreeTerms || !agreeGdpr)) {
      toast.error("Musíte súhlasiť s obchodnými podmienkami a spracovaním osobných údajov.");
      return;
    }
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 font-display font-bold text-2xl text-primary">
          <span className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          Tendrik.sk
        </Link>
        <div className="rounded-lg border border-primary/15 bg-card p-6">
          <h1 className="font-display text-2xl font-bold text-center tracking-tight">
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
            {isSignup && (
              <>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                  <b className="text-primary">2 mesiace zdarma</b>, potom 4,99 € / mes bez DPH
                  (6,14 € s DPH). Bez platobnej karty. Zrušiteľné kedykoľvek.
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    required
                  />
                  <span>
                    Súhlasím s{" "}
                    <Link to="/pravne/obchodne-podmienky" target="_blank" className="text-primary underline">
                      obchodnými podmienkami
                    </Link>{" "}
                    a s{" "}
                    <Link to="/pravne/opakovane-platby" target="_blank" className="text-primary underline">
                      podmienkami opakovaných platieb
                    </Link>
                    .
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agreeGdpr}
                    onChange={(e) => setAgreeGdpr(e.target.checked)}
                    required
                  />
                  <span>
                    Beriem na vedomie{" "}
                    <Link to="/pravne/gdpr" target="_blank" className="text-primary underline">
                      spracovanie osobných údajov (GDPR)
                    </Link>
                    .
                  </span>
                </label>
              </>
            )}
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
