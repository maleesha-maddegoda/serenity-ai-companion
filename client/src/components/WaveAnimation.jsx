/**
 * WaveAnimation — Animated audio wave bars shown while recording
 */
const BAR_COUNT = 9;
const DELAYS = [0, 0.15, 0.3, 0.45, 0.6, 0.45, 0.3, 0.15, 0];
const HEIGHTS = [16, 22, 30, 36, 40, 36, 30, 22, 16];

export default function WaveAnimation({ active }) {
  if (!active) return null;

  return (
    <div className="wave-container" aria-label="Recording in progress" role="status">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            height: `${HEIGHTS[i]}px`,
            animationDelay: `${DELAYS[i]}s`,
            animationDuration: `${0.8 + (i % 3) * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
