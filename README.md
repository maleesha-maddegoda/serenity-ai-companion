<div align="center">

# 🌿 Serenity — Emotional AI Companion

<p align="center">
  <strong>An empathetic, privacy-first, trilingual voice & text AI companion built with React, Node.js, and Google Gemini AI.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-Multimodal-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Languages-EN%20%7C%20SI%20%7C%20TA-00e676?style=for-the-badge" alt="Trilingual" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

<br />

<p align="center">
  <em>"A companion that truly listens, supports, and understands you — in your own words."</em>
</p>

</div>

---

## 🌟 Highlights

- 🗣️ **Trilingual Emotional Support**: Native, warm conversational flow in **English**, **Sinhala (සිංහල)**, and **Tamil (தமிழ்)** with cultural nuances.
- 🎙️ **Real-Time Multimodal Voice**: Zero-latency hands-free conversation with live interruption handling and animated waveform feedback.
- 🧠 **Dynamic Emotion Detection**: Real-time emotion classification (*Stressed*, *Anxious*, *Sad*, *Overwhelmed*, *Happy*, *Hopeful*, *Grieving*, etc.) that shapes the empathy and tone of every response.
- 📊 **Interactive Mood Journal**: Track real-time emotions and reflection history across the active session.
- 🔒 **Zero-Retention Privacy**: All conversations are temporary and stored strictly in client-side memory — nothing is sold, tracked, or persisted.
- 🎨 **Cyber-Emerald Theme**: Aesthetic neon-green and midnight dark modes crafted with modern glassmorphism.

---

## 📸 Preview

```
┌─────────────────┬───────────────────────────────────────────┬─────────────────┐
│  🌿 Serenity    │  Hello Friend!                            │     Serenity    │
│                 │  Talk, share, and feel better...          │     (Avatar)    │
│  💬 Chat Assist │                                           │                 │
│  🎙️ Voice Mode  │   [✦ Your Emotional AI Companion ✦]       │  Current Mood:  │
│  📊 Mood Journal│                                           │  😊 Calm & Pos  │
│  ⚙️ Settings    │   Serenity: "Hi there! How are you today?"│                 │
│  ℹ️ About       │   User: "I've been feeling stressed lately"│  Quick Actions: │
│                 │                                           │  🎙️ Voice Chat  │
│  🌐 Languages   ├───────────────────────────────────────────┤  💭 Thoughts    │
│  🇬🇧 🇱🇰 🇱🇰       │  (🎙️) Type a message or press the mic...  │  ♥ Support      │
└─────────────────┴───────────────────────────────────────────┴─────────────────┘
```

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite 5, Custom CSS3 Design System with CSS variables and responsive glassmorphism.
- **Audio Processing**: Web Audio API (16kHz PCM streaming capture & 24kHz raw audio playback).
- **Backend**: Express.js, Multer (in-memory audio processing), CORS, Dotenv.
- **AI Core**: `@google/genai` SDK with Google Gemini 2.5 Flash multimodal models.

---

## 🚀 Quick Setup & Installation

### 1. Prerequisites
- **Node.js** v18+ installed on your machine ([Download Node.js](https://nodejs.org/))
- A free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/serenity-ai-companion.git
cd serenity-ai-companion
```

### 3. Configure API Key
Copy the template configuration file:
```bash
# On Linux / macOS
cp .env.example .env

# On Windows (PowerShell)
Copy-Item .env.example .env
```

Open `.env` and insert your Gemini API Key:
```env
GEMINI_API_KEY=AIzaSyYourActualKeyHere
PORT=3001
```

### 4. Install & Launch the Backend Server
```bash
cd server
npm install
npm run dev
```
> Server runs on `http://localhost:3001`

### 5. Install & Launch the Frontend Client
In a **new terminal window**:
```bash
cd client
npm install
npm run dev
```
> Client launches on `http://localhost:5173`

Open your browser and navigate to **`http://localhost:5173`**!

---

## 🌐 Trilingual Capabilities

Serenity automatically mirrors and responds naturally in the language you speak or type:

| Language | Example Prompt | Emotion Recognition |
|---|---|---|
| **English** | *"I'm feeling burnt out from work."* | Stressed / Overwhelmed |
| **සිංහල (Sinhala)** | *"මට අද හරිම තනිකමක් දැනෙනවා..."* | Lonely / Sad |
| **தமிழ் (Tamil)** | *"இன்று மனசு ரொம்ப பாரமா இருக்கு..."* | Grieving / Anxious |

---

## 📂 Project Structure

```
├── client/                     # Vite + React Frontend
│   ├── public/                 # Static assets (lotus, icons)
│   ├── src/
│   │   ├── components/         # Reusable UI widgets (EmotionBadge, Waveform)
│   │   ├── hooks/              # Audio & chat session controllers
│   │   ├── utils/              # 16-bit PCM encode/decode audio math
│   │   ├── App.jsx             # Master chat dashboard
│   │   └── index.css           # Glassmorphism & Cyber-Emerald design tokens
│   ├── index.html              # App entry point
│   └── vite.config.js          # Dev server with /api proxy
├── server/                     # Express Backend
│   ├── routes/                 # Audio and text endpoints (/api/chat)
│   ├── services/               # Gemini prompt tuning & model chain
│   └── index.js                # Server entry point
├── .env.example                # Safe environment variable template
├── .gitignore                  # Production-grade git ignore
└── README.md                   # Project documentation
```

---

## 🔒 Safety & Medical Disclaimer

> [!NOTE]
> **Serenity** is designed solely as an empathetic AI companion for comfort, emotional check-ins, and companionship. It is **not** a licensed therapist, medical provider, or crisis response hotline. If you or someone you know is in distress or experiencing a medical emergency, please reach out to local emergency services or national crisis helplines.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
