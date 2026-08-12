-- Obnovenie práv na user_preferences.
--
-- Rola `authenticated` mala na tabuľke iba SELECT, takže ukladanie nastavení
-- (napr. zapnutie týždenného súhrnu grantov) padalo na
-- „permission denied for table user_preferences". Čítanie fungovalo, preto to
-- nebolo vidieť skôr — a `upsert` z klienta posiela INSERT ... ON CONFLICT,
-- čo si vyžiada INSERT právo aj vtedy, keď sa riadok reálne len updatuje.
--
-- Pôvodná migrácia 20260705192611 tieto práva prideľovala; na produkčnej
-- databáze chýbali. Toto ich vracia do pôvodného stavu.
--
-- Prístup k cudzím riadkom to neotvára — o ten sa stará RLS politika
-- „Users manage own preferences" (auth.uid() = user_id), ktorá ostáva.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
