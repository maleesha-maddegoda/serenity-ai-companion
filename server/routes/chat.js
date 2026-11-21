const express = require('express');
const multer  = require('multer');
const { processAudioWithGemini, processTextWithGemini } = require('../services/geminiService');

const router = express.Router();

// Audio stored in memory only
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
});

// ── Helpers ──────────────────────────────────────────────────────
function parseHistory(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function checkApiKey(res) {
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured. Add it to your .env file.' });
    return false;
  }
  return true;
}

/**
 * Extracts a clean error message from Gemini API errors.
 * Handles 429 quota errors with a user-friendly message.
 */
function extractError(err) {
  const msg = err.message || String(err);

  // Quota exceeded (free tier limit)
  if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
    return {
      status: 429,
      error: 'API quota exceeded. Please wait a moment and try again, or check your Gemini plan at aistudio.google.com.',
    };
  }
  // API key invalid
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('api key')) {
    return { status: 401, error: 'Invalid or missing Gemini API key. Check your .env file.' };
  }
  // Generic
  return { status: 500, error: `AI service error: ${msg}` };
}

// ── POST /api/chat — Voice message ───────────────────────────────
router.post('/', upload.single('audio'), async (req, res) => {
  try {
    if (!checkApiKey(res)) return;
    if (!req.file) return res.status(400).json({ error: 'No audio file received.' });

    const audioBase64 = req.file.buffer.toString('base64');
    const mimeType    = req.body.mimeType || 'audio/webm';
    const history     = parseHistory(req.body.history);

    console.log(`[audio] ${(req.file.size / 1024).toFixed(1)} KB | ${mimeType} | history: ${history.length} turns`);

    const { emotion, reply } = await processAudioWithGemini(audioBase64, mimeType, history);
    console.log(`[audio] ✓ emotion=${emotion} | reply=${reply.slice(0, 60)}…`);

    return res.json({ emotion, reply, ok: true });

  } catch (err) {
    const { status, error } = extractError(err);
    console.error(`[audio] ✗ ${status}: ${error}`);
    return res.status(status).json({ error });
  }
});

// ── POST /api/chat/text — Text message ───────────────────────────
router.post('/text', async (req, res) => {
  try {
    if (!checkApiKey(res)) return;

    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'No message provided.' });

    console.log(`[text] "${message.slice(0, 60)}" | history: ${history.length} turns`);

    const { emotion, reply } = await processTextWithGemini(message.trim(), history);
    console.log(`[text] ✓ emotion=${emotion}`);

    return res.json({ emotion, reply, ok: true });

  } catch (err) {
    const { status, error } = extractError(err);
    console.error(`[text] ✗ ${status}: ${error}`);
    return res.status(status).json({ error });
  }
});

module.exports = router;
