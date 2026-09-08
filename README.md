# SUDO_BREACH Mobile

A cyberpunk-themed roguelike deck-builder game built with vanilla HTML5, CSS3, and JavaScript, featuring an interactive LLM Boss battle on Floor 5 powered by Google Gemini.

---

## Features

- **Floors 1–4 Roguelike Math Combat:** Build your syntax deck, drag-and-drop or tap cards to chain multipliers (`Chips × Multiplier = Damage`), and exploit system vulnerabilities.
- **Floor 5 Gemini AI Boss (OMNI_MIND):** Interactive prompt injection battle against a sentient security core. Outsmart the AI using logic paradoxes or creator credentials to trigger a root breach.
- **Multi-Model Fallback Engine:** Server-side proxy automatically rotates across `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, and standard Flash models for zero-downtime reliability.
- **Autonomous Fail-Safe:** Built-in offline heuristic simulation ensures seamless gameplay even during upstream cloud outages.
- **Zero External Dependencies:** Native Node.js HTTP server (`node:http`, `node:fs`, `node:path`) with no third-party npm packages required.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- A Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
   cd sudobreach_mobile
   ```

2. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste your Gemini API key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```

3. **Start the Game Server:**
   ```bash
   npm start
   ```

4. **Play the Game:**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Deploy to Vercel

1. Push this repository to GitHub (e.g. `https://github.com/StarSurgeStudio/sudobreach`).
2. Go to [vercel.com](https://vercel.com/) and click **"Add New Project"**.
3. Import the `sudobreach` repository.
4. Under **Environment Variables**, add:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** `your_gemini_api_key_here`
5. Click **Deploy**. Vercel will automatically configure the static site and the `/api/boss-prompt` serverless function.

---

## Project Structure

```
sudobreach_mobile/
├── api/                # Vercel Serverless Functions
│   ├── boss-prompt.js  # Serverless AI boss prompt handler
│   └── health.js       # Health check endpoint
├── .env.example        # Environment variable template
├── .gitignore          # Excludes secret credentials and local configs
├── package.json        # Project metadata and run scripts
├── server.js           # Local Node proxy and static file server
├── vercel.json         # Vercel routing and serverless rewrites
├── www/                # Client-side web & mobile app bundle
│   ├── index.html      # Main game interface
│   ├── style.css       # CRT phosphor green styling and animations
│   └── app.js          # Core roguelike game loop & API integration
└── README.md
```

---

## Security

All Gemini API calls are proxied through serverless endpoints (`api/boss-prompt.js`) on Vercel or `server.js` locally. Secret keys are loaded strictly from the `GEMINI_API_KEY` environment variable and are never exposed to client-side code or browser network inspectors.
