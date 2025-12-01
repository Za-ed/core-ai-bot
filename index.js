import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import http from "http"; // للسيرفر الصغير حق Railway
dotenv.config();

const fetch = globalThis.fetch;

// ====== Discord Client ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.on("ready", () => {
  console.log(`🔥 Logged in as ${client.user.tag}`);
});

// ====== Slash Command Handler (/ask) ======
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    const userMsg = interaction.options.getString("message");

    // نخلي الرد خاص (ephemeral)
    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://github.com/zaed/core-ai-bot", // أي رابط لمشروعك
          "X-Title": "core-ai-bot", // اسم التطبيق
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-70b-instruct",
          messages: [
            { role: "system", content: "You are a helpful, concise assistant inside a private Discord bot." },
            { role: "user", content: userMsg }
          ]
        })
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (!data?.choices) {
        return interaction.editReply({
          content: "⚠️ API Error: " + JSON.stringify(data.error || data)
        });
      }

      const reply = data.choices[0].message.content;
      await interaction.editReply(`🤖 **رد خاص:**\n${reply}`);

    } catch (err) {
      console.error("❌ Fetch Error:", err);
      await interaction.editReply("❌ صار خطأ أثناء الاتصال بالذكاء الاصطناعي.");
    }
  }
});

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
