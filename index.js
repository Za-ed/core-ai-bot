import { Client, GatewayIntentBits, InteractionType } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const fetch = globalThis.fetch;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.on("ready", () => {
    console.log(`🔥 Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ask") {
        const userMsg = interaction.options.getString("message");

        // Acknowledge the command with private response
        await interaction.deferReply({ ephemeral: true });

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "HTTP-Referer": "https://yourapp.com",
                    "X-Title": "Discord Bot",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3.1-70b-instruct",
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: userMsg }
                    ]
                })
            });

            const data = await response.json();

            if (!data?.choices) {
                return interaction.editReply({
                    content: "⚠️ API Error: " + JSON.stringify(data.error || data)
                });
            }

            const reply = data.choices[0].message.content;

            await interaction.editReply({
                content: `🤖 **رد خاص:**\n${reply}`
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
