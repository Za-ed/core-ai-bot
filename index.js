import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

// ===== إعداد المتغيرات من .env =====
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_CHANNEL_ID = process.env.AI_CHANNEL_ID;

// طباعة للتأكد أن الكي موجود (اختياري، تقدر تشيله بعد ما يشتغل)
console.log(
  "GEMINI_API_KEY prefix:",
  GEMINI_API_KEY?.slice(0, 8),
  "length:",
  GEMINI_API_KEY?.length
);

// ===== إعدادات سلوك البوت =====
const DELETE_AFTER_MS = 5000;      // بعد كم يحذف رسالة العضو من القناة (5 ثواني)
const COOLDOWN_MS = 8000;         // 8 ثواني بين كل سؤال لنفس الشخص
const SESSION_TIMEOUT_MS = 60000; // دقيقة بدون تفاعل يمسح الكونتكست

// سياق المحادثة لكل مستخدم (زي شات جي بي تي)
const conversationHistory = new Map(); // userId => [{ role, content }, ...]

// Rate limit لكل مستخدم
const lastUsage = new Map();      // userId => timestamp

// آخر نشاط لكل مستخدم (عشان نمسح الكونتكست بعد وقت)
const lastActivity = new Map();   // userId => timestamp

// كلمات ممنوعة
const bannedWords = ["badword1", "كلمة_ممنوعة", "fuck"];

// ===== دالة تجيب سياق المستخدم مع تقليصه لو صار طويل =====
function getUserHistory(userId) {
  const MAX_PAIRS = 10; // 10 أسئلة + 10 أجوبة
  let history = conversationHistory.get(userId) || [];
  if (history.length > MAX_PAIRS * 2) {
    history = history.slice(-MAX_PAIRS * 2);
  }
  conversationHistory.set(userId, history);
  return history;
}

// ===== دالة تطلب رد من Gemini =====
async function askGemini(userId, userMsg) {
  const history = getUserHistory(userId);

  // systemInstruction لتعريف شخصية البوت
  const systemInstruction = {
    parts: [
      {
        text:
          "You are ChatGPT, a large language model, running inside a private Discord bot. " +
          "Respond in Arabic by default unless the user writes in another language. " +
          "Be friendly, concise, and keep conversation context per user."
      }
    ]
  };

  // تحويل سياقنا لصيغة Gemini (contents)
  const contents = [];

  for (const msg of history) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    });
  }

  // آخر رسالة من المستخدم
  contents.push({
    role: "user",
    parts: [{ text: userMsg }]
  });

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents,
    systemInstruction
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log("Gemini API Response:", JSON.stringify(data, null, 2));

  const replyText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
    "⚠️ ما قدرت أطلع رد من Gemini، جرّب بعد شوي.";

  // حفظ في الكونتكست
  history.push({ role: "user", content: userMsg });
  history.push({ role: "assistant", content: replyText });
  conversationHistory.set(userId, history);

  return replyText;
}

// ===== إنشاء Discord Client =====
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

  // السماح فقط لقناة AI المحددة
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
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
    setTimeout(() => message.delete().catch(() => {}), DELETE_AFTER_MS);
    return;
  }

  const now = Date.now();

  // ⏳ Rate limit لكل مستخدم
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

  // 🧠 Session timeout – لو مر أكثر من دقيقة، نمسح الكونتكست القديم
  const lastAct = lastActivity.get(userId) || 0;
  if (now - lastAct > SESSION_TIMEOUT_MS) {
    conversationHistory.delete(userId);
  }
  lastActivity.set(userId, now);

  // نحاول نفتح DM مع المستخدم
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

  try {
    const replyText = await askGemini(userId, userMsg);

    // نرسل الرد على الخاص فقط (خصوصية)
    await dmChannel.send(`🤖 **Core AI Bot (Gemini)**\n${replyText}`);

    // نضيف رياكشن تأكيد على رسالة العضو
    message.react("✅").catch(() => {});

    // نحذف رسالة العضو من القناة بعد 5 ثواني
    setTimeout(() => {
      message.delete().catch(() => {});
    }, DELETE_AFTER_MS);
  } catch (err) {
    console.error("❌ Error while talking to Gemini:", err);
    const warn = await message.reply(
      `❌ <@${userId}> صار خطأ أثناء الاتصال بـ Gemini، جرّب بعد شوي.`
    );
    setTimeout(() => warn.delete().catch(() => {}), DELETE_AFTER_MS);
  }
});

// ===== تشغيل البوت =====
client.login(DISCORD_TOKEN);

// ===== Keep-alive server لـ Railway =====
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Core AI Bot with Gemini is running ✅");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Keep-alive server active on port ${PORT}`);
});
