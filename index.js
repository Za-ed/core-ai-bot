import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { askGemini } from "./ai.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`🔥 Logged in as ${client.user.tag}`);
});

// فلترة كلمات
const bannedWords = ["شتم", "كلمة_ممنوعة", "وسخ"]; // عدلهم

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // فلترة كلمات الممنوعة
  if (bannedWords.some((w) => msg.content.includes(w))) {
    await msg.delete();
    return msg.channel.send(`⚠️ ${msg.author}, ممنوع استخدام هذه الكلمات.`);
  }

  // الخصوصية – الرسالة ما تبين لغيره
  const userMessage = msg.content;
  const reply = await askGemini(userMessage);

  await msg.reply({
    content: reply,
    allowedMentions: { repliedUser: true }, // يعمل mention
  });

  // حذف الرسالة بعد 5 دقائق
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, 5 * 60 * 1000);
});

client.login(process.env.BOT_TOKEN);
