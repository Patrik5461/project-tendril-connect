import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Tendrik beží ako TanStack Start SSR appka (nitro node-server za nginxom),
 * takže sa nedá zabaliť do statického bundlu. Natívna appka preto načítava
 * živý web cez `server.url` — prihlásenie, radary, zákazky aj granty sú
 * presne tie isté ako na webe, len v natívnom obale s push notifikáciami.
 *
 * `webDir` musí existovať kvôli `npx cap sync`; ukazuje na mobile-shell/,
 * čo je len offline hláška pre prípad, že sa server nedá načítať.
 */
const config: CapacitorConfig = {
  appId: "sk.tendrik.app",
  appName: "Tendrik",
  webDir: "mobile-shell",
  server: {
    /**
     * Zámerne /dashboard, nie koreň — natívna appka nesmie začínať na
     * marketingovej homepage. /dashboard je za `_authenticated`, takže
     * neprihláseného sám presmeruje na /auth. Prihlásený vidí rovno zákazky.
     */
    url: "https://tendrik.sk/dashboard",
    cleartext: false,
    /**
     * Len vlastné domény. Všetko ostatné Capacitor otvorí mimo webview
     * (na externé odkazy používame Browser plugin cez openExternal()).
     * GoPay tu zámerne nie je — nákup predplatného je v natívnej appke
     * skrytý (WebOnlyPurchase), inak by to bolo porušenie App Store 3.1.1.
     */
    allowNavigation: ["tendrik.sk", "www.tendrik.sk"],
  },
  ios: {
    /**
     * "never" preto, že bezpečné zóny rieši samotný web cez
     * env(safe-area-inset-*) (utility safe-top / safe-x / safe-bottom
     * v styles.css). Pri "always" by WKWebView pridal vlastný odsadenie
     * a hlavička by bola odsadená dvakrát.
     */
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
  },
};

export default config;
