import { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveVoiceSession } from './hooks/useLiveVoiceSession';
import { useChatSession } from './hooks/useChatSession';

/* ─── Lotus SVG ──────────────────────────────────────────────────── */
function LotusIcon({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M30 47Q22 36 22 26Q22 16 30 13Q38 16 38 26Q38 36 30 47Z" />
      <path d="M22 36Q12 32 11 22Q11 13 20 13Q27 13 29 22" />
      <path d="M38 36Q48 32 49 22Q49 13 40 13Q33 13 31 22" />
      <path d="M15 32Q6 24 9 14Q11 9 18 10Q23 11 25 19" />
      <path d="M45 32Q54 24 51 14Q49 9 42 10Q37 11 35 19" />
      <line x1="30" y1="47" x2="30" y2="53" />
      <path d="M21 55Q25.5 52 30 55Q34.5 52 39 55" opacity="0.35" />
    </svg>
  );
}

/* ─── Animated Waveform ──────────────────────────────────────────── */
function Waveform({ active = false, bars = 5 }) {
  return (
    <span className={`wf ${active ? 'wf--on' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="wf__b" style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </span>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function cleanText(raw) {
  if (!raw) return '';
  let t = raw;
  t = t.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (t.trim().startsWith('{') && t.trim().endsWith('}')) {
    try { const p = JSON.parse(t.trim()); if (p.reply) t = p.reply; } catch { /* ignore */ }
  }
  const jm = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jm) {
    try { const p = JSON.parse(jm[1]); if (p.reply) t = p.reply; } catch { /* ignore */ }
  }
  return t.trim();
}

function ftime(ts) {
  if (!ts) return '';
  try { return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
  catch { return ''; }
}

/* ─── Constants ──────────────────────────────────────────────────── */
const GREETING_ID = '__greeting__';
const GREETING = {
  id: GREETING_ID,
  role: 'ai',
  time: Date.now(),
  text: `Hi there! 🌿\nHow are you feeling today?\nYou can type, speak, or choose an option below.`,
  emotion: 'hopeful',
};

const QUICK_REPLIES = [
  'I feel stressed 😤',
  "I'm happy 😊",
  'Just chatting 💬',
  'Tell me a story 📖',
];

const NAV_ITEMS = [
  { id: 'chat',     ico: '💬', label: 'Chat Assistant' },
  { id: 'voice',    ico: '🎙️', label: 'Voice Mode' },
  { id: 'journal',  ico: '📊', label: 'Mood Journal' },
  { id: 'settings', ico: '⚙️', label: 'Settings' },
  { id: 'about',    ico: 'ℹ️',  label: 'About' },
];

const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧', greeting: 'Hi there! 🌿 How can I support you today?' },
  { code: 'si', label: 'සිංහල',  flag: '🇱🇰', greeting: 'ආයුබෝවන්! 🌿 අද ඔබ කොහොමද? මට ඔබට උදව් කළ හැකිද?' },
  { code: 'ta', label: 'தமிழ்',  flag: '🇱🇰', greeting: 'வணக்கம்! 🌿 இன்று நீங்கள் எப்படி உணர்கிறீர்கள்? நான் எவ்வாறு உதவ முடியும்?' },
];

const EMOTION_INFO = {
  stressed:    { emoji: '😤', label: 'Feeling Stressed',  color: '#fb923c' },
  anxious:     { emoji: '😰', label: 'Feeling Anxious',   color: '#fbbf24' },
  sad:         { emoji: '😢', label: 'Feeling Sad',        color: '#60a5fa' },
  angry:       { emoji: '😠', label: 'Feeling Angry',      color: '#f87171' },
  lonely:      { emoji: '🫂', label: 'Feeling Lonely',     color: '#a78bfa' },
  overwhelmed: { emoji: '🌊', label: 'Overwhelmed',        color: '#c084fc' },
  happy:       { emoji: '😊', label: 'Calm & Positive',   color: '#00e676' },
  hopeful:     { emoji: '🌱', label: 'Hopeful & Calm',    color: '#00e676' },
  confused:    { emoji: '🤔', label: 'Feeling Confused',   color: '#fdba74' },
  fearful:     { emoji: '😨', label: 'Feeling Fearful',    color: '#e879f9' },
  grieving:    { emoji: '💔', label: 'Grieving',           color: '#94a3b8' },
  neutral:     { emoji: '😶', label: 'Neutral & Present',  color: '#7dd3fc' },
};
const DEFAULT_MOOD = { emoji: '😊', label: 'Calm & Positive', color: '#00e676' };

const STATUS_LABEL = {
  idle: 'Ready to listen', active: 'Active',
  recording: 'Recording...', connecting: 'Connecting...',
  listening: 'Listening...', processing: 'Processing...', speaking: 'Speaking...',
};

/* ═══════════════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeNav, setActiveNav] = useState('chat');
  const [langOpen,  setLangOpen]  = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');
  const [inputVal,  setInputVal]  = useState('');
  const [mood,      setMood]      = useState(DEFAULT_MOOD);
  const [moodHistory, setMoodHistory] = useState([
    { emotion: 'hopeful', label: 'Hopeful & Calm', time: 'Just now' }
  ]);
  const [themeDark, setThemeDark] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const chat  = useChatSession();
  const voice = useLiveVoiceSession();

  const inpRef = useRef(null);
  const botRef = useRef(null);

  /* Active session */
  const isVoiceMode = activeNav === 'voice';
  const history     = isVoiceMode ? (voice.history || []) : (chat.history || []);
  const error       = isVoiceMode ? voice.error : chat.error;
  const rawStatus   = isVoiceMode ? voice.status : (chat.status || 'idle');
  const statusLabel = STATUS_LABEL[rawStatus] || 'Ready to listen';
  const isActive    = rawStatus !== 'idle';
  const isListening = rawStatus === 'listening' || rawStatus === 'recording';
  const isSpeaking  = rawStatus === 'speaking';

  /* Merged display messages (always show greeting first) */
  const allMsgs   = [GREETING, ...history.map(m => ({ ...m, time: m.time || Date.now() }))];
  const hasUserMsg = history.some(m => m.role === 'user');

  /* Track mood */
  useEffect(() => {
    const aiWithEmo = history.filter(m => m.role === 'ai' && m.emotion);
    if (aiWithEmo.length) {
      const last = aiWithEmo[aiWithEmo.length - 1];
      const key  = last.emotion?.toLowerCase();
      const info = EMOTION_INFO[key];
      if (info) {
        setMood(info);
        setMoodHistory(prev => [
          ...prev,
          { emotion: key, label: info.label, time: ftime(Date.now()) }
        ]);
      }
    }
  }, [history]);

  /* Auto-scroll */
  useEffect(() => {
    if (activeNav === 'chat' || activeNav === 'voice') {
      botRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [allMsgs.length, activeNav]);

  /* ── Send text ── */
  const doSend = useCallback(() => {
    const v = inputVal.trim();
    if (!v || chat.status === 'processing' || chat.status === 'speaking') return;
    chat.sendTextMessage(v);
    setInputVal('');
    if (activeNav !== 'chat') setActiveNav('chat');
    inpRef.current?.focus();
  }, [inputVal, chat, activeNav]);

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  /* ── Quick replies ── */
  const doQuickReply = t => {
    setActiveNav('chat');
    chat.sendTextMessage(t);
    setTimeout(() => inpRef.current?.focus(), 50);
  };

  /* ── Mic ── */
  const onMic = () => {
    if (isVoiceMode) {
      if (voice.status === 'idle') voice.startSession();
      else voice.endSession();
    } else {
      chat.handleMicTap();
    }
  };

  /* ── Voice mode via sidebar ── */
  const startVoice = () => {
    setActiveNav('voice');
    if (voice.status === 'idle') voice.startSession();
  };

  /* ── End all ── */
  const endAll = () => {
    voice.endSession?.();
    chat.endSession?.();
  };

  /* ── Language Switcher ── */
  const onSelectLang = (l) => {
    setSelectedLang(l.code);
    setLangOpen(false);
    if (chat.history.length === 0) {
      chat.sendTextMessage(l.greeting);
    }
  };

  /* ── Fullscreen toggle ── */
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const micActive = rawStatus === 'recording' || (isVoiceMode && rawStatus === 'listening');
  const micBusy   = rawStatus === 'processing' || rawStatus === 'connecting';

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`app ${themeDark ? '' : 'theme-soft'}`}>
      {/* ── Ambient blobs ── */}
      <div className="bg-fx" aria-hidden="true">
        <div className="bg-fx__b bg-fx__b--1" />
        <div className="bg-fx__b bg-fx__b--2" />
      </div>

      {/* ════════════════════ SIDEBAR ════════════════════ */}
      <aside className="sb">
        {/* Logo */}
        <div className="sb-logo">
          <div className="sb-logo__icon"><LotusIcon size={20} /></div>
          <div>
            <div className="sb-logo__name">Serenity<sup>°</sup></div>
            <div className="sb-logo__sub">Emotional AI Companion</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sb-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(n => (
            <button
              key={n.id}
              className={`sb-nav__item ${activeNav === n.id ? 'sb-nav__item--on' : ''}`}
              onClick={() => n.id === 'voice' ? startVoice() : setActiveNav(n.id)}
            >
              <span className="sb-nav__ico" aria-hidden="true">{n.ico}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {/* Languages */}
        <button
          className="sb-langs-hdr"
          onClick={() => setLangOpen(o => !o)}
          aria-expanded={langOpen}
        >
          <span>🌐</span>
          <span>Languages</span>
          <span className={`sb-langs-arr ${langOpen ? 'sb-langs-arr--open' : ''}`}>▾</span>
        </button>
        {langOpen && (
          <div className="sb-langs">
            {LANGS.map((l) => (
              <div
                key={l.code}
                className={`sb-langs__item ${selectedLang === l.code ? 'sb-langs__item--on' : ''}`}
                onClick={() => onSelectLang(l)}
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quote */}
        <div className="sb-quote">"You're not alone... ♡"</div>

        {/* User profile */}
        <div className="sb-user">
          <div className="sb-user__av">👤</div>
          <div className="sb-user__info">
            <div className="sb-user__name">Guest User<sup>°</sup></div>
            <div className="sb-user__status">
              <span className="sb-user__dot" />
              Online
            </div>
          </div>
          <button className="sb-user__out" onClick={endAll} title="Clear conversation & reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ════════════════════ MAIN CONTAINER ════════════════════ */}
      <main className="cm">

        {/* ── Header ── */}
        <div className="cm-hdr">
          <div className="cm-hdr__left">
            <h1 className="cm-hdr__title">
              Hello <span className="cm-hdr__hi">Friend!</span>
            </h1>
            <p className="cm-hdr__sub">Talk, share, and feel better...</p>
          </div>
          <div className="cm-hdr__right">
            <div className={`spill ${isActive ? 'spill--on' : ''}`} role="status">
              <span className="spill__dot" />
              <span className="spill__lbl">{statusLabel}</span>
              <Waveform active={isListening || isSpeaking} bars={5} />
            </div>
            <button
              className="hdr-ico-btn"
              title="Toggle theme tone"
              aria-label="Toggle theme tone"
              onClick={() => setThemeDark(d => !d)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" width="15" height="15">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
              </svg>
            </button>
            <button
              className="hdr-ico-btn"
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
              onClick={toggleFullscreen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" width="15" height="15">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Sub-view Switcher: Chat / Voice vs Journal / Settings / About ── */}
        {activeNav === 'journal' ? (
          <div className="aux-view">
            <div className="aux-card">
              <h2 className="aux-card__title">📊 Mood Journal</h2>
              <p className="aux-card__desc">Real-time emotional tracking during your conversations with Serenity.</p>
              
              <div className="journal-stat-row">
                <div className="journal-stat">
                  <div className="journal-stat__val">{mood.emoji}</div>
                  <div className="journal-stat__lbl">Current State</div>
                  <div className="journal-stat__sub" style={{ color: mood.color }}>{mood.label}</div>
                </div>
                <div className="journal-stat">
                  <div className="journal-stat__val">{moodHistory.length}</div>
                  <div className="journal-stat__lbl">Check-ins Logged</div>
                  <div className="journal-stat__sub">Active Session</div>
                </div>
              </div>

              <h3 className="aux-sec-h">Recent Emotion Timeline</h3>
              <div className="timeline-list">
                {moodHistory.slice(-6).reverse().map((m, idx) => (
                  <div key={idx} className="timeline-item">
                    <span className="timeline-dot" />
                    <span className="timeline-lbl">{m.label}</span>
                    <span className="timeline-time">{m.time}</span>
                  </div>
                ))}
              </div>

              <button className="aux-back-btn" onClick={() => setActiveNav('chat')}>
                ← Back to Chat Assistant
              </button>
            </div>
          </div>
        ) : activeNav === 'settings' ? (
          <div className="aux-view">
            <div className="aux-card">
              <h2 className="aux-card__title">⚙️ Settings</h2>
              <p className="aux-card__desc">Manage your voice companion preferences and session controls.</p>

              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <div className="settings-lbl">Primary Language</div>
                    <div className="settings-sub">Choose your default conversation language</div>
                  </div>
                  <select
                    className="settings-select"
                    value={selectedLang}
                    onChange={(e) => onSelectLang(LANGS.find(l => l.code === e.target.value) || LANGS[0])}
                  >
                    {LANGS.map(l => (
                      <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                    ))}
                  </select>
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-lbl">Audio Response Speech</div>
                    <div className="settings-sub">Read out empathetic replies automatically</div>
                  </div>
                  <button
                    className={`toggle-pill ${soundEnabled ? 'toggle-pill--on' : ''}`}
                    onClick={() => setSoundEnabled(s => !s)}
                  >
                    {soundEnabled ? 'Enabled' : 'Muted'}
                  </button>
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-lbl">Clear Session History</div>
                    <div className="settings-sub">Delete all temporary chat and mood records</div>
                  </div>
                  <button className="aux-danger-btn" onClick={endAll}>
                    Reset History
                  </button>
                </div>
              </div>

              <button className="aux-back-btn" onClick={() => setActiveNav('chat')}>
                ← Back to Chat Assistant
              </button>
            </div>
          </div>
        ) : activeNav === 'about' ? (
          <div className="aux-view">
            <div className="aux-card">
              <h2 className="aux-card__title">🌿 About Serenity</h2>
              <p className="aux-card__desc">An empathetic, privacy-first emotional AI companion open-sourced for everyone.</p>

              <div className="about-features">
                <div className="about-feat">
                  <span className="about-feat__ico">🌐</span>
                  <div>
                    <strong>Trilingual Fluency</strong>
                    <p>Native support for English, Sinhala (සිංහල), and Tamil (தமிழ்).</p>
                  </div>
                </div>
                <div className="about-feat">
                  <span className="about-feat__ico">🔒</span>
                  <div>
                    <strong>Zero-Retention Privacy</strong>
                    <p>All conversations remain temporary in your browser memory — nothing is sold or stored.</p>
                  </div>
                </div>
                <div className="about-feat">
                  <span className="about-feat__ico">🎙️</span>
                  <div>
                    <strong>Real-time Voice & Text</strong>
                    <p>Powered by Google Gemini multimodal models with live interruption support.</p>
                  </div>
                </div>
              </div>

              <button className="aux-back-btn" onClick={() => setActiveNav('chat')}>
                ← Back to Chat Assistant
              </button>
            </div>
          </div>
        ) : (
          /* ── Chat / Voice Body ── */
          <div className="cm-body">

            {/* Welcome Banner — shown while no user messages yet */}
            {!hasUserMsg && (
              <div className="wb" aria-label="Welcome to Serenity">
                <div className="wb__wave" aria-hidden="true">
                  <svg className="wb__wave-svg" viewBox="0 0 1200 160" preserveAspectRatio="none">
                    <path
                      d="M0 80C150 30,350 130,600 80C850 30,1050 130,1200 80
                         C1350 30,1550 130,1800 80L1800 160L0 160Z"
                      fill="rgba(0,230,118,0.055)"
                    />
                    <path
                      d="M0 105C200 55,400 145,600 105C800 55,1000 145,1200 105
                         L1200 160L0 160Z"
                      fill="rgba(0,230,118,0.03)"
                    />
                  </svg>
                </div>
                <div className="wb__content">
                  <div className="wb__lotus-wrap">
                    <div className="wb__ring" />
                    <div className="wb__ring wb__ring--2" />
                    <div className="wb__ring wb__ring--3" />
                    <LotusIcon size={56} className="wb__lotus" />
                  </div>
                  <h2 className="wb__title">
                    Your <em>Emotional</em> AI Companion
                  </h2>
                  <p className="wb__sub">
                    Talk freely... I'm here to listen, support and understand you. ♡
                  </p>
                  <div className="wb__pills">
                    <span className="wb-pill">♥ Feel Supported</span>
                    <span className="wb-pill">😊 Reduce Stress</span>
                    <span className="wb-pill">✨ Stay Positive</span>
                  </div>
                </div>
              </div>
            )}

            {/* Voice mode active indicator */}
            {isVoiceMode && isActive && (
              <div className="v-ind" role="status" aria-live="polite">
                <div className={`v-ind__dot v-ind__dot--${rawStatus}`} />
                <Waveform active={isListening || isSpeaking} bars={9} />
                <span className="v-ind__lbl">{statusLabel}</span>
              </div>
            )}

            {/* Messages */}
            <div className="msgs" role="log" aria-live="polite" aria-label="Conversation">
              {allMsgs.map(msg => {
                const txt = cleanText(msg.text);
                if (!txt) return null;
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`msg msg--${msg.role}`}>
                    {!isUser && (
                      <div className="msg__av" aria-hidden="true">
                        <LotusIcon size={15} />
                      </div>
                    )}
                    <div className="msg__body">
                      <div className="msg__bub">
                        {txt.split('\n').map((line, i, arr) => (
                          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                        ))}
                      </div>
                      <span className="msg__ts">{ftime(msg.time)}</span>
                      {/* Quick replies below the initial greeting */}
                      {msg.id === GREETING_ID && !hasUserMsg && (
                        <div className="qr-list" role="group" aria-label="Quick replies">
                          {QUICK_REPLIES.map(qr => (
                            <button key={qr} className="qr-btn" onClick={() => doQuickReply(qr)}>
                              {qr}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="msg__av msg__av--u" aria-hidden="true">
                        👤
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Error */}
              {error && (
                <div className="err-msg" role="alert">⚠ {error}</div>
              )}

              <div ref={botRef} />
            </div>
          </div>
        )}

        {/* ── Input Area ── */}
        <div className="cm-inp">
          <div className="inp-row">
            {/* Mic button */}
            <button
              className={`mic-btn ${micActive ? 'mic-btn--on' : ''} ${micBusy ? 'mic-btn--busy' : ''}`}
              onClick={onMic}
              aria-label={micActive ? 'Stop recording' : 'Start voice input'}
            >
              {micBusy ? (
                <span className="spin" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                  <path d="M19 11a7 7 0 01-14 0M12 18v4M8 22h8"
                    stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </button>

            {/* Text input */}
            <textarea
              ref={inpRef}
              className="inp-ta"
              placeholder="Type a message or press the mic..."
              rows={1}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={onKey}
              disabled={chat.status === 'processing' || chat.status === 'speaking'}
              aria-label="Message input"
            />

            {/* Send button */}
            <button
              className="send-btn"
              onClick={doSend}
              disabled={!inputVal.trim() || chat.status === 'processing'}
              aria-label="Send message"
            >
              {chat.status === 'processing' ? (
                <span className="spin" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"
                    fill="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
          <p className="inp-priv">🔒 Your privacy is our priority</p>
        </div>

      </main>

      {/* ════════════════════ RIGHT PANEL ════════════════════ */}
      <aside className="rp" aria-label="Serenity assistant panel">

        {/* Avatar */}
        <div className="rp-av-wrap">
          <div className="rp-av-ring rp-av-ring--outer" />
          <div className="rp-av-ring rp-av-ring--inner" />
          <div className={`rp-av ${isListening ? 'rp-av--l' : ''} ${isSpeaking ? 'rp-av--s' : ''}`}>
            <img src="/lotus.jpg" alt="Serenity" className="rp-av__img" />
          </div>
          {(isListening || isSpeaking) && <div className="rp-av-pulse" aria-hidden="true" />}
        </div>
        <p className="rp-name">Serenity</p>
        <p className="rp-tag">Always here for you ♡</p>

        {/* Current Mood */}
        <div className="rp-card">
          <p className="rp-card__h">Current Mood</p>
          <div className="rp-card__mood">
            <span className="rp-card__emo" role="img" aria-label={mood.label}>{mood.emoji}</span>
            <span className="rp-card__lbl" style={{ color: mood.color }}>{mood.label}</span>
            <div className="rp-card__wf">
              <Waveform active={isSpeaking} bars={4} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rp-actions">
          <p className="rp-actions__h">Quick Actions</p>
          <button className="rp-act" onClick={startVoice}>
            <span className="rp-act__ico">🎙️</span>Start Voice Chat
          </button>
          <button className="rp-act" onClick={() => { setActiveNav('chat'); setTimeout(() => inpRef.current?.focus(), 50); }}>
            <span className="rp-act__ico">💭</span>Share Your Thoughts
          </button>
          <button className="rp-act" onClick={() => doQuickReply('I need some support and guidance right now.')}>
            <span className="rp-act__ico">♥</span>Get Support
          </button>
        </div>

        {/* Decorative scenery */}
        <div className="rp-art" aria-hidden="true">
          <svg viewBox="0 0 200 100" width="100%">
            <ellipse cx="100" cy="96" rx="98" ry="4" fill="currentColor" opacity="0.2" />
            <rect x="28" y="55" width="5" height="40" rx="2.5" fill="currentColor" opacity="0.25" />
            <ellipse cx="30.5" cy="45" rx="20" ry="25" fill="currentColor" opacity="0.2" />
            <ellipse cx="30.5" cy="45" rx="13" ry="18" fill="var(--bg2)" opacity="0.5" />
            <circle cx="155" cy="78" r="6.5" fill="currentColor" opacity="0.25" />
            <path d="M148 87Q155 100 162 87Q158 93 155 97Q152 93 148 87Z"
              fill="currentColor" opacity="0.2" />
            <path d="M168 20A14 14 0 1 1 182 34A10 10 0 1 0 168 20Z"
              fill="currentColor" opacity="0.12" />
          </svg>
        </div>

      </aside>
    </div>
  );
}
