import { Client, GatewayIntentBits } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// --------- إعداد Gemini ---------
const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  systemInstruction:
    "أنت بوت ديسكورد ذكي تساعد الأعضاء بالعربي، ردودك مختصرة وواضحة ومحترمة، وتتفادى الكلمات السيئة.",
});


async function askGemini(message) {
  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
    });

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "⚠️ صار خطأ أثناء التواصل مع الذكاء الاصطناعي.";
  }
}

// --------- إعداد Discord Bot ---------
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

// كلمات ممنوعة بسيطة (عدّلها زي ما بدك)
const bannedWords = ["كلمة_ممنوعة1", "كلمة_ممنوعة2"];

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // فلترة كلمات ممنوعة
  if (bannedWords.some((w) => msg.content.includes(w))) {
    try {
      await msg.delete();
    } catch (e) {
      console.error("Delete message error:", e);
    }
    return msg.channel.send(`⚠️ ${msg.author}, ممنوع استخدام هاي الكلمات.`);
  }

  const userMessage = msg.content;

  // استدعاء Gemini
  const reply = await askGemini(userMessage);

  // رد مع منشن
  try {
    await msg.reply({
      content: reply,
      allowedMentions: { repliedUser: true },
    });
  } catch (e) {
    console.error("Reply error:", e);
  }

  // حذف الرسالة الأصلية بعد 5 دقائق
  setTimeout(() => {
    msg
      .delete()
      .catch(() => {
        // ممكن ما يقدر يحذف (صلاحيات)، عادي تجاهل
      });
  }, 5 * 60 * 1000);
});

client.login(process.env.BOT_TOKEN);
