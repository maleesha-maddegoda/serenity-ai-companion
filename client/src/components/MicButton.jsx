/**
 * MicButton — Animated tap-to-speak button
 * States: idle | recording | processing
 */
export default function MicButton({ status, onClick }) {
  const isRecording  = status === 'recording';
  const isProcessing = status === 'processing';
  const isDisabled   = isProcessing || status === 'speaking';

  const btnClass = [
    'mic-btn',
    isRecording  ? 'mic-btn--recording'  : '',
    isProcessing ? 'mic-btn--processing' : '',
    (!isRecording && !isProcessing) ? 'mic-btn--idle' : '',
  ].filter(Boolean).join(' ');

  const wrapperClass = `mic-btn-wrapper ${isRecording ? 'recording' : ''}`;

  return (
    <div className={wrapperClass}>
      <button
        id="mic-button"
        className={btnClass}
        onClick={onClick}
        disabled={isDisabled}
        aria-label={
          isRecording  ? 'Stop recording' :
          isProcessing ? 'Processing…' :
          'Start recording'
        }
        title={
          isRecording  ? 'Tap to send' :
          isProcessing ? 'Processing your message…' :
          'Tap to speak'
        }
      >
        {isProcessing ? (
          <span className="mic-btn__spinner" aria-hidden="true" />
        ) : (
          <span className="mic-btn__icon" aria-hidden="true">
            {isRecording ? '⏹' : '🎙️'}
          </span>
        )}
      </button>
    </div>
  );
}
