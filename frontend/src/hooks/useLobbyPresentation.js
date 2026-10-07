import { useEffect, useRef, useState } from 'react';
import { LobbyPresentationController, receiveLobbyPresentation } from '../services/lobbyPresentation';
import { lobbyPresentationSupport } from '../utils/lobbyPresentation';

export function useLobbyPresentation(snapshot, enabled) {
  const controller = useRef(null);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const [status, setStatus] = useState(() => ({ ...lobbyPresentationSupport(), phase: 'idle', availability: 'unknown', canStop: false }));

  useEffect(() => {
    if (!enabled) return undefined;
    let current;
    const prepare = () => {
      current = new LobbyPresentationController(window, setStatus);
      controller.current = current;
      current.setSnapshot(latestSnapshot.current);
      current.observeAvailability();
    };
    prepare();
    const leave = () => current.dispose();
    const restore = (event) => { if (event.persisted) prepare(); };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      current.dispose();
      controller.current = null;
    };
  }, [enabled]);

  useEffect(() => { controller.current?.setSnapshot(snapshot); }, [snapshot]);

  return {
    ...status,
    start: () => controller.current?.start(),
    stop: () => controller.current?.stop(),
  };
}

export function useLobbyPresentationReceiver() {
  const [snapshot, setSnapshot] = useState(null);
  const [message, setMessage] = useState('Waiting for the dashboard from the laptop…');
  const [receivedAt, setReceivedAt] = useState(null);
  useEffect(() => receiveLobbyPresentation(navigator.presentation.receiver, (next) => {
    setSnapshot(next);
    setReceivedAt(next ? Date.now() : null);
  }, setMessage), []);
  return { snapshot, message, receivedAt };
}
