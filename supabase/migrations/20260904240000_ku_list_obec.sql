-- Do číselníka k.ú. dopĺňame názov obce.
--
-- Bez neho sa nedalo nájsť katastrálne územie podľa mesta: kto hľadal
-- "Vysoké Tatry", nenašiel nič, lebo tamojšie k.ú. sa volajú Tatranská
-- Lomnica či Štrbské Pleso a okres je Poprad. ÚGKK obec vo svojom číselníku
-- má (pole NM4), len sme ju pri prvom importe nebrali.

alter table public.ku_list add column if not exists obec text;
