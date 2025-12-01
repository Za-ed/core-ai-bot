# Gemini Discord Bot

Simple Discord bot that uses Google's Gemini 1.5 Flash model.

## 1. Install dependencies

```bash
npm install
```

## 2. Create `.env` file

Copy `.env.example` to `.env` and put your keys:

```ini
DISCORD_TOKEN=your_discord_bot_token
GOOGLE_API_KEY=your_gemini_api_key
```

## 3. Run the bot

```bash
npm start
```

Then in any server where the bot is added and has "Read messages / Send messages" permissions, use:

```text
!ai اشرح لي البرمجة الكينونية
```

And the bot will respond using Gemini.
