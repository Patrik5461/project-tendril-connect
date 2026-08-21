# Tendrik — natívna iOS appka (Capacitor)

## Ako to funguje

Tendrik je TanStack Start SSR aplikácia (nitro node-server za nginxom na `tendrik.sk`),
takže sa nedá zabaliť do statického bundlu. Natívna appka je preto **obal nad živým webom**:

- `capacitor.config.ts` → `server.url = "https://tendrik.sk"`
- WKWebView načíta rovnaký web, aký beží v prehliadači — prihlásenie, radary,
  zákazky, granty aj obsah podľa predplatného fungujú bez duplicity kódu
- `webDir` ukazuje na `mobile-shell/`, čo je len offline hláška; `npx cap sync`
  potrebuje, aby ten priečinok existoval

**Dôsledok:** každý deploy webu (`deploy-tendrik.sh`) sa okamžite prejaví aj v appke.
Nový build do App Store treba len keď sa mení natívna časť (pluginy, ikona, konfigurácia).

Natívne správanie je v kóde ohraničené cez `useIsNative()`:

| Súbor | Čo robí |
| --- | --- |
| `src/lib/native.ts` | detekcia platformy, `openExternal()`, `viewport-fit=cover` |
| `src/lib/push.ts` | povolenie, registrácia tokenu, klik na notifikáciu → `/zakazka/:id` |
| `src/components/PushNotificationsCard.tsx` | prepínač v nastaveniach (len v appke) |
| `src/components/WebOnlyPurchase.tsx` | skrytie nákupu predplatného (App Store 3.1.1) |
| `src/components/MobileBottomNav.tsx` | spodná navigácia (len v appke) |
| `src/components/NativeAppLifecycle.tsx` | návrat do appky zneplatní React Query cache |

Natívne správanie, ktoré nie je vidieť v kóde webu:

| Kde | Čo |
| --- | --- |
| `AppDelegate.swift` | device token pre push; vynulovanie odznaku pri otvorení appky |
| `SceneDelegate.swift` | gesto „späť“ ťahom od ľavého okraja |
| `capacitor.config.ts` → `errorPath` | offline hláška z `mobile-shell/index.html` |
| `App.entitlements` | capability Push Notifications |

Odznak na ikone sa nastavuje z APNs payloadu — `send-push` prijíma voliteľné
pole `badge`. Appka si ho vynuluje sama pri otvorení, takže netreba posielať
žiadnu „mazaciu“ notifikáciu.

## Push notifikácie

| Platforma | Kanál | Secrets |
| --- | --- | --- |
| iOS | APNs priamo (token-based, `.p8`) | `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV` |
| Android | Firebase Cloud Messaging HTTP v1 | `FCM_SERVICE_ACCOUNT_JSON` |

Na iOS musí device token do Capacitora poslať `AppDelegate` — plugin si ho od systému
nepýta sám, iba počúva na `NotificationCenter`. Robia to metódy
`didRegisterForRemoteNotificationsWithDeviceToken` a `didFailToRegisterForRemoteNotificationsWithError`
v `ios/App/App/AppDelegate.swift`. **Keď ich odtiaľ niekto vymaže, registrácia sa
navonok tvári ako 15-sekundový timeout** (`no_token: timeout` v hláške pri zapnutí).

Logika odosielania je v `supabase/functions/_shared/push.ts` — tokeny sa načítajú z `push_tokens`,
rozdelia podľa stĺpca `platform` a pošlú príslušným kanálom. Neplatné tokeny
(410 Unregistered, BadDeviceToken) sa z tabuľky automaticky mažú.

Volajú to: `send-push`, `send-daily-digest`, `send-deadline-reminders`.

---

## Čo treba spraviť (jednorazovo)

### 1. Apple Developer portál

1. **Identifiers → App IDs → +** → App ID `sk.tendrik.app`, zapnúť **Push Notifications**
2. **Keys → +** → názov napr. `Tendrik APNs`, zaškrtnúť **Apple Push Notifications service (APNs)**
   → **Continue** → **Register** → stiahnuť `AuthKey_XXXXXXXXXX.p8`
   ⚠️ Stiahnuť sa dá **iba raz** — odlož si ho.
3. Poznač si:
   - **Key ID** — 10 znakov, je v názve súboru (`AuthKey_<KEYID>.p8`)
   - **Team ID** — vpravo hore v portáli / Membership details

### 2. Supabase secrets

```bash
supabase secrets set APNS_KEY_ID=XXXXXXXXXX
supabase secrets set APNS_TEAM_ID=YYYYYYYYYY
supabase secrets set APNS_BUNDLE_ID=sk.tendrik.app
supabase secrets set APNS_ENV=production
supabase secrets set APNS_KEY_P8="$(cat AuthKey_XXXXXXXXXX.p8)"
```

`APNS_ENV` je len prvý pokus — ak Apple odpovie `BadDeviceToken`, funkcia
automaticky skúsi aj druhé prostredie. Vďaka tomu fungujú naraz debug buildy
z Xcode (sandbox tokeny) aj TestFlight/App Store (produkčné).

Potom nasadiť funkcie:

```bash
supabase functions deploy send-push
supabase functions deploy send-daily-digest
supabase functions deploy send-deadline-reminders
```

### 3. Xcode (na Macu)

```bash
git pull
bun install
npx cap sync ios
npx cap open ios
```

V Xcode:

1. Vybrať target **App** → **Signing & Capabilities**
   - **Team** → tvoj Apple Developer tím
   - **Bundle Identifier** musí byť `sk.tendrik.app`
   - **Push Notifications** už kliknúť netreba — capability je v repe
     (`ios/App/App/App.entitlements` + `CODE_SIGN_ENTITLEMENTS` v projekte).
     Ak Xcode hlási, že profil capability nepodporuje, znamená to, že App ID
     v portáli ešte nemá zapnuté Push Notifications (krok 1 vyššie).
2. **General** → **Minimum Deployments** nechať na tom, čo predvyplnil Capacitor (iOS 14+)
3. Ikona a splash sú vygenerované skriptom (červená plocha + biele „T“, rovnaká
   značka ako v hlavičke webu). Ak príde od grafika skutočné logo, stačí prepísať
   `AppIcon-512@2x.png` — musí byť **1024×1024 PNG bez priehľadnosti**.
4. Spustiť na fyzickom zariadení (simulátor push notifikácie z APNs nedostane).

### 4. Test push notifikácií

1. V appke sa prihlás → **Nastavenia** → zapni *Notifikácie v aplikácii*, povoľ prompt
2. Over, že sa uložil token:
   ```sql
   select id, platform, created_at from push_tokens order by created_at desc limit 5;
   ```
3. Pošli testovaciu notifikáciu:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"user_id":"<tvoje-user-id>","title":"Tendrik","body":"Test","path":"/dashboard"}'
   ```
   Odpoveď `{"sent":1,"removed":0}` = doručené. Appku daj pred testom na pozadie —
   v popredí iOS banner nezobrazí.
4. Klik na notifikáciu má otvoriť cestu z `path` (alebo `/zakazka/<tender_id>`).

### 5. TestFlight / App Store

1. V App Store Connect vytvoriť appku s bundle ID `sk.tendrik.app`
2. Vyplniť privacy policy URL (`https://tendrik.sk/ochrana-osobnych-udajov`)
3. Build nahrať cez Xcode Cloud (nižšie) alebo ručne:
   Xcode → **Product → Archive** → **Distribute App** → **App Store Connect**

Interné testovanie (do 100 ľudí z tímu) ide bez App Review. Externé testovanie
prechádza cez Beta App Review, kde je hlavné riziko pravidlo 4.2 (prebalený web) —
preto má zmysel púšťať externých testerov až vtedy, keď fungujú push notifikácie.

### 6. Xcode Cloud

Repozitár je pripravený, workflow stačí vytvoriť v Xcode (Product → Xcode Cloud).
Projekt: `ios/App/App.xcodeproj`, schéma **App**, archive konfigurácia Release.

Dve veci, bez ktorých by CI build spadol, sú už v repe:

| Súbor | Načo |
| --- | --- |
| `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` | Xcode Cloud vidí iba **zdieľané** schémy. Predtým tu žiadna nebola, workflow by nemal čo buildovať. |
| `ios/App/ci_scripts/ci_post_clone.sh` | Doinštaluje bun, spustí `bun install` a `cap sync ios`. |
| `ios/App/ci_scripts/ci_pre_xcodebuild.sh` | Prepíše `CURRENT_PROJECT_VERSION` na `CI_BUILD_NUMBER`, aby sa čísla buildov neopakovali. |

Prečo ten `ci_post_clone.sh` musí byť: `App/App/public` a
`App/App/capacitor.config.json` sú v `ios/.gitignore`, lebo ich generuje
`cap sync`. V čerstvom klone teda neexistujú. Rovnako `CapApp-SPM/Package.swift`
odkazuje na pluginy cestami do `node_modules`, ktoré CI tiež nemá.
Je to tá istá príčina, pre ktorú spadne build aj na Macu po `git clone` bez syncu.

---

## Na čo si dať pozor pri review

- **Guideline 4.2 (Minimum Functionality).** Appka je obal nad webom. Push notifikácie
  a natívna spodná navigácia sú hlavný argument, že prináša niečo navyše. Ak by review
  appku odmietlo, ďalší krok je zvýrazniť natívne funkcie (napr. offline zoznam
  sledovaných zákaziek).
- **Guideline 3.1.1 (In-App Purchase).** Predplatné cez GoPay je v natívnej appke
  **zámerne skryté** (`WebOnlyPurchase`, `cennik.tsx`, `predplatne.tsx`) a `allowNavigation`
  v `capacitor.config.ts` nepúšťa GoPay do webview. Toto neodstraňuj — inak review neprejde.
- Do App Store Connect treba dať **testovací účet** s aktívnym predplatným, inak
  reviewer neuvidí platený obsah.

## Bežné problémy

| Príznak | Príčina |
| --- | --- |
| `{"sent":0}` a v logoch `APNS_NOT_CONFIGURED` | chýba niektorý z `APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` |
| `DeviceTokenNotForTopic` | `APNS_BUNDLE_ID` sa nezhoduje s Bundle Identifier v Xcode |
| token sa vôbec neuloží | v Xcode chýba capability **Push Notifications**, alebo test beží na simulátore |
| appka po štarte biela | server `tendrik.sk` je nedostupný — appka nemá vlastný obsah |
| obsah pod výrezom / domovským indikátorom | `viewport-fit=cover` sa nenastavil, pozri `applyNativeViewportFit()` |
