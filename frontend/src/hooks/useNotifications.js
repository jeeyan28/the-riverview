import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/api';

export function refreshNotifications() {
  window.dispatchEvent(new Event('riverview-notifications-updated'));
}

export function useNotifications(userId) {
  const [state, setState] = useState({ key: null, items: [], unreadCount: 0, loading: false, error: '' });
  const currentKey = useRef(userId);
  const controller = useRef(null);
  currentKey.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const data = await apiRequest('/api/notifications', { signal: request.signal, fallbackMessage: 'Could not load your notifications.' });
      if (!request.signal.aborted && currentKey.current === userId) setState({ key: userId, items: data.items || [], unreadCount: data.unreadCount || 0, loading: false, error: '' });
    } catch (error) {
      if (!request.signal.aborted && currentKey.current === userId) setState(previous => ({ ...(previous.key === userId ? previous : { key: userId, items: [], unreadCount: 0 }), loading: false, error: error.message }));
    }
  }, [userId]);

  useEffect(() => {
    setState({ key: userId, items: [], unreadCount: 0, loading: Boolean(userId), error: '' });
    if (!userId) return;
    refresh();
    const onFocus = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('riverview-notifications-updated', refresh);
    return () => {
      controller.current?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('riverview-notifications-updated', refresh);
    };
  }, [userId, refresh]);

  async function markRead(id) {
    if (!userId) return;
    await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} });
    await refresh();
  }
  async function markAllRead() {
    if (!userId) return;
    await apiRequest('/api/notifications/read-all', { method: 'POST', body: {} });
    await refresh();
  }

  const { key: stateKey, ...visibleState } = state;
  return { ...(stateKey === userId ? visibleState : { items: [], unreadCount: 0, loading: Boolean(userId), error: '' }), refresh, markRead, markAllRead };
}
