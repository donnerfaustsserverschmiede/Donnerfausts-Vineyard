# Hausbutler Steven – Discord-Preisliste

Synchronisiert Produktpreise aus `public.vineyard_inventory` nach `#💳preisliste` und Bestellungen aus `public.vineyard_orders` nach `#bestellung`. Vorhandene Bot-Nachrichten werden aktualisiert, damit Status- und Mitarbeiteränderungen sichtbar bleiben.

## Regeln
- Nur Kategorie `Produkte`.
- `is_available = false`: Produkt wird nicht angezeigt.
- `is_available = true` oder NULL: Produkt mit Verkaufspreis wird angezeigt.
- Preisquelle ist `sale_price`; standardmäßig Abgleich alle 60 Sekunden.
- Höchstens zwei Preisliste-Nachrichten.
- Im Bestellkanal wird pro Bestellung eine Nachricht mit Nummer, Kunde, Datum/Uhrzeit, Positionen, Mitarbeiter und Status erstellt.
- Bei Annahme durch einen Mitarbeiter werden Mitarbeitername und Status in derselben Nachricht aktualisiert.
- Abgleich standardmäßig alle 60 Sekunden.

## Render Background Worker
- Root Directory: `discord-bot`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python bot.py`
- Runtime: Python

## Render-Umgebungsvariablen
- `DISCORD_TOKEN`: Bot-Token von Hausbutler Steven
- `DISCORD_PRICE_CHANNEL_ID`: numerische ID von `#💳preisliste`
- `DISCORD_ORDER_CHANNEL_ID`: numerische ID von `#bestellung` (Standard: `1563129597032403035`)
- `SUPABASE_URL`: Projekt-URL, z. B. `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Nur als geheimes Render-Environment-Variable eintragen, niemals in GitHub oder Website-Code.
- Optional: `PRICE_SYNC_SECONDS=60`, `PRODUCT_CATEGORY=Produkte`, `PRICE_LIST_TITLE=DONNERFAUST SALOON`

## Discord-Berechtigungen
Der Bot braucht im Zielkanal mindestens **Kanal ansehen**, **Nachrichten senden**, **Nachrichtenverlauf ansehen** und **Nachrichten verwalten**. Message Content Intent ist für diese Funktion nicht erforderlich.

## Sicherheit
Der Service-Role-Key gewährt weitreichenden Datenbankzugriff und darf niemals öffentlich geteilt werden.
