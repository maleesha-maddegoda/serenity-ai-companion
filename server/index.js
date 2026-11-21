const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/chat', chatRouter);

// Health & config check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    hasKey: !!process.env.GEMINI_API_KEY,
    apiKey: process.env.GEMINI_API_KEY || '',
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Emotional Support AI Backend running on http://localhost:${PORT}`);
  console.log(`    API Key configured: ${process.env.GEMINI_API_KEY ? 'Yes ✓' : 'No ✗ — set GEMINI_API_KEY in .env'}\n`);
});
