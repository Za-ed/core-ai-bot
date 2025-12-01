import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

// نستخدم fetch المدمج في Node
const fetch = globalThis.fetch;

// قناة الـ AI المسموح فيها فقط
const ALLOWED_CHANNEL_ID = process.env.AI_CHANNEL_ID;

// تخزين سياق المحادثة لكل مستخدم
// userId => [{ role, content }, ...]
const conversationHistory = new Map();

// تخزين آخر وقت طلب لكل مستخدم (لـ rate limit)
const lastUsage = new Map();
const COOLDOWN_MS = 8000; // 8 ثواني بين كل طلب وطلب

// كلمات ممنوعة (عدّلها زي ما بدك)
const bannedWords = [
  "كلمة_ممنوعة1",
  "كلمة_ممنوعة2",
  "badword"
];

// دالة تجيب آخر سياق للمستخدم (نقصّ التاريخ لآخر N رسائل)
function getUserHistory(userId) {
  const MAX_PAIRS = 5; // كم سؤال/جواب نحفظ
  let history = conversationHistory.get(userId) || [];
  if (history.length > MAX_PAIRS * 2) {
    history = history.slice(-MAX_PAIRS * 2);
  }
  conversationHistory.set(userId, history);
  return history;
}

// ====== Discord Client ======
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

// ====== التعامل مع الرسائل العادية ======
client.on("messageCreate", async (message) => {
  // تجاهل البوتات
  if (message.author.bot) return;

  // لازم يكون في القناة المسموحة فقط
  if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

  const userId = message.author.id;
  const userMsg = message.content?.trim();
  if (!userMsg) return;

  // ✅ فلتر الكلمات الممنوعة
  const lower = userMsg.toLowerCase();
  if (bannedWords.some((w) => lower.includes(w.toLowerCase()))) {
    return message.reply({
      content: `⚠️ <@${userId}> بعض الكلمات في رسالتك غير مسموح فيها، حاول تعيد صياغة سؤالك 😊`
    });
  }

  // ✅ Rate limit لكل عضو
  const now = Date.now();
  const lastTime = lastUsage.get(userId) || 0;
  if (now - lastTime < COOLDOWN_MS) {
    const seconds = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
    return message.reply({
      content: `⏳ <@${userId}> استنى شوي قبل ما تسأل مرة ثانية (حوالي ${seconds} ثانية).`
    });
  }
  lastUsage.set(userId, now);

  // إظهار أنه يكتب
  message.channel.sendTyping();

  // جلب سياق المستخدم
  const history = getUserHistory(userId);

  // تجهيز الرسائل للـ OpenRouter
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful, friendly Arabic-speaking assistant inside a private Discord server. Answer clearly, briefly, and keep context per user."
    },
    ...history,
    { role: "user", content: userMsg }
  ];

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

    const reply =
      data.choices?.[0]?.message?.content ||
      "⚠️ ما قدرت أطلع رد من الموديل، جرّب مرة ثانية.";

    // ✅ نحفظ السؤال والجواب في السياق
    history.push({ role: "user", content: userMsg });
    history.push({ role: "assistant", content: reply });
    conversationHistory.set(userId, history);

    // ✅ نرد بمنشن
    await message.reply({
      content: `<@${userId}> 🤖\n${reply}`
    });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    message.reply("❌ صار خطأ أثناء الاتصال بالذكاء الاصطناعي، جرّب بعد شوي.");
  }
});

// ====== تشغيل البوت ======
client.login(process.env.DISCORD_TOKEN);

// ====== HTTP Keep-Alive Server for Railway ======
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Core AI Bot is running ✅");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});
