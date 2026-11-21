import { useEffect, useRef } from 'react';
import EmotionBadge from './EmotionBadge';

/**
 * Strips internal thought tags and raw JSON wrappers from displayed text
 */
function cleanText(raw) {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/^(?:thought|thinking(?:\s+process)?):\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/i, '');
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { const p = JSON.parse(jsonMatch[1]); if (p.reply) text = p.reply; } catch {}
  } else if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try { const p = JSON.parse(text.trim()); if (p.reply) text = p.reply; } catch {}
  }
  return text.trim();
}

/**
 * ChatHistory — Scrollable conversation transcript
 */
export default function ChatHistory({ history }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history]);

  const visible = history.filter(msg => cleanText(msg.text).length > 0);

  if (visible.length === 0) {
    return (
      <div className="chat-empty" aria-live="polite" aria-label="No messages yet">
        <div className="chat-empty__icon" aria-hidden="true">🌿</div>
        <p className="chat-empty__text">
          Start talking and your conversation will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="chat-history"
      role="log"
      aria-label="Conversation transcript"
      aria-live="polite"
    >
      {visible.map((msg) => {
        const text = cleanText(msg.text);
        return (
          <div key={msg.id} className={`message message--${msg.role}`}>
            <div className="message__meta">
              {msg.role === 'user' ? (
                <span>You</span>
              ) : (
                <>
                  <span>Serenity</span>
                  {msg.emotion && <EmotionBadge emotion={msg.emotion} />}
                </>
              )}
            </div>
            <div className="message__bubble">{text}</div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
