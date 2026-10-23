# Hausbutler Steven – Discord-Preisliste

Synchronisiert Produktpreise aus der Supabase-Tabelle `public.vineyard_inventory` in den Discord-Kanal `#💳preisliste`. Der Bot bearbeitet vorhandene eigene Nachrichten, statt bei jedem Durchlauf neue zu posten.

## Regeln
- Nur Kategorie `Produkte`.
- `is_available = false`: Produkt wird nicht angezeigt.
- `is_available = true` oder NULL: Produkt mit Verkaufspreis wird angezeigt.
- Preisquelle ist `sale_price`; standardmäßig Abgleich alle 60 Sekunden.
- Höchstens zwei Preisliste-Nachrichten.
- Keine Slash-Befehle.

## Render Background Worker
- Root Directory: `discord-bot`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python bot.py`
- Runtime: Python

## Render-Umgebungsvariablen
- `DISCORD_TOKEN`: Bot-Token von Hausbutler Steven
- `DISCORD_PRICE_CHANNEL_ID`: numerische ID von `#💳preisliste`
- `SUPABASE_URL`: Projekt-URL, z. B. `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Nur als geheimes Render-Environment-Variable eintragen, niemals in GitHub oder Website-Code.
- Optional: `PRICE_SYNC_SECONDS=60`, `PRODUCT_CATEGORY=Produkte`, `PRICE_LIST_TITLE=DONNERFAUST SALOON`

## Discord-Berechtigungen
Der Bot braucht im Zielkanal mindestens **Kanal ansehen**, **Nachrichten senden**, **Nachrichtenverlauf ansehen** und **Nachrichten verwalten**. Message Content Intent ist für diese Funktion nicht erforderlich.

## Sicherheit
Der Service-Role-Key gewährt weitreichenden Datenbankzugriff und darf niemals öffentlich geteilt werden.
