import { useState, useRef, useCallback, useEffect } from 'react';

const AUDIO_API_URL = '/api/chat';
const TEXT_API_URL  = '/api/chat/text';

/**
 * useChatSession — manages the full lifecycle of a voice + text chat session:
 *   - Ephemeral conversation history (flushed on End Session)
 *   - MediaRecorder start/stop
 *   - Audio blob → backend upload
 *   - Text message → backend
 *   - SpeechSynthesis TTS playback with timeout fallback (Windows fix)
 */
export function useChatSession() {
  // ── State ────────────────────────────────────────────────────────
  const [status, setStatus] = useState('idle'); // idle | active | recording | processing | speaking
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const streamRef        = useRef(null);
  const ttsTimerRef      = useRef(null);   // fallback timer if onend never fires

  // Cancel TTS when unmounting
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      clearTimeout(ttsTimerRef.current);
    };
  }, []);

  // ── TTS with Windows-safe fallback ───────────────────────────────
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) {
      // No TTS support — just go back to active
      setStatus('active');
      return;
    }

    window.speechSynthesis.cancel();
    clearTimeout(ttsTimerRef.current);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = 0.95;
    utterance.pitch  = 1.05;
    utterance.volume = 1;

    // Prefer a warm English voice if available
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('zira') ||
         v.name.toLowerCase().includes('samantha') ||
         v.name.toLowerCase().includes('karen') ||
         v.name.toLowerCase().includes('victoria') ||
         v.name.toLowerCase().includes('female'))
      );
      if (preferred) utterance.voice = preferred;

      const done = () => {
        clearTimeout(ttsTimerRef.current);
        setIsSpeaking(false);
        setStatus('active');
      };

      utterance.onstart = () => {
        setIsSpeaking(true);
        setStatus('speaking');
        // Fallback: if onend never fires within (words * 500ms + 4s), force-resume
        const estimatedMs = Math.max(text.split(' ').length * 500, 4000) + 4000;
        ttsTimerRef.current = setTimeout(done, estimatedMs);
      };
      utterance.onend   = done;
      utterance.onerror = done;

      window.speechSynthesis.speak(utterance);
    };

    // Voices may not be loaded yet on first call — wait if needed
    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
      // If voices never load, still proceed after 500ms
      setTimeout(trySpeak, 500);
    }
  }, []);

  // ── Shared: handle API response ───────────────────────────────────
  const handleResponse = useCallback((emotion, reply, userTurnId, userText) => {
    setHistory(prev => [
      ...prev.filter(h => h.id !== userTurnId),
      { id: userTurnId, role: 'user', text: userText, emotion },
      { id: Date.now() + 1, role: 'ai', text: reply, emotion },
    ]);
    speak(reply);
  }, [speak]);

  // ── Start Recording ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus' :
        'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      setStatus('recording');
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Please allow microphone permissions and try again.'
        : `Could not start recording: ${err.message}`;
      setError(msg);
      setStatus(history.length > 0 ? 'active' : 'idle');
    }
  }, [history.length]);

  // ── Stop Recording & Send ────────────────────────────────────────
  const stopRecordingAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    setStatus('processing');

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach(t => t.stop());

      const mimeType = recorder.mimeType;
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      const userTurnId = Date.now();
      setHistory(prev => [...prev, {
        id: userTurnId,
        role: 'user',
        text: '🎤 Listening…',
        isPlaceholder: true,
      }]);

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('mimeType', mimeType);

        // Send clean history (no placeholders, correct structure)
        const textHistory = history
          .filter(h => !h.isPlaceholder)
          .map(h => ({ role: h.role, text: h.text }));
        formData.append('history', JSON.stringify(textHistory));

        const res = await fetch(AUDIO_API_URL, { method: 'POST', body: formData });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error ${res.status}`);
        }

        const { emotion, reply } = await res.json();
        handleResponse(emotion, reply, userTurnId, '🎤 Voice message');

      } catch (err) {
        setError(`Something went wrong: ${err.message}`);
        setHistory(prev => prev.filter(h => h.id !== userTurnId));
        setStatus('active');
      }
    };

    recorder.stop();
  }, [history, handleResponse]);

  // ── Send Text Message ────────────────────────────────────────────
  const sendTextMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    if (status === 'recording' || status === 'processing') return;

    setError(null);
    const prevStatus = status;
    setStatus('processing');
    if (prevStatus === 'idle') {/* session now active */}

    const userTurnId = Date.now();
    setHistory(prev => [...prev, {
      id: userTurnId,
      role: 'user',
      text: text.trim(),
    }]);

    try {
      // Send history WITHOUT the message we just added (it's included as `message`)
      const textHistory = history
        .filter(h => !h.isPlaceholder)
        .map(h => ({ role: h.role, text: h.text }));

      const res = await fetch(TEXT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history: textHistory }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const { emotion, reply } = await res.json();
      handleResponse(emotion, reply, userTurnId, text.trim());

    } catch (err) {
      setError(`Something went wrong: ${err.message}`);
      setHistory(prev => prev.filter(h => h.id !== userTurnId));
      setStatus(history.length > 0 ? 'active' : 'idle');
    }
  }, [status, history, handleResponse]);

  // ── Toggle Mic Tap ───────────────────────────────────────────────
  const handleMicTap = useCallback(() => {
    if (status === 'processing' || status === 'speaking') return;

    if (status === 'recording') {
      stopRecordingAndSend();
    } else {
      if (status === 'idle') setStatus('active');
      startRecording();
    }
  }, [status, startRecording, stopRecordingAndSend]);

  // ── End Session ──────────────────────────────────────────────────
  const endSession = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    window.speechSynthesis?.cancel();
    clearTimeout(ttsTimerRef.current);

    setHistory([]);
    setError(null);
    setIsSpeaking(false);
    setStatus('idle');
  }, []);

  return {
    status,
    history,
    error,
    isSpeaking,
    handleMicTap,
    sendTextMessage,
    endSession,
  };
}
