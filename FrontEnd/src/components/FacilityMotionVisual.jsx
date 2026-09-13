import { useEffect, useRef, useState } from 'react';
import { Rotate3D } from 'lucide-react';
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion } from 'motion/react';

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
  const dragRef = useRef(null);
  const returnAnimationRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const reduceMotion = useReducedMotion();
  const rotation = useMotionValue(0);
  const objectTransform = useMotionTemplate`rotateY(${rotation}deg)`;
  const kind = String(type || '').toLowerCase();
  const normalized = kind.includes('court') ? 'court' : kind.includes('ktv') ? 'ktv' : 'billiards';
  const displayLabel = label || normalized;

  function settleToFront() {
    dragRef.current = null;
    setIsDragging(false);
    returnAnimationRef.current?.stop();
    if (reduceMotion) {
      rotation.set(0);
      return;
    }
    returnAnimationRef.current = animate(rotation, 0, {
      type: 'spring',
      duration: 0.5,
      bounce: 0.2,
    });
  }

  function handlePointerDown(event) {
    if (reduceMotion || event.button !== 0 || dragRef.current) return;
    returnAnimationRef.current?.stop();
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotation.get(),
      width: Math.max(bounds.width, 1),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextRotation = drag.startRotation + ((event.clientX - drag.startX) / drag.width) * 360;
    rotation.set(Math.max(-360, Math.min(360, nextRotation)));
  }

  function handlePointerEnd(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    settleToFront();
  }

  function handleKeyDown(event) {
    if (reduceMotion || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    returnAnimationRef.current?.stop();
    setIsDragging(true);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    rotation.set(Math.max(-360, Math.min(360, rotation.get() + direction * 24)));
  }

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

  useEffect(() => () => returnAnimationRef.current?.stop(), []);

  return (
    <figure
      ref={figureRef}
      className={`facility-motion facility-motion--${normalized}${isVisible ? '' : ' is-paused'}${isDragging ? ' is-dragging' : ''}`}
      role="group"
      tabIndex={reduceMotion ? -1 : 0}
      aria-label={reduceMotion
        ? `${displayLabel} dimensional room preview`
        : `${displayLabel} interactive dimensional room preview. Hold and drag left or right to rotate it; release to return to the front.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => {
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) settleToFront();
      }}
      onBlur={settleToFront}
    >
      <div className="facility-motion-atmosphere" aria-hidden="true">
        <span className="facility-motion-halo" />
        <span className="facility-motion-orbit facility-motion-orbit--one" />
        <span className="facility-motion-orbit facility-motion-orbit--two" />
      </div>
      <div className="facility-motion-stage" aria-hidden="true">
        <div className="facility-motion-auto-orbit">
          <motion.div className="facility-motion-object" style={{ transform: objectTransform }}>
            <span className="facility-motion-plinth" />
            {normalized === 'billiards' && <BilliardsModel />}
            {normalized === 'court' && <CourtModel />}
            {normalized === 'ktv' && <KtvModel />}
          </motion.div>
        </div>
      </div>
      <figcaption>
        <span>{displayLabel}</span>
        <small>{reduceMotion ? 'Dimensional preview' : <><Rotate3D size={13} aria-hidden="true" /> Hold + drag · 360°</>}</small>
      </figcaption>
    </figure>
  );
}

export default FacilityMotionVisual;
