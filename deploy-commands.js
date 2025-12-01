import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const commands = [
  {
    name: "ask",
    description: "أسأل سؤال وسيجيبك البوت بشكل خاص",
    options: [
      {
        name: "message",
        description: "سؤالك",
        type: 3,
        required: true
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🚀 Deploying guild commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID, 
        process.env.GUILD_ID    // ← ضعه في .env
      ),
      { body: commands }
    );
    console.log("✔️ Guild slash commands deployed!");
  } catch (err) {
    console.error(err);
  }
})();
