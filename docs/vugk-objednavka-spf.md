# Objednávka údajov ISKN z VÚGK – parcely SPF

Podklad pre získanie parcelných dát do modulu Kataster (tabuľka `cadastral_parcels`).
ZBGIS hromadné sťahovanie blokuje; jediná legálna cesta k parcelám s vlastníkmi je
objednávka vybraných údajov z ISKN cez **VÚGK** (Výskumný ústav geodézie a kartografie).

## Ako to funguje (zistené 4. 9. 2026)

- Objednáva sa e-mailom na **objednavky.vugk@skgeodesy.sk** (formuláre aj cez
  katasterportál → *Objednávky pre zmluvné subjekty*, ale e-mail je jednoduchší).
- Dva typy:
  - **A** – celé katastrálne územia (cena podľa cenníka za k.ú.).
  - **B** – špecializovaný výber podľa vlastnej špecifikácie (cena individuálna).
    → pre náš prípad („len parcely SPF") je relevantné **B**.
- **SPI** (popisné info: vlastníci, LV, parcely) sa poskytuje vo formáte **FPU alebo
  DBF, bez rodných čísel a bez cien nehnuteľností** – takže žiadny GDPR problém
  s rodnými číslami.
- **SGI** (geometria) vo formáte **VGI** (VKM + VMUO).
- Aktualizované denne. Riadi sa Obchodnými a licenčnými podmienkami VÚGK (OLP).

Cenník typu A (za 1 k.ú., bez DPH): SPI 9 / 80 / 160 / 200 / 250 € podľa kategórie;
VKM aj VMUO 9 / 45 / 55 / 65 / 75 €. Celé Slovensko (3 532 k.ú.) by pri SPI vyšlo
~518 000 €, preto celú SR nekupovať – zmysel má buď výber B, alebo cielene pár k.ú.

---

## Text dopytu na naceniť (kópia do e-mailu)

**Komu:** objednavky.vugk@skgeodesy.sk
**Predmet:** Dopyt na nacenenie – špecializovaný výber z ISKN (objednávka typu B)

Dobrý deň,

rád by som si nechal naceniť **špecializovaný výber vybraných údajov z ISKN
(objednávka typu „B")** s nasledujúcou špecifikáciou:

- **Predmet výberu:** všetky parcely (register C aj E), na ktorých je ako
  vlastník alebo správca vedený **Slovenský pozemkový fond** (SPF).
- **Rozsah:** celé územie Slovenskej republiky.
  (Ak je to cenovo alebo technicky výhodnejšie, viem rozsah zúžiť na jednotlivé
  kraje alebo okresy – prosím o odporúčanie.)
- **Údaje SPI:** identifikácia parcely (k. ú., register, číslo parcely, LV,
  výmera, druh pozemku) a údaj o vlastníkovi/správcovi v rozsahu, že ide o SPF
  vč. veľkosti podielu. Bez rodných čísel a bez cien nehnuteľností.
- **Formát:** FPU alebo DBF (podľa toho, čo je pre tento výber štandard).
- **Geometria (SGI/VGI):** voliteľne, ak je dostupná k tomu istému výberu –
  prosím naceniť samostatne, nech sa viem rozhodnúť.

Prosím o informáciu:

1. či je takýto výber podľa vlastníka/správcu (SPF) technicky realizovateľný ako
   objednávka „B",
2. cenovú ponuku (a či sa cena počíta paušálne za výber alebo za k. ú.),
3. spôsob a formát dodania a periodicitu, ak by šlo o opakované aktualizácie.

Ďakujem pekne.

S pozdravom
[Meno Priezvisko]
[Firma, IČO]
[Adresa]
[Telefón] · info@tobify.sk

---

## Čo doplniť pred odoslaním

- `[Meno Priezvisko]`, `[Firma, IČO]`, `[Adresa]`, `[Telefón]` – identifikačné
  údaje objednávateľa (pri právnickej osobe aj IČO; formálnu objednávku aj tak
  potvrdzuješ podpisom/pečiatkou až po nacenení).
- Zvážiť, či rovno pýtať aj SGI/VGI (geometria pre mapu), alebo len SPI.

## Po dodaní

Štruktúra tabuľky `cadastral_parcels` je na FPU/DBF pripravená
(ku_code, parcel_register, parcel_number, lv_number, area_m2, land_type,
owners jsonb, has_spf…). Import FPU/DBF = ~deň práce, nový skript
`scripts/import-iskn-fpu.ts`. Prepojenie k. ú. cez `ku_list` (100 % pokrytie).
