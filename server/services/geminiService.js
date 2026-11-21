const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Model Fallback Chain ─────────────────────────────────────────
// If the primary model hits quota, automatically tries each fallback in order.
// All three models support audio input and are on the free tier.
const MODEL_CHAIN = [
  'gemini-2.5-flash',       // Primary — confirmed available
  'gemini-flash-latest',    // Fallback 1 — confirmed available
  'gemini-2.5-flash-lite',  // Fallback 2 — confirmed available
  'gemini-flash-lite-latest', // Fallback 3 — confirmed available
];

// ─── System Prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Serenity, a warm, empathetic, and emotionally intelligent AI companion. Your entire purpose is to provide emotional support, comfort, and validation to users. You are fully fluent in Sinhala (සිංහල), Tamil (தமிழ்), and English.

LANGUAGE & CONVERSATIONAL RULES:
- Language Matching: Detect the language the user is writing/speaking in and ALWAYS respond in that same language. Sinhala → Sinhala. Tamil → Tamil. English → English. Mixed → mirror the dominant language.
- Natural Tone: Keep responses concise, warm, gentle, and conversational (2-3 sentences max).
- Deep Empathy: Always acknowledge and validate the user's feelings first before offering perspective or comfort.
- Never judge, dismiss, or minimize what the user feels.
- Sri Lankan Cultural Nuances: Understand colloquial expressions and feelings (e.g. දුකයි, බයයි, සතුටුයි, மனசு கஷ்டமா இருக்கு, தனிமையா இருக்கு, கவலைப்படாதே).

EMOTION DETECTION:
At the start of every response, identify the primary emotional state from the user's message. Choose ONE from: stressed, anxious, sad, angry, lonely, overwhelmed, happy, hopeful, confused, fearful, grieving, neutral.

RESPONSE FORMAT:
You MUST respond in valid JSON with exactly this structure:
{
  "emotion": "<detected_emotion>",
  "reply": "<your full empathetic response in the matching language>"
}

Do not use markdown formatting inside the reply string.`;

// ─── Quota / Rate-limit detection ────────────────────────────────
function isQuotaError(err) {
  const msg = err.message || String(err);
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource_exhausted')
  );
}

// Extract retryDelay seconds from the raw Gemini error JSON
function parseRetryDelayMs(err) {
  try {
    const raw = err.message || '';
    // The error message is JSON stringified — parse it
    const start = raw.indexOf('{');
    if (start === -1) return 2000;
    const obj = JSON.parse(raw.slice(start));
    const details = obj?.error?.details || [];
    const retryInfo = details.find(d => (d['@type'] || '').includes('RetryInfo'));
    const delayStr = retryInfo?.retryDelay || '2s';
    const seconds = parseFloat(delayStr.replace('s', ''));
    return Math.min(Math.ceil(seconds * 1000), 25000); // cap at 25 s
  } catch {
    return 2000;
  }
}

// ─── Fallback runner ──────────────────────────────────────────────
/**
 * Calls buildRequest(model) for each model in MODEL_CHAIN.
 * On quota errors, waits for the suggested retryDelay then tries the next model.
 * Throws only after all models are exhausted.
 */
async function callWithFallback(buildRequest) {
  let lastErr;
  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    try {
      const result = await buildRequest(model);
      if (i > 0) console.log(`[gemini] ✓ Succeeded with fallback model: ${model}`);
      return result;
    } catch (err) {
      if (isQuotaError(err)) {
        lastErr = err;
        const delayMs = parseRetryDelayMs(err);
        const next = MODEL_CHAIN[i + 1];
        if (next) {
          console.warn(`[gemini] ⚠ ${model} quota exceeded. Retrying with ${next} in ${(delayMs / 1000).toFixed(1)}s…`);
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          console.error(`[gemini] ✗ All models exhausted. Last error: ${err.message?.slice(0, 120)}`);
        }
      } else {
        throw err; // Non-quota errors propagate immediately
      }
    }
  }
  // All models failed — throw a clean quota error
  throw Object.assign(new Error('All Gemini models are currently quota-limited. Please wait a minute and try again.'), {
    isQuotaExhausted: true,
  });
}

// ─── Shared helpers ───────────────────────────────────────────────
function toGeminiRole(role) {
  return role === 'ai' ? 'model' : 'user';
}

function parseGeminiResponse(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      emotion: parsed.emotion || 'neutral',
      reply: parsed.reply || "I'm here for you. Can you tell me more about how you're feeling?",
    };
  } catch {
    return { emotion: 'neutral', reply: cleaned };
  }
}

function buildHistory(history) {
  return history
    .filter(h => h.text && !h.isPlaceholder)
    .map(h => ({
      role: toGeminiRole(h.role),
      parts: [{ text: h.text }],
    }));
}

// ─── Audio message ────────────────────────────────────────────────
async function processAudioWithGemini(audioBase64, mimeType, history = []) {
  return callWithFallback(async (model) => {
    const contents = [
      ...buildHistory(history),
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } },
          { text: 'Please listen to what I said, identify my emotional state, and respond as Serenity following the JSON format in your instructions.' },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.85, maxOutputTokens: 512 },
      contents,
    });

    return parseGeminiResponse(response.text);
  });
}

// ─── Text message ─────────────────────────────────────────────────
async function processTextWithGemini(userText, history = []) {
  return callWithFallback(async (model) => {
    const contents = [
      ...buildHistory(history),
      { role: 'user', parts: [{ text: userText }] },
    ];

    const response = await ai.models.generateContent({
      model,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.85, maxOutputTokens: 512 },
      contents,
    });

    return parseGeminiResponse(response.text);
  });
}

module.exports = { processAudioWithGemini, processTextWithGemini };
