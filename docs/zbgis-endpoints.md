# ZBGIS endpointy – čo ešte treba doplniť

> **Stav: nedopísané.** Tento súbor v repozitári chýbal, keď vznikal modul
> Kataster, takže presné cesty ani tvar odpovedí ZBGIS nie sú overené.
> Klient `src/server/kataster/zbgis.ts` je preto postavený tak, že adresy sú
> šablóny v env premenných a odpovede prechádzajú tolerantným normalizérom.
> Keď sa doplní dokumentácia, stačí prepísať `.env` a prípadne mapovanie polí
> vo funkciách `fetchParcelsInKu` / `fetchLvDetail` – throttling, retry,
> timeout ani zvyšok modulu sa meniť nemusia.

## Premenné prostredia

| Premenná | Povinná | Význam |
| --- | --- | --- |
| `ZBGIS_PARCELS_URL` | áno | Šablóna zoznamu parciel v k.ú. Zástupné znaky: `{ku_code}`, `{register}` (`C`/`E`), voliteľne `{offset}`, `{limit}`, `{page}`. Keď šablóna obsahuje `{offset}`, klient stránkuje sám. |
| `ZBGIS_LV_DETAIL_URL` | áno | Šablóna detailu LV pre parcelu. Zástupný znak: `{parcel_id}`. |
| `ZBGIS_USER_AGENT` | nie | Hlavička `User-Agent` (default `TendrikBot (+https://tendrik.sk)`). |
| `ZBGIS_REFERER` | nie | Hlavička `Referer` (default `https://zbgis.skgeodesy.sk/`). |
| `ZBGIS_GEOMETRY_CRS` | nie | `wgs84` \| `mercator` \| `none` – použije sa len vtedy, keď odpoveď neuvádza `wkid` (default `mercator`). |
| `ZBGIS_REQ_DELAY_MS` | nie | Rozostup medzi requestmi, default `1000` (max 1 req/s). |
| `ZBGIS_TIMEOUT_MS` | nie | Timeout jedného requestu, default `15000`. |
| `ZBGIS_MAX_RETRIES` | nie | Počet opakovaní po chybe, default `3` (exponenciálny backoff). |
| `ZBGIS_PAGE_SIZE` | nie | Veľkosť stránky pri stránkovaní, default `500`. |
| `ZBGIS_MAX_PAGES` | nie | Poistka proti nekonečnému stránkovaniu, default `200`. |
| `VITE_ZBGIS_PARCEL_URL` | nie | Šablóna odkazu do mapy pre stránku `/kataster`. Zástupné znaky `{register}`, `{ku_code}`, `{parcel_number}`. |

## Čo klient z odpovede číta

Normalizér berie kľúče case-insensitive a ignoruje podčiarkovníky, takže
`cisloParcely`, `cislo_parcely` aj `CISLOPARCELY` sú to isté. Rozbalí aj
ArcGIS obal `features[].attributes` / `properties`.

**Zoznam parciel** – hľadá:

- číslo parcely: `parcel_number`, `cislo_parcely`, `cislo`, `parcela`, `number`
- identifikátor: `parcel_id`, `objectid`, `id`, `id_parcely`, `guid`
- ťažisko: `geometry.x` / `geometry.y` (podľa `spatialReference.wkid`), alebo `lat` / `lng`

**Detail LV** – hľadá:

- LV: `lv_number`, `cislo_lv`, `lv`, `cislo_listu_vlastnictva`
- výmera: `area_m2`, `vymera`, `vymera_m2`, `area`
- druh pozemku: `land_type`, `druh_pozemku`, `druh`, `kultura`, `sposob_vyuzitia`
- vlastníci: pole pod `vlastnici` / `owners` / `subjekty`, správcovia pod `spravcovia` / `sprava`
  - v položke: meno (`nazov`, `meno`, `name`, `priezvisko`), podiel (`podiel`, `share`),
    identifikátor (`ico`, `rodne_cislo`, `identifikator`), rola (`typ`, `vztah`, `role`)

## Otvorené otázky

- [ ] Presné cesty pre register C a register E (jeden endpoint s parametrom, alebo dva rôzne?).
- [ ] Ako sa stránkuje zoznam parciel – `offset`/`limit`, `page`, alebo `resultOffset`/`resultRecordCount`?
- [ ] V akom CRS chodí geometria (S-JTSK 5514 by chcel poriadnu transformáciu, tú klient zatiaľ nerobí a vráti `null`).
- [ ] Aké limity ZBGIS reálne má – či 1 req/s stačí, alebo treba ísť pomalšie.
- [ ] Či detail LV vracia správcov v samostatnom poli, alebo len ako rolu vo vlastníkoch.

Kým `ZBGIS_PARCELS_URL` a `ZBGIS_LV_DETAIL_URL` nie sú nastavené, endpoint
`/api/public/hooks/sync-kataster` beh korektne ukončí so stavom `failed`
a chybovou hláškou, ktorá premennú pomenuje.
