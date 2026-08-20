import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isNative } from "@/lib/native";

/**
 * Natívna appka sa neukončí, keď z nej používateľ odíde — po návrate do nej
 * WKWebView pokračuje tam, kde prestal, aj o niekoľko hodín neskôr. Na
 * obrazovke by tak zostali staré zákazky bez akéhokoľvek náznaku, že sú staré.
 *
 * Pri prepnutí späť preto zneplatníme cache. React Query načíta iba dopyty,
 * ktoré má aktuálna obrazovka pripojené, takže to nie je plné obnovenie appky.
 *
 * Renderuje null — je to len obal na efekt, aby sa dal vložiť pod
 * QueryClientProvider a nemusel sa `useQueryClient` volať v roote.
 */
export function NativeAppLifecycle() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isNative()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) queryClient.invalidateQueries();
      });
      // Odhlásenie mohlo prebehnúť skôr, než sa plugin stihol načítať.
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [queryClient]);

  return null;
}

export default NativeAppLifecycle;
