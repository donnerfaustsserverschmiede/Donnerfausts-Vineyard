import asyncio
import logging
import os
from typing import Any

import aiohttp
import discord
from discord.ext import commands, tasks

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("hausbutler-preisliste")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
PRICE_CHANNEL_ID = int(os.getenv("DISCORD_PRICE_CHANNEL_ID", "0") or "0")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
POLL_SECONDS = max(30, int(os.getenv("PRICE_SYNC_SECONDS", "60")))
CATEGORY_PRODUCTS = os.getenv("PRODUCT_CATEGORY", "Produkte")
BRAND = os.getenv("PRICE_LIST_TITLE", "DONNERFAUST SALOON")
MARKER_PREFIX = "DFSALON_PREISLISTE_SYNC"

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)


def required_settings() -> list[str]:
    missing = []
    if not DISCORD_TOKEN:
        missing.append("DISCORD_TOKEN")
    if not PRICE_CHANNEL_ID:
        missing.append("DISCORD_PRICE_CHANNEL_ID")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    return missing


async def fetch_products(session: aiohttp.ClientSession) -> list[dict[str, Any]]:
    url = f"{SUPABASE_URL}/rest/v1/vineyard_inventory"
    params = {
        "select": "id,item_name,category,sale_price,is_available",
        "category": f"eq.{CATEGORY_PRODUCTS}",
        "order": "item_name.asc",
    }
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }
    async with session.get(url, params=params, headers=headers) as response:
        body = await response.text()
        if response.status >= 400:
            raise RuntimeError(f"Supabase returned HTTP {response.status}: {body[:400]}")
        rows = await response.json()
    return [
        row for row in rows
        if row.get("is_available") is not False
        and row.get("sale_price") is not None
        and str(row.get("item_name", "")).strip()
    ]


def format_price(value: Any) -> str:
    amount = float(value)
    # Keep the app's numeric price as the source of truth; display German decimal formatting.
    return f"$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_messages(products: list[dict[str, Any]]) -> list[str]:
    header = f"🍷 **{BRAND}**\n**Aktuelle Preisliste**\n"
    if not products:
        return [f"{header}\nDerzeit sind keine verfügbaren Produkte gelistet.\n\n-# Automatisch mit dem Lager synchronisiert · {MARKER_PREFIX}:1"]
    lines = [f"• **{str(p['item_name']).strip()}**: {format_price(p['sale_price'])}" for p in products]
    # Stay safely below Discord's 2,000-character message limit, with room for marker/footer.
    chunks: list[list[str]] = [[]]
    for line in lines:
        candidate = "\n".join(chunks[-1] + [line])
        if len(header) + len(candidate) + 130 > 1850 and chunks[-1]:
            chunks.append([])
        chunks[-1].append(line)
    # User requested one or two messages; split oversized catalogs into two balanced groups.
    if len(chunks) > 2:
        flattened = [line for chunk in chunks for line in chunk]
        midpoint = (len(flattened) + 1) // 2
        chunks = [flattened[:midpoint], flattened[midpoint:]]
    messages = []
    total = len(chunks)
    for index, chunk in enumerate(chunks, start=1):
        footer = f"\n\n-# Preise aus dem Lager · automatisch aktualisiert · {MARKER_PREFIX}:{index}"
        if total == 2:
            section = "Weine & Produkte" if index == 1 else "Weitere Produkte"
            content = f"{header}*{section}*\n" + "\n".join(chunk) + footer
        else:
            content = header + "\n".join(chunk) + footer
        if len(content) > 1990:
            raise RuntimeError("Preisliste überschreitet das Discord-Nachrichtenlimit. Bitte Artikelnamen kürzen.")
        messages.append(content)
    return messages


async def sync_price_list() -> None:
    if not PRICE_CHANNEL_ID:
        raise RuntimeError("DISCORD_PRICE_CHANNEL_ID fehlt.")
    channel = bot.get_channel(PRICE_CHANNEL_ID)
    if channel is None:
        channel = await bot.fetch_channel(PRICE_CHANNEL_ID)
    if not hasattr(channel, "history") or not hasattr(channel, "send"):
        raise RuntimeError("Die konfigurierte Discord-ID ist kein Textkanal.")
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        products = await fetch_products(session)
    desired = build_messages(products)
    bot_user = bot.user
    existing: dict[int, discord.Message] = {}
    async for message in channel.history(limit=100):
        if bot_user and message.author.id == bot_user.id:
            for index in (1, 2):
                if f"{MARKER_PREFIX}:{index}" in message.content:
                    existing[index] = message
    for index, content in enumerate(desired, start=1):
        if index in existing:
            if existing[index].content != content:
                await existing[index].edit(content=content, allowed_mentions=discord.AllowedMentions.none())
                log.info("Preisliste-Nachricht %s aktualisiert.", index)
        else:
            await channel.send(content, allowed_mentions=discord.AllowedMentions.none())
            log.info("Preisliste-Nachricht %s erstellt.", index)
    for index, message in existing.items():
        if index > len(desired):
            await message.delete()
            log.info("Überzählige Preisliste-Nachricht %s entfernt.", index)


@tasks.loop(seconds=POLL_SECONDS)
async def periodic_sync() -> None:
    try:
        await sync_price_list()
    except Exception:
        log.exception("Synchronisierung der Discord-Preisliste fehlgeschlagen.")


@periodic_sync.before_loop
async def before_periodic_sync() -> None:
    await bot.wait_until_ready()


@bot.event
async def on_ready() -> None:
    log.info("Hausbutler Steven angemeldet als %s.", bot.user)
    if not periodic_sync.is_running():
        periodic_sync.start()


@bot.event
async def on_resumed() -> None:
    log.info("Discord-Verbindung wiederhergestellt.")


async def main() -> None:
    missing = required_settings()
    if missing:
        raise RuntimeError("Fehlende Render-Umgebungsvariablen: " + ", ".join(missing))
    async with bot:
        await bot.start(DISCORD_TOKEN)


if __name__ == "__main__":
    asyncio.run(main())
