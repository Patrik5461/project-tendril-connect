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

## Push notifikácie

| Platforma | Kanál | Secrets |
| --- | --- | --- |
| iOS | APNs priamo (token-based, `.p8`) | `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV` |
| Android | Firebase Cloud Messaging HTTP v1 | `FCM_SERVICE_ACCOUNT_JSON` |

Logika je v `supabase/functions/_shared/push.ts` — tokeny sa načítajú z `push_tokens`,
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
   - **+ Capability** → **Push Notifications** ← *bez tohto push nikdy nepríde*
2. **General** → **Minimum Deployments** nechať na tom, čo predvyplnil Capacitor (iOS 14+)
3. Ikona: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` je zatiaľ
   **default Capacitor logo**. Treba ho nahradiť **1024×1024 PNG bez priehľadnosti**
   (`public/favicon.png` má len 512×512 a je to v skutočnosti JPEG, takže sa nedá použiť).
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

1. Xcode → **Product → Archive** → **Distribute App** → **App Store Connect**
2. V App Store Connect vytvoriť appku s bundle ID `sk.tendrik.app`
3. Vyplniť privacy policy URL (`https://tendrik.sk/ochrana-osobnych-udajov`)

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
