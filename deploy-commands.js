import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const commands = [
  {
    name: "ask",
    description: "اسأل أي سؤال وسيجيبك البوت برد خاص",
    options: [
      {
        name: "message",
        description: "سؤالك",
        type: 3,          // STRING
        required: true
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🚀 Deploying guild slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID, // Application ID
        process.env.GUILD_ID   // Server ID
      ),
      { body: commands }
    );
    console.log("✔️ Guild slash commands deployed!");
  } catch (err) {
    console.error("❌ Error deploying commands:", err);
  }
})();
