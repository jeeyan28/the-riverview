import { Check, CircleAlert } from 'lucide-react';

function RiverviewLoader({
  title = 'The Riverview',
  message = 'Preparing your experience…',
  state = 'loading',
  fullscreen = true,
}) {
  const isComplete = state === 'success';
  const isError = state === 'error';

  return (
    <div
      className={`rv-loader${fullscreen ? ' rv-loader--screen' : ' rv-loader--inline'} is-${state}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="rv-loader-card">
        <div className="rv-loader-scene" aria-hidden="true">
          <span className="rv-loader-glow" />
          <div className="rv-loader-table">
            <span className="rv-loader-felt" />
            <span className="rv-loader-pocket rv-loader-pocket--one" />
            <span className="rv-loader-pocket rv-loader-pocket--two" />
            <span className="rv-loader-pocket rv-loader-pocket--three" />
            <span className="rv-loader-pocket rv-loader-pocket--four" />
            <span className="rv-loader-track" />
            <span className="rv-loader-ball"><b>8</b></span>
          </div>
          {(isComplete || isError) && (
            <span className="rv-loader-state-icon">
              {isComplete ? <Check size={22} /> : <CircleAlert size={22} />}
            </span>
          )}
        </div>

        <div className="rv-loader-copy">
          <strong>{title}</strong>
          <span>{message}</span>
        </div>

        <span className="rv-loader-line" aria-hidden="true"><i /></span>
      </div>
    </div>
  );
}

export default RiverviewLoader;
