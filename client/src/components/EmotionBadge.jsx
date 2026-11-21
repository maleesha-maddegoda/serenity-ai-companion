/**
 * EmotionBadge — Displays the detected emotion with a matching colour and icon.
 * English labels only.
 */
const EMOTION_MAP = {
  stressed:    { emoji: '😤', label: 'Stressed',    color: 'var(--e-stressed)' },
  anxious:     { emoji: '😰', label: 'Anxious',     color: 'var(--e-anxious)' },
  sad:         { emoji: '😢', label: 'Sad',          color: 'var(--e-sad)' },
  angry:       { emoji: '😠', label: 'Angry',        color: 'var(--e-angry)' },
  lonely:      { emoji: '🫂', label: 'Lonely',       color: 'var(--e-lonely)' },
  overwhelmed: { emoji: '🌊', label: 'Overwhelmed',  color: 'var(--e-overwhelmed)' },
  happy:       { emoji: '😊', label: 'Happy',        color: 'var(--e-happy)' },
  hopeful:     { emoji: '🌱', label: 'Hopeful',      color: 'var(--e-hopeful)' },
  confused:    { emoji: '🤔', label: 'Confused',     color: 'var(--e-confused)' },
  fearful:     { emoji: '😨', label: 'Fearful',      color: 'var(--e-fearful)' },
  grieving:    { emoji: '💔', label: 'Grieving',     color: 'var(--e-grieving)' },
  neutral:     { emoji: '😶', label: 'Neutral',      color: 'var(--e-neutral)' },
};

export default function EmotionBadge({ emotion }) {
  if (!emotion) return null;
  const key    = emotion.toLowerCase();
  const config = EMOTION_MAP[key] || { emoji: '💭', label: emotion, color: 'var(--text-muted)' };

  return (
    <span
      className="emotion-badge"
      style={{
        color:           config.color,
        borderColor:     config.color + '55',
        backgroundColor: config.color + '18',
      }}
      aria-label={`Detected emotion: ${config.label}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}
