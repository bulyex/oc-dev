const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN environment variable not set');
  process.exit(1);
}

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('EchoBot готов к эхо!'));

bot.on('text', (ctx) => {
  // Simple echo bot: reply with the same text received
  ctx.reply(ctx.message.text);
});

bot.launch().then(() => {
  console.log('Telegram Echo Bot started');
}).catch((err) => {
  console.error('Bot failed to start', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
