import os
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
import httpx


load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
N8N_WEBHOOK = os.getenv("N8N_START_WEBHOOK", "http://localhost:5678/webhook/start-price-update")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Shop Control Bot: /price_update <feed_url>")


async def price_update(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: /price_update <feed_url>")
        return
    feed_url = context.args[0]
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(N8N_WEBHOOK, json={"feed_url": feed_url})
    if r.status_code < 300:
        await update.message.reply_text("Started price update")
    else:
        await update.message.reply_text(f"n8n error: {r.status_code}")


def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN missing")
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("price_update", price_update))
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()

