import { useState, useRef, useCallback, useEffect } from 'react';

const AUDIO_API_URL = '/api/chat';

// ── Silence detection tuning ──────────────────────────────────────
const SPEECH_THRESHOLD_RMS  = 20;  // RMS to START detecting speech (above background noise)
const SILENCE_THRESHOLD_RMS = 10;  // RMS below this = silence (background noise level)
const SILENCE_AFTER_SPEECH_MS = 1200; // How long silence must last before sending
const MIN_RECORDING_MS = 500;         // Min recording length before silence triggers
const MIN_BLOB_BYTES = 800;           // Accept smaller blobs

/**
 * useContinuousSession — manages a hands-free conversational loop:
 *
 *   startSession()  →  listen (silence detection)
 *                  →  [speech detected]
 *                  →  auto-send to backend (processing)
 *                  →  TTS playback (speaking)
 *                  →  TTS onend → listen again  ↩ loop
 *
 *   endSession()   →  stops everything, flushes ephemeral memory
 */
export function useContinuousSession() {
  const [status, setStatus]   = useState('idle');
  const [history, setHistory] = useState([]);
  const [error, setError]     = useState(null);

  // ── Audio infrastructure refs ─────────────────────────────────────
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);
  const streamRef    = useRef(null);
  const audioCtxRef  = useRef(null);
  const analyserRef  = useRef(null);
  const rafRef       = useRef(null);   // requestAnimationFrame handle
  const ttsTimerRef  = useRef(null);   // TTS fallback timeout

  // ── State mirrors as refs (safe inside async / RAF callbacks) ─────
  const isActiveRef  = useRef(false);   // Is the conversation loop running?
  const statusRef    = useRef('idle');
  const historyRef   = useRef([]);

  // ── Silence detection state refs ──────────────────────────────────
  const hasSpeechRef   = useRef(false);
  const lastSpeechRef  = useRef(0);
  const recStartRef    = useRef(0);

  // Forward ref to break the circular dependency:
  // startListening → (silence detect) → processAudio → speakAndResume → startListening
  const startListeningRef = useRef(null);

  // Sync state → refs
  useEffect(() => { statusRef.current  = status;  }, [status]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Cleanup on unmount
  useEffect(() => () => { _hardStop(); }, []);

  // ── Hard stop: tears down all audio and TTS ───────────────────────
  const _hardStop = () => {
    isActiveRef.current = false;
    cancelAnimationFrame(rafRef.current);
    clearTimeout(ttsTimerRef.current);
    try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;   // ← null ref so onstop never double-closes
    analyserRef.current = null;
    window.speechSynthesis?.cancel();
  };

  // ── TTS: speak reply then auto-resume mic ─────────────────────────
  const speakAndResume = useCallback((text) => {
    if (!isActiveRef.current) return;

    const resume = () => {
      clearTimeout(ttsTimerRef.current);
      if (isActiveRef.current) startListeningRef.current?.();
    };

    if (!window.speechSynthesis) { resume(); return; }

    window.speechSynthesis.cancel();
    clearTimeout(ttsTimerRef.current);
    setStatus('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = 0.95;
    utterance.pitch  = 1.05;
    utterance.volume = 1;

    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('zira')     ||
         v.name.toLowerCase().includes('samantha') ||
         v.name.toLowerCase().includes('karen')    ||
         v.name.toLowerCase().includes('female'))
      );
      if (preferred) utterance.voice = preferred;

      // Fallback timeout in case onend never fires (Windows bug)
      utterance.onstart = () => {
        const estimatedMs = Math.max(text.split(' ').length * 550, 3000) + 5000;
        ttsTimerRef.current = setTimeout(resume, estimatedMs);
      };
      utterance.onend   = resume;
      utterance.onerror = resume;
      window.speechSynthesis.speak(utterance);
    };

    // Voices may need a moment to load on first call
    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
      setTimeout(doSpeak, 600);
    }
  }, []);

  // ── Process: send audio blob to backend ───────────────────────────
  const processAudio = useCallback(async (blob, mimeType) => {
    if (!isActiveRef.current) return;

    const userTurnId = Date.now();
    setHistory(prev => [
      ...prev,
      { id: userTurnId, role: 'user', text: '🎤 Voice message…', isPlaceholder: true },
    ]);

    try {
      const textHistory = historyRef.current
        .filter(h => !h.isPlaceholder)
        .map(h => ({ role: h.role, text: h.text }));

      const fd = new FormData();
      fd.append('audio', blob, 'rec.webm');
      fd.append('mimeType', mimeType);
      fd.append('history', JSON.stringify(textHistory));

      const res = await fetch(AUDIO_API_URL, { method: 'POST', body: fd });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const { emotion, reply } = await res.json();

      setHistory(prev => [
        ...prev.filter(h => h.id !== userTurnId),
        { id: userTurnId,     role: 'user', text: '🎤 Voice message', emotion },
        { id: Date.now() + 1, role: 'ai',   text: reply,             emotion },
      ]);

      speakAndResume(reply);

    } catch (err) {
      setError(err.message);
      setHistory(prev => prev.filter(h => h.id !== userTurnId));
      if (isActiveRef.current) {
        // On error, pause 2s then resume listening
        setTimeout(() => { if (isActiveRef.current) startListeningRef.current?.(); }, 2000);
      } else {
        setStatus('idle');
      }
    }
  }, [speakAndResume]);

  // ── Start Listening: mic on + silence detection ───────────────────
  const startListening = useCallback(async () => {
    if (!isActiveRef.current) return;

    setError(null);
    setStatus('listening');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up AudioContext analyser for energy-based silence detection
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);
      analyserRef.current = analyser;

      // Pick best supported MIME type
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus' :
        'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current   = [];

      // Reset silence detection state
      hasSpeechRef.current  = false;
      lastSpeechRef.current = Date.now();
      recStartRef.current   = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;

        if (!isActiveRef.current) return;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Skip empty / no-speech recordings and re-listen
        if (blob.size < MIN_BLOB_BYTES || !hasSpeechRef.current) {
          if (isActiveRef.current) startListeningRef.current?.();
          return;
        }

        setStatus('processing');
        await processAudio(blob, mimeType);
      };

      recorder.start(100); // collect chunks every 100ms

      // ── Silence detection RAF loop ──────────────────────────────
      const detect = () => {
        if (statusRef.current !== 'listening' || !analyserRef.current) return;

        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);

        // RMS energy
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        const now = Date.now();

        // Debug: log mic level every 2s
        if (Math.floor((now - recStartRef.current) / 2000) > Math.floor((now - recStartRef.current - 16) / 2000)) {
          console.log(`[mic] RMS: ${rms.toFixed(1)} | speechThreshold: ${SPEECH_THRESHOLD_RMS} | silenceThreshold: ${SILENCE_THRESHOLD_RMS} | hasSpeech: ${hasSpeechRef.current}`);
        }

        // Detect START of speech (loud enough above background)
        if (rms > SPEECH_THRESHOLD_RMS) {
          hasSpeechRef.current  = true;
          lastSpeechRef.current = now; // reset silence timer
        }

        // Detect SILENCE (dropped below silence threshold)
        const isCurrentlySilent = rms < SILENCE_THRESHOLD_RMS;
        const elapsedMs = now - recStartRef.current;
        const silenceMs = isCurrentlySilent ? (now - lastSpeechRef.current) : 0;

        if (
          hasSpeechRef.current &&         // only after actual speech
          isCurrentlySilent &&            // currently quiet
          silenceMs > SILENCE_AFTER_SPEECH_MS &&
          elapsedMs > MIN_RECORDING_MS
        ) {
          console.log(`[mic] ✓ Speech ended — sending audio (${elapsedMs}ms recorded, RMS: ${rms.toFixed(1)})`);
          cancelAnimationFrame(rafRef.current);
          recorder.stop();  // triggers recorder.onstop → processAudio
          return;
        }

        rafRef.current = requestAnimationFrame(detect);
      };

      rafRef.current = requestAnimationFrame(detect);

    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone permissions in your browser and refresh.'
          : `Microphone error: ${err.message}`
      );
      setStatus('idle');
      isActiveRef.current = false;
    }
  }, [processAudio]);

  // Assign to ref so speakAndResume can call it without circular dependency
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // ── Start Session ─────────────────────────────────────────────────
  const startSession = useCallback(() => {
    _hardStop();          // clear any previous state
    isActiveRef.current = true;
    setHistory([]);
    setError(null);
    startListening();
  }, [startListening]);

  // ── End Session ───────────────────────────────────────────────────
  const endSession = useCallback(() => {
    _hardStop();
    setHistory([]);
    setError(null);
    setStatus('idle');
  }, []);

  return { status, history, error, startSession, endSession };
}
