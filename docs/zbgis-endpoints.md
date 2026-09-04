# ZBGIS / ESKN endpointy – čo je overené a čo je zavreté

> Zisťované 4. 9. 2026 sledovaním sieťovej komunikácie samotnej appky ZBGIS
> (headless Chromium). Pôvodná dokumentácia k modulu Kataster chýbala, toto je
> náhrada za ňu.

## Zhrnutie: full sync sa cez verejné rozhrania ZBGIS spraviť nedá

Parcely v katastrálnom území sa **nedajú vymenovať** a **vlastníci sa nedajú
stiahnuť**. Obe cesty sú zámerne zavreté:

- `/query` na vrstvách ESKN vracia zo servera **HTTP 403** (F5 WAF). Pritom
  presne to by hromadný sync potreboval.
- Detail listu vlastníctva s vlastníkmi je za **reCAPTCHA „Nie som robot"**.
- OData `PortalODataPublic` vracia zo servera **HTTP 401**; v prehliadači
  prejde vďaka cookie, ktorú nastaví WAF.

Obísť to by znamenalo lámať bot ochranu a captchu, a pri vlastníkoch ide
navyše o osobné údaje fyzických osôb (vrátane rodných čísel). Tadiaľ cesta
nevedie – legálne varianty sú nižšie.

## Čo zo servera funguje

| Endpoint | Stav | Čo vráti |
| --- | --- | --- |
| `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer` | 200 | Vrstvy registra C. `[9] Plocha parcely C` je tá dátová. |
| `https://kataster.skgeodesy.sk/eskn/rest/services/VRM/uo/MapServer` | 200 | Register E. `[2] Plocha parcely E`. |
| `.../VRM/kn/MapServer/9?f=json` (a iné metadáta vrstiev) | 200 | Schéma polí. |
| `.../VRM/identify/MapServer/identify?geometry={x,y}&...` | 200 | **Atribúty parcely v danom bode** – funguje aj zo servera. |
| `https://services5.arcgis.com/xLgsg0kCC5lIjsBX/arcgis/rest/services/KATUZ/FeatureServer/0` | 200 | Číselník k.ú. ÚGKK (3 559 záznamov, `IDN5`/`NM5`/`NM3`/`NM2`). Odtiaľto je naplnená `ku_list`. |

Nutné hlavičky: `User-Agent` bežného prehliadača a `Referer: https://zbgis.skgeodesy.sk/`.
Bez nich vracia WAF 403 na všetko.

### Čo `identify` vráti

```
ID, PARCEL_NUMBER, CADASTRAL_UNIT_ID, MUNICIPALITY_ID, DISTRICT_ID, REGION_ID,
DESCRIPTIVE_AREA_OF_PARCEL (výmera SPI v m2), GEODETIC_AREA_OF_PARCEL,
FOLIO_ID (interné ID listu vlastníctva), NATURE_OF_LAND_USE_ID (druh pozemku),
PLOT_UTILISATION_ID, PROPERTY_AFFILIATION_ID, PARCEL_STATUS_ID, geometry (WGS84)
```

**Vlastníci tam nie sú.** Aj `CADASTRAL_UNIT_ID` a `FOLIO_ID` sú interné ESKN
identifikátory – na kód k.ú. a číslo LV ich prekladá až OData
(`CadastralUnits?$filter=Id eq …&$select=Code`, `Folios(…)?$select=No`), ktoré
je zo servera zavreté.

Prakticky to znamená: **bodový dopyt na konkrétnu parcelu ide, hromadné
sťahovanie nie.**

## Čo je už naplnené zo SPF (medzikrok)

SPF zverejňuje **Zoznam nezistených vlastníkov** — 7 CSV súborov, aktualizované
dvakrát ročne, k 30. 6. 2026 spolu 4 951 162 riadkov. Sú to listy vlastníctva,
na ktorých SPF zo zákona spravuje podiely nezistených vlastníkov, čiže pokrýva
to rolu **správca** (nie vlastník — štátna pôda v tom nie je).

Stĺpec „PORADOVÉ ČÍSLO" je priamo kód k.ú. podľa ÚGKK, takže sa napojí na
`ku_list` bez mapovania (overené: 0 nesparovaných riadkov).

Naimportované do `spf_folios` cez `scripts/import-spf-folios.ts`:
**1 094 661 listov vlastníctva v 3 520 k.ú.** Súbory si skript nájde sám cez
WordPress media API na pozfond.sk, takže pri ďalšom vydaní stačí spustiť ho
znova. Zobrazuje sa v záložke „SPF – listy vlastníctva" na `/kataster`.

Zámerne sa **neukladajú mená vlastníkov**, len ich počet na LV: na hľadanie
pozemkov v správe SPF netreba a kopírovať si do vlastnej databázy 5 miliónov
mien fyzických osôb nie je žiaduce. Mená ostávajú v zdrojovom CSV.

Obmedzenie: je to úroveň LV, **nie parcely**. Rozvinúť LV na parcely by
vyžadovalo mapovanie parcela↔LV z katastra, teda ten `/query`, ktorý vracia 403.
Parcelnú úroveň doplnia až hromadné dáta z ÚGKK.

Čo od SPF použiteľné **nie je**: „Zoznam pozemkov na prenájom" (mal by parcelné
čísla, ale SPF ho momentálne nezverejňuje a archívne stránky neobsahujú súbory)
a klientsky portál `kp.pozfond.sk` (Keycloak + prihlásenie cez slovensko.sk eID,
elektronické služby, nie dátový zdroj).

## Legálne cesty k dátam, ktoré modul potrebuje

1. **Poskytovanie údajov z katastra (ÚGKK / GKÚ)** – SPI/VGI export po
   katastrálnych územiach vrátane vlastníckych vzťahov, na zmluvu a licenciu.
   Toto je štandardná cesta presne pre takýto účel.
2. **Účet v ESKN** – appka má registráciu aj prihlásenie
   (`esknConfig.registrationUrl`); prihlásený režim môže mať iné limity.
3. **Vlastné zoznamy SPF** – keď je cieľom len pozemky SPF, ich vlastný
   register býva rýchlejšia cesta než celý kataster.

Modul je na ktorúkoľvek z nich pripravený: `src/server/kataster/zbgis.ts` má
adresy v env premenných a tolerantný normalizér odpovedí, takže sa mení
konfigurácia, nie kód.

## Premenné prostredia

| Premenná | Povinná | Význam |
| --- | --- | --- |
| `ZBGIS_PARCELS_URL` | áno | Šablóna zoznamu parciel v k.ú. Zástupné znaky: `{ku_code}`, `{register}`, voliteľne `{offset}`, `{limit}`, `{page}`. Keď obsahuje `{offset}`, klient stránkuje sám. |
| `ZBGIS_LV_DETAIL_URL` | áno | Šablóna detailu LV pre parcelu. Zástupný znak: `{parcel_id}`. |
| `ZBGIS_USER_AGENT` | nie | Default `TendrikBot (+https://tendrik.sk)`. Na ESKN treba UA prehliadača. |
| `ZBGIS_REFERER` | nie | Default `https://zbgis.skgeodesy.sk/`. |
| `ZBGIS_GEOMETRY_CRS` | nie | `wgs84` \| `mercator` \| `none`, použije sa len keď odpoveď neuvádza `wkid`. ESKN `identify` vracia WGS84 (`wkid` 4326), ArcGIS `KATUZ` S-JTSK (5514). |
| `ZBGIS_REQ_DELAY_MS` | nie | Default `1000` (max 1 req/s). |
| `ZBGIS_TIMEOUT_MS` | nie | Default `15000`. |
| `ZBGIS_MAX_RETRIES` | nie | Default `3`, exponenciálny backoff. |
| `ZBGIS_PAGE_SIZE` | nie | Default `500`. |
| `ZBGIS_MAX_PAGES` | nie | Default `200`. |
| `VITE_ZBGIS_PARCEL_URL` | nie | Odkaz do mapy pre `/kataster`. Zástupné znaky `{lat}`, `{lng}`, `{register}`, `{ku_code}`, `{parcel_number}`. |

Deep-link do mapy je overený: klient beží na `/mapka/` (staré `/mkzbgis/` len
redirectuje) a detail parcely otvára **bodová identifikácia**, nie parcelné
číslo:

```
https://zbgis.skgeodesy.sk/mapka/sk/kataster/identification/point/{lat},{lng}?pos={lat},{lng},19
```

## Čo číta normalizér

Kľúče berie case-insensitive a ignoruje podčiarkovníky, takže `cisloParcely`,
`cislo_parcely` aj `CISLOPARCELY` sú to isté. Rozbalí ArcGIS obal
`features[].attributes` / `properties`.

- **Zoznam parciel**: číslo (`parcel_number`, `cislo_parcely`, `cislo`, `parcela`),
  identifikátor (`parcel_id`, `objectid`, `id`, `guid`),
  ťažisko (`geometry.x`/`y` podľa `spatialReference.wkid`, alebo `lat`/`lng`)
- **Detail LV**: LV (`lv_number`, `cislo_lv`, `lv`), výmera (`area_m2`, `vymera`),
  druh pozemku (`land_type`, `druh_pozemku`, `kultura`), vlastníci pod
  `vlastnici`/`owners`/`subjekty`, správcovia pod `spravcovia`/`sprava`;
  v položke meno (`nazov`, `meno`, `priezvisko`), podiel (`podiel`, `share`),
  identifikátor (`ico`, `rodne_cislo`), rola (`typ`, `vztah`, `role`)

Kým `ZBGIS_PARCELS_URL` a `ZBGIS_LV_DETAIL_URL` nie sú nastavené, endpoint
`/api/public/hooks/sync-kataster` beh korektne ukončí so stavom `failed`
a chybovou hláškou, ktorá premennú pomenuje.
