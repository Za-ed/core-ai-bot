import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

// نستخدم fetch المدمج في Node
const fetch = globalThis.fetch;

// إعدادات أساسية
const ALLOWED_CHANNEL_ID = process.env.AI_CHANNEL_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DELETE_AFTER_MS = 5000;      // بعد كم يحذف رسالة العضو من القناة (5 ثواني)
const COOLDOWN_MS = 8000;         // 8 ثواني بين كل سؤال وسؤال لنفس الشخص
const SESSION_TIMEOUT_MS = 60000; // دقيقة بدون تفاعل يمسح الكونتكست

// سياق المحادثة (مثل ChatGPT) لكل مستخدم
// userId => [{ role: "user"|"assistant", content: "..." }, ...]
const conversationHistory = new Map();

// Rate limit
const lastUsage = new Map();    // userId => timestamp

// آخر نشاط لكل مستخدم
const lastActivity = new Map(); // userId => timestamp

// كلمات ممنوعة
const bannedWords = ["badword1", "كلمة_ممنوعة", "fuck"];

// دالة تجيب سياق المستخدم
function getUserHistory(userId) {
  const MAX_PAIRS = 10; // 10 أسئلة + 10 أجوبة
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
  if (message.author.bot) return;

  // قناة الـ AI فقط
  if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

  const userId = message.author.id;
  const userMsg = message.content?.trim();
  if (!userMsg) return;

  // فلتر كلمات ممنوعة
  const lower = userMsg.toLowerCase();
  if (bannedWords.some((w) => lower.includes(w.toLowerCase()))) {
    const warn = await message.reply(
      `⚠️ <@${userId}> رسالتك فيها كلمات غير مسموحة، حاول تعيد صياغتها.`
    );
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    setTimeout(() => message.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }

  const now = Date.now();

  // Rate limit
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

  // Session timeout (لو صارلك أكثر من دقيقة ساكت نمسح الكونتكست)
  const lastAct = lastActivity.get(userId) || 0;
  if (now - lastAct > SESSION_TIMEOUT_MS) {
    conversationHistory.delete(userId);
  }
  lastActivity.set(userId, now);

  // افتح DM مع المستخدم
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

  // جلب السياق
  const history = getUserHistory(userId);

  // تحويل سياقنا إلى صيغة Gemini (contents)
  const contents = [];

  // systemInstruction يعرّف شخصية البوت (زي ChatGPT)
  const systemInstruction = {
    parts: [
      {
        text:
          "You are ChatGPT, a large language model running inside a private Discord bot. " +
          "Respond in Arabic by default unless the user writes in another language. " +
          "Be friendly, concise, and keep conversation context per user."
      }
    ]
  };

  // نضيف التاريخ القديم
  for (const msg of history) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    });
  }

  // ونسجّل الرسالة الجديدة
  contents.push({
    role: "user",
    parts: [{ text: userMsg }]
  });

  let replyText;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        systemInstruction
      })
    });

    const data = await response.json();
    console.log("Gemini API Response:", data);

    replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ ما قدرت أطلع رد من Gemini، جرّب بعد شوي.";
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    replyText = "❌ صار خطأ أثناء الاتصال بـ Gemini API.";
  }

  // نحفظ السؤال والجواب في السياق
  history.push({ role: "user", content: userMsg });
  history.push({ role: "assistant", content: replyText });
  conversationHistory.set(userId, history);

  // نرسل الرد على الخاص فقط
  try {
    await dmChannel.send(`🤖 **Core AI Bot (Gemini)**\n${replyText}`);
  } catch (err) {
    console.error("❌ Error sending DM:", err);
  }

  // رياكشن تأكيد + حذف رسالة من القناة بعد 5 ثواني
  message.react("✅").catch(() => {});
  setTimeout(() => {
    message.delete().catch(() => {});
  }, DELETE_AFTER_MS);
});

// تشغيل البوت
client.login(process.env.DISCORD_TOKEN);

// Keep-alive server لـ Railway
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Core AI Bot with Gemini is running ✅");
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive server active");
});
