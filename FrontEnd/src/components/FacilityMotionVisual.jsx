import { useEffect, useRef, useState } from 'react';

const POCKETS = ['one', 'two', 'three', 'four', 'five', 'six'];

function BilliardsModel() {
  return (
    <div className="pool-model">
      <span className="model-ground-shadow" />
      <span className="pool-leg pool-leg--left" />
      <span className="pool-leg pool-leg--center" />
      <span className="pool-leg pool-leg--right" />
      <div className="pool-cabinet">
        <span className="pool-apron pool-apron--front" />
        <span className="pool-apron pool-apron--right" />
        <div className="pool-tabletop">
          <span className="pool-wood" />
          <span className="pool-felt" />
          {POCKETS.map((pocket) => <span key={pocket} className={`pool-pocket pool-pocket--${pocket}`} />)}
          <span className="pool-ball pool-ball--cue"><i /></span>
          <span className="pool-ball pool-ball--one"><i>1</i></span>
          <span className="pool-ball pool-ball--eight"><i>8</i></span>
          <span className="pool-ball pool-ball--nine"><i>9</i></span>
          <span className="pool-cue" />
        </div>
      </div>
      <span className="pool-light-cord" />
      <span className="pool-light"><i /></span>
    </div>
  );
}

function CourtModel() {
  return (
    <div className="court-model">
      <span className="model-ground-shadow" />
      <div className="court-slab">
        <span className="court-side court-side--front" />
        <span className="court-side court-side--right" />
        <div className="court-surface">
          <span className="court-mark court-mark--boundary" />
          <span className="court-mark court-mark--midline" />
          <span className="court-mark court-mark--circle" />
          <span className="court-mark court-mark--key" />
          <span className="court-mark court-mark--arc" />
        </div>
      </div>
      <div className="court-hoop-model">
        <span className="court-pole" />
        <span className="court-pole-base" />
        <span className="court-backboard"><i /></span>
        <span className="court-rim"><i /></span>
      </div>
      <span className="court-ball"><i /><b /></span>
      <span className="court-ball-shadow" />
    </div>
  );
}

function KtvModel() {
  return (
    <div className="ktv-model">
      <span className="model-ground-shadow" />
      <span className="ktv-beam ktv-beam--one" />
      <span className="ktv-beam ktv-beam--two" />
      <div className="ktv-stage">
        <span className="ktv-stage-front" />
        <span className="ktv-stage-right" />
      </div>
      <div className="ktv-screen">
        <span className="ktv-screen-wave ktv-screen-wave--one" />
        <span className="ktv-screen-wave ktv-screen-wave--two" />
        <span className="ktv-screen-wave ktv-screen-wave--three" />
      </div>
      <div className="ktv-sofa"><span /><i /></div>
      <div className="ktv-speaker ktv-speaker--left"><span /><i /></div>
      <div className="ktv-speaker ktv-speaker--right"><span /><i /></div>
      <div className="ktv-microphone"><span className="ktv-mic-head" /><span className="ktv-mic-handle" /></div>
      <span className="ktv-mic-shadow" />
    </div>
  );
}

function FacilityMotionVisual({ type, label }) {
  const figureRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const kind = String(type || '').toLowerCase();
  const normalized = kind.includes('court') ? 'court' : kind.includes('ktv') ? 'ktv' : 'billiards';
  const displayLabel = label || normalized;

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '120px 0px', threshold: 0.05 },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={figureRef}
      className={`facility-motion facility-motion--${normalized}${isVisible ? '' : ' is-paused'}`}
      aria-label={`${displayLabel} dimensional room preview`}
    >
      <div className="facility-motion-atmosphere" aria-hidden="true">
        <span className="facility-motion-halo" />
        <span className="facility-motion-orbit facility-motion-orbit--one" />
        <span className="facility-motion-orbit facility-motion-orbit--two" />
      </div>
      <div className="facility-motion-stage" aria-hidden="true">
        <div className="facility-motion-object">
          {normalized === 'billiards' && <BilliardsModel />}
          {normalized === 'court' && <CourtModel />}
          {normalized === 'ktv' && <KtvModel />}
        </div>
      </div>
      <figcaption><span>{displayLabel}</span><small>Dimensional preview</small></figcaption>
    </figure>
  );
}

export default FacilityMotionVisual;
