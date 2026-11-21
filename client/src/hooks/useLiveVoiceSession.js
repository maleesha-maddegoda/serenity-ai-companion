import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { encode, decode, decodeAudioData, floatTo16BitPCM, calculateRMS } from '../utils/audioHelper';

const SYSTEM_INSTRUCTION = `You are Serenity, a warm, gentle, and deeply empathetic AI voice companion. Your purpose is to listen with genuine compassion, validate feelings, and provide emotional support and reassurance.

CRITICAL OUTPUT RULE:
- Speak directly to the user.
- Output ONLY your direct spoken words.
- Do NOT output your internal thoughts, reasoning, analysis, or emotion labels in the speech text.

LANGUAGE CAPABILITY:
- You speak fluently in Sinhala (සිංහල), Tamil (தமிழ்), and English.
- If the user speaks in Sinhala, respond naturally, gently, and warmly in Sinhala.
- If the user speaks in Tamil, respond warmly and gently in Tamil.
- If the user speaks in English, respond warmly in English.
- If the user mixes languages, respond in the language they appear most comfortable in.

EMOTIONAL INTELLIGENCE:
- Acknowledge and validate the user's emotional experience first (e.g. sadness, stress, anxiety, heartbreak, loneliness, burnout, joy).
- Keep voice responses natural, conversational, and relatively brief (2-3 sentences per turn) so the user can easily talk back.
- Speak in a calm, soothing, and supportive tone.`;

/**
 * Strips any internal thoughts, reasoning tags, or raw JSON from text
 */
function cleanResponseText(raw) {
  if (!raw) return '';
  let text = raw;

  // 1. Remove XML/HTML style thought blocks: <thought>...</thought>, <think>...</think>
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Remove "Thinking Process: ..." or "Thought: ..." if at start
  text = text.replace(/^(?:thought|thinking(?:\s+process)?):\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/i, '');

  // 3. Remove markdown json code blocks if Gemini tried to return JSON
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.reply) text = parsed.reply;
    } catch {}
  } else if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed.reply) text = parsed.reply;
    } catch {}
  }

  return text.trim();
}

/**
 * Appends a new transcript chunk with correct word spacing
 */
function appendTranscriptChunk(prev, chunk) {
  if (!prev) return chunk.trimStart();
  if (!chunk) return prev;

  // If either prev ends with space/newline or chunk starts with space/newline, concatenate directly
  if (/\s$/.test(prev) || /^\s/.test(chunk)) {
    return prev + chunk;
  }

  // If chunk starts with punctuation, do not add extra space
  if (/^[.,!?;:’”'—\-)\]}]/.test(chunk)) {
    return prev + chunk;
  }

  // Add space between separate word tokens
  return prev + ' ' + chunk;
}

export function useLiveVoiceSession() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'speaking'
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [volume, setVolume] = useState(0);

  // References
  const liveSessionRef = useRef(null);
  const inputAudioCtxRef = useRef(null);
  const outputAudioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);
  const currentAssistantTurnRef = useRef({ id: null, text: '' });
  const currentUserTurnRef = useRef({ id: null, text: '' });
  const isActiveRef = useRef(false);

  // VAD state refs
  const isSpeakingRef = useRef(false);          // currently above threshold?
  const silenceFramesRef = useRef(0);            // frames of silence counted after speech

  // Stop all currently playing audio chunks (e.g., when user interrupts)
  const stopAllOutputAudio = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
  }, []);

  // Cleanup all audio resources and WebSocket session
  const hardStop = useCallback(() => {
    isActiveRef.current = false;
    stopAllOutputAudio();

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch {}
      liveSessionRef.current = null;
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    setVolume(0);
    setStatus('idle');
  }, [stopAllOutputAudio]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => hardStop();
  }, [hardStop]);

  // Fetch API key from Vite env or local backend /api/config
  const resolveApiKey = async () => {
    if (import.meta.env.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) return data.apiKey;
      }
    } catch {}
    return null;
  };

  const startSession = useCallback(async () => {
    hardStop();
    setError(null);
    setStatus('connecting');
    isActiveRef.current = true;

    try {
      const apiKey = await resolveApiKey();
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY is not configured. Please add your key to .env or VITE_GEMINI_API_KEY.'
        );
      }

      // 1. Initialize Audio Contexts
      // Input: 16kHz for Gemini PCM capture
      // Output: 24kHz for Gemini native audio playback
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const inCtx = new AudioCtxClass({ sampleRate: 16000 });
      const outCtx = new AudioCtxClass({ sampleRate: 24000 });

      // Resume contexts if browser suspended them
      if (inCtx.state === 'suspended') await inCtx.resume();
      if (outCtx.state === 'suspended') await outCtx.resume();

      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      // 2. Request User Microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      // 3. Connect to Gemini Live Multimodal API
      const ai = new GoogleGenAI({ apiKey });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('[Live Voice] ✓ Connected to Gemini Live API');
            if (!isActiveRef.current) return;
            setStatus('listening');

            // Setup 16kHz Mic Processing
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            // ── Voice Activity Detection (VAD) constants ──────────────
            // RMS threshold: 0.01 (~1%) filters typical background noise.
            // Raise this if your environment is noisier.
            const VAD_THRESHOLD = 0.01;
            // How many silent frames to keep streaming after speech ends
            // (4096 samples @ 16kHz ≈ 256ms per frame; 8 frames ≈ 2 seconds tail)
            const SILENCE_TAIL_FRAMES = 8;

            scriptProcessor.onaudioprocess = (e) => {
              if (!isActiveRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const rms = calculateRMS(inputData);
              setVolume(rms);

              const isSpeech = rms >= VAD_THRESHOLD;

              if (isSpeech) {
                // User is speaking — reset silence counter and mark active
                isSpeakingRef.current = true;
                silenceFramesRef.current = 0;
              } else if (isSpeakingRef.current) {
                // Just went silent after speech — count tail frames
                silenceFramesRef.current += 1;
                if (silenceFramesRef.current >= SILENCE_TAIL_FRAMES) {
                  // Silence tail exhausted — stop sending until next speech burst
                  isSpeakingRef.current = false;
                  silenceFramesRef.current = 0;
                  return; // skip this chunk
                }
                // Still within the tail — fall through and send the chunk
              } else {
                // Pure background noise before any speech, or long pause — skip
                return;
              }

              // Convert Float32 to 16-bit PCM bytes and send to Gemini
              const pcmBytes = floatTo16BitPCM(inputData);
              const base64Data = encode(pcmBytes);

              sessionPromise
                .then((session) => {
                  if (isActiveRef.current && session) {
                    session.sendRealtimeInput({
                      media: {
                        data: base64Data,
                        mimeType: 'audio/pcm;rate=16000',
                      },
                    });
                  }
                })
                .catch((err) => {
                  console.warn('[Live Voice] Error sending PCM chunk:', err);
                });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
          },

          onmessage: async (message) => {
            if (!isActiveRef.current) return;

            // Handle Barge-in Interruption: Stop playing when user interrupts
            if (message.serverContent?.interrupted) {
              console.log('[Live Voice] ⚡ User interrupted Gemini');
              stopAllOutputAudio();
              setStatus('listening');
              return;
            }

            // Handle Audio Playback
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              // Base64 PCM Audio Chunk
              if (part.inlineData?.data && outputAudioCtxRef.current) {
                setStatus('speaking');
                const ctx = outputAudioCtxRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                try {
                  const pcmUint8 = decode(part.inlineData.data);
                  const audioBuffer = await decodeAudioData(pcmUint8, ctx, 24000, 1);

                  const sourceNode = ctx.createBufferSource();
                  sourceNode.buffer = audioBuffer;
                  sourceNode.connect(ctx.destination);

                  sourceNode.onended = () => {
                    activeSourcesRef.current = activeSourcesRef.current.filter(
                      (s) => s !== sourceNode
                    );
                    if (activeSourcesRef.current.length === 0 && isActiveRef.current) {
                      setStatus('listening');
                    }
                  };

                  activeSourcesRef.current.push(sourceNode);
                  sourceNode.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                } catch (audioErr) {
                  console.error('[Live Voice] Audio decode error:', audioErr);
                }
              }

              // Text Transcript (if provided) - ignore internal thoughts
              if (part.text && !part.thought) {
                const textChunk = cleanResponseText(part.text);
                if (textChunk) {
                  if (!currentAssistantTurnRef.current.id) {
                    currentAssistantTurnRef.current = {
                      id: Date.now() + 1,
                      text: textChunk,
                    };
                    setHistory((prev) => [
                      ...prev,
                      {
                        id: currentAssistantTurnRef.current.id,
                        role: 'ai',
                        text: currentAssistantTurnRef.current.text,
                      },
                    ]);
                  } else {
                    currentAssistantTurnRef.current.text = appendTranscriptChunk(
                      currentAssistantTurnRef.current.text,
                      textChunk
                    );
                    const cleaned = cleanResponseText(currentAssistantTurnRef.current.text);
                    setHistory((prev) =>
                      prev.map((item) =>
                        item.id === currentAssistantTurnRef.current.id
                          ? { ...item, text: cleaned }
                          : item
                      )
                    );
                  }
                }
              }
            }

            // Output transcription metadata (what is spoken aloud)
            if (message.serverContent?.outputTranscription?.text) {
              const text = cleanResponseText(message.serverContent.outputTranscription.text);
              if (text) {
                if (!currentAssistantTurnRef.current.id) {
                  currentAssistantTurnRef.current = { id: Date.now() + 1, text };
                  setHistory((prev) => [
                    ...prev,
                    { id: currentAssistantTurnRef.current.id, role: 'ai', text },
                  ]);
                } else {
                  currentAssistantTurnRef.current.text = appendTranscriptChunk(
                    currentAssistantTurnRef.current.text,
                    text
                  );
                  const cleaned = cleanResponseText(currentAssistantTurnRef.current.text);
                  setHistory((prev) =>
                    prev.map((item) =>
                      item.id === currentAssistantTurnRef.current.id
                        ? { ...item, text: cleaned }
                        : item
                    )
                  );
                }
              }
            }

            // Turn complete: clean final turn text and reset tracker
            if (message.serverContent?.turnComplete) {
              if (currentAssistantTurnRef.current.id) {
                const finalClean = cleanResponseText(currentAssistantTurnRef.current.text);
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === currentAssistantTurnRef.current.id
                      ? { ...item, text: finalClean }
                      : item
                  )
                );
              }
              currentAssistantTurnRef.current = { id: null, text: '' };
              currentUserTurnRef.current = { id: null, text: '' };
            }
          },

          onerror: (err) => {
            console.error('[Live Voice] Error:', err);
            setError(err.message || 'Live Voice Assistant connection error.');
            hardStop();
          },

          onclose: () => {
            console.log('[Live Voice] Disconnected');
            if (isActiveRef.current) {
              setStatus('idle');
              isActiveRef.current = false;
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore', // Natural soothing female voice ('Kore', 'Aoede', 'Fenrir', 'Puck')
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });

      const session = await sessionPromise;
      liveSessionRef.current = session;
    } catch (err) {
      console.error('[Live Voice] Startup failed:', err);
      setError(err.message || 'Failed to start Live Voice Assistant.');
      hardStop();
    }
  }, [hardStop, stopAllOutputAudio]);

  const endSession = useCallback(() => {
    hardStop();
    setHistory([]);
  }, [hardStop]);

  return {
    status,
    history,
    error,
    volume,
    startSession,
    endSession,
  };
}
