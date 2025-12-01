console.log(
  "Loaded GEMINI_API_KEY prefix:",
  process.env.GEMINI_API_KEY?.slice(0, 8),
  "length:",
  process.env.GEMINI_API_KEY?.length
);




import { Client, GatewayIntentBits } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// -------------------- Gemini Setup --------------------

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  systemInstruction:
    "أنت بوت ديسكورد ذكي ترد بالعربي، ردودك محترمة، قصيرة وواضحة. تجنب الكلمات السيئة، وساعد المستخدمين.",
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
    return "⚠️ حدث خطأ أثناء التواصل مع الذكاء الاصطناعي.";
  }
}

// -------------------- Discord Bot Setup --------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const bannedWords = ["زب", "كس", "قحبة", "شرموط"]; // عدل كما تريد

client.on("ready", () => {
  console.log(`🔥 Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (bannedWords.some((w) => msg.content.includes(w))) {
    await msg.delete().catch(() => {});
    return msg.channel.send(
      `⚠️ ممنوع استخدام كلمات غير لائقة يا ${msg.author}.`
    );
  }

  const userMessage = msg.content;

  const reply = await askGemini(userMessage);

  await msg
    .reply({
      content: reply,
      allowedMentions: { repliedUser: true },
    })
    .catch(() => {});

  setTimeout(() => {
    msg.delete().catch(() => {});
  }, 5 * 60 * 1000);
});

client.login(process.env.BOT_TOKEN);
