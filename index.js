import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

// نستخدم fetch المدمج في Node 18+
const fetch = globalThis.fetch;

// ===== إعدادات عامة =====
const ALLOWED_CHANNEL_ID = process.env.AI_CHANNEL_ID; // القناة المسموحة
const DELETE_AFTER_MS = 5000;        // بعد كم يحذف رسالة العضو من القناة (5 ثواني)
const COOLDOWN_MS = 8000;           // بين كل سؤال والتاني لنفس الشخص
const SESSION_TIMEOUT_MS = 60000;   // بعد دقيقة بدون تفاعل يمسح الكونتكست

// سياق المحادثة لكل مستخدم (زي شات جي بي تي)
const conversationHistory = new Map(); // userId => [{role, content}, ...]

// Rate limit لكل مستخدم
const lastUsage = new Map();          // userId => timestamp

// آخر نشاط لكل مستخدم (للتايم آوت)
const lastActivity = new Map();       // userId => timestamp

// كلمات ممنوعة (عدلها براحتك)
const bannedWords = ["badword1", "كلمة_ممنوعة", "fuck"];

// دالة تجيب سياق المستخدم مع تحديد أقصى طول
function getUserHistory(userId) {
  const MAX_PAIRS = 10; // 10 أسئلة + 10 أجوبة = 20 رسالة
  let history = conversationHistory.get(userId) || [];
  if (history.length > MAX_PAIRS * 2) {
    history = history.slice(-MAX_PAIRS * 2);
  }
  conversationHistory.set(userId, history);
  return history;
}

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("ready", () => {
  console.log(`🔥 Logged in as ${client.user.tag}`);
});

// ===== التعامل مع الرسائل في القناة =====
client.on("messageCreate", async (message) => {
  // تجاهل البوتات
  if (message.author.bot) return;

  // السماح فقط لقناة معيّنة
  if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

  const userId = message.author.id;
  const userMsg = message.content?.trim();
  if (!userMsg) return;

  // 🔒 فلتر كلمات ممنوعة
  const lower = userMsg.toLowerCase();
  if (bannedWords.some((w) => lower.includes(w.toLowerCase()))) {
    const warn = await message.reply(
      `⚠️ <@${userId}> رسالتك فيها كلمات غير مسموحة، حاول تعيد صياغتها.`
    );
    // نحذف تحذير البوت + رسالة العضو بعد شوية
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    setTimeout(() => message.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }

  const now = Date.now();

  // ⏳ Rate Limit
  const lastTime = lastUsage.get(userId) || 0;
  if (now - lastTime < COOLDOWN_MS) {
    const seconds = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
    const warn = await message.reply(
      `⏳ <@${userId}> استنى ${seconds} ثانية قبل ما تبعت سؤال جديد.`
    );
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }
  lastUsage.set(userId, now);

  // 🧠 Session Timeout (مسح الكونتكست بعد دقيقة بدون تفاعل)
  const lastAct = lastActivity.get(userId) || 0;
  if (now - lastAct > SESSION_TIMEOUT_MS) {
    conversationHistory.delete(userId); // نبدأ محادثة جديدة
  }
  lastActivity.set(userId, now);

  // نحاول نرسل typing في الخاص (DM)
  let dmChannel;
  try {
    dmChannel = await message.author.createDM();
    dmChannel.sendTyping().catch(() => {});
  } catch (err) {
    console.error("❌ ما قدرت أفتح DM:", err);
    const warn = await message.reply(
      `❌ <@${userId}> ما قدرت أبعتلك على الخاص، تأكد إن الخاص مفتوح للبوت.`
    );
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }

  // 🧠 جلب سياق المستخدم (زي شات جي بي تي)
  const history = getUserHistory(userId);

  const messages = [
    {
      role: "system",
      content:
        "You are ChatGPT, a large language model, running inside a private Discord bot. " +
        "Respond in Arabic by default (unless the user uses another language). " +
        "Be helpful, friendly, clear, and keep track of each user's context separately."
    },
    ...history,
    { role: "user", content: userMsg }
  ];

  let replyText;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com/zaed/core-ai-bot",
        "X-Title": "core-ai-bot",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-70b-instruct",
        messages
      })
    });

    const data = await response.json();
    console.log("API Response:", data);

    replyText =
      data.choices?.[0]?.message?.content ||
      "⚠️ ما قدرت أطلع رد من الذكاء الاصطناعي، جرّب بعد شوي.";
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    replyText = "❌ صار خطأ أثناء الاتصال بالذكاء الاصطناعي، جرّب بعد شوي.";
  }

  // نحفظ السؤال والجواب في الكونتكست
  history.push({ role: "user", content: userMsg });
  history.push({ role: "assistant", content: replyText });
  conversationHistory.set(userId, history);

  // ✅ نبعث الرد على الخاص DM فقط
  try {
    await dmChannel.send(`🤖 **Core AI Bot**\n${replyText}`);
  } catch (err) {
    console.error("❌ Error sending DM:", err);
    const warn = await message.reply(
      `❌ <@${userId}> ما قدرت أبعتلك الرد على الخاص، تأكد إنك ما حاجب الرسائل من البوت.`
    );
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }

  // ✅ نعمل رياكشن على رسالة العضو عشان يفهم إن الرد وصله على الخاص
  message.react("✅").catch(() => {});

  // 🗑️ نحذف رسالة العضو من القناة بعد 5 ثواني (لتقليل اللي بشوفوها)
  setTimeout(() => {
    message.delete().catch(() => {});
  }, DELETE_AFTER_MS);
});

// تشغيل البوت
client.login(process.env.DISCORD_TOKEN);

// Keep-alive server ل Railway
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Core AI Bot is running ✅");
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive server active");
});
