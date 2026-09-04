// Vyhľadávanie katastrálneho územia podľa názvu alebo kódu.
// Používa ho admin karta syncu aj obe záložky stránky /kataster.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { errorText } from "@/lib/kataster";
import type { KuRow } from "@/lib/kataster";
import { toast } from "sonner";

// ku_list zatiaľ nie je v generovaných typoch, preto beztypový klient.
const db = supabase as unknown as SupabaseClient;

// PostgREST: čiarky a zátvorky by rozbili syntax .or() filtra.
function sanitize(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

export function KuPicker({
  value,
  onChange,
  placeholder = "k.ú., obec, okres alebo kód (min. 2 znaky)",
  allowEmpty = false,
}: {
  value: KuRow | null;
  onChange: (ku: KuRow | null) => void;
  placeholder?: string;
  /** true = prázdny vstup znamená „všetky k.ú." */
  allowEmpty?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KuRow[]>([]);
  const token = useRef(0);

  useEffect(() => {
    const q = sanitize(query);
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    const mine = ++token.current;
    const t = setTimeout(async () => {
      const { data, error } = await db
        .from("ku_list")
        .select("ku_code,ku_name,obec,okres,kraj")
        // Ľudia píšu "Bratislava" alebo "Vysoké Tatry", ale k.ú. sa volá Staré Mesto
        // či Tatranská Lomnica — preto hľadáme aj v obci, okrese a kraji.
        .or(
          `ku_name.ilike.%${q}%,ku_code.ilike.%${q}%,obec.ilike.%${q}%,okres.ilike.%${q}%,kraj.ilike.%${q}%`,
        )
        .order("ku_name")
        .limit(20);
      if (error) {
        console.error("[kataster] hľadanie k.ú. zlyhalo", error);
        toast.error(`Hľadanie k.ú. zlyhalo: ${errorText(error)}`);
        return;
      }
      if (mine === token.current) setOptions((data ?? []) as KuRow[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          value={value ? `${value.ku_name} (${value.ku_code})` : query}
          placeholder={placeholder}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (value) onChange(null);
            if (allowEmpty && !next.trim()) onChange(null);
          }}
        />
      </div>
      {!value && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {options.map((o) => (
            <li key={o.ku_code}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(o);
                  setOptions([]);
                  setQuery("");
                }}
              >
                {o.ku_name} <span className="text-muted-foreground">({o.ku_code})</span>
                {o.obec && o.obec !== o.ku_name && (
                  <span className="text-muted-foreground"> · {o.obec}</span>
                )}
                {o.okres && <span className="text-muted-foreground"> · {o.okres}</span>}
                {o.kraj && <span className="text-muted-foreground"> · {o.kraj}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default KuPicker;
