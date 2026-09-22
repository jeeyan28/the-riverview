import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../services/api';

const READ_KEY = 'riverview-announcements-read';

function storageKey(accountId) {
  return accountId ? `${READ_KEY}:${accountId}` : null;
}

function loadReadIds(key) {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveReadIds(key, ids) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Read state still lasts for this page when storage is unavailable.
  }
}

export function useAnnouncements(announcements, accountId) {
  const key = storageKey(accountId);
  const [readState, setReadState] = useState(() => ({ key, ids: loadReadIds(key) }));
  const readIds = readState.key === key ? readState.ids : loadReadIds(key);

  const sorted = useMemo(() => {
    const list = Array.isArray(announcements) ? announcements : [];
    return [...list].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [announcements]);

  useEffect(() => {
    setReadState({ key, ids: loadReadIds(key) });
    function syncReadState(event) {
      if (event.key === key) setReadState({ key, ids: loadReadIds(key) });
    }
    window.addEventListener('storage', syncReadState);
    return () => window.removeEventListener('storage', syncReadState);
  }, [key]);

  useEffect(() => {
    if (readState.key === key) saveReadIds(key, readState.ids);
  }, [readState, key]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    async function syncAccountReads() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/settings/announcements/read`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted) return;
        const remoteIds = Array.isArray(data.ids) ? data.ids.map(String) : [];
        setReadState(prev => {
          if (prev.key !== key) return prev;
          const ids = [...new Set([...prev.ids, ...remoteIds])];
          return { key, ids };
        });
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      }
    }
    syncAccountReads();
    return () => controller.abort();
  }, [key]);

  const readSet = useMemo(() => new Set(readIds), [readIds]);

  const items = useMemo(
    () => sorted.map(a => ({ ...a, isRead: readSet.has(String(a._id)) })),
    [sorted, readSet]
  );

  const unreadCount = useMemo(
    () => items.reduce((count, a) => (a.isRead ? count : count + 1), 0),
    [items]
  );

  function markRead(id) {
    const strId = String(id);
    setReadState(prev => {
      const current = prev.key === key ? prev.ids : loadReadIds(key);
      if (current.includes(strId)) return prev;
      const ids = [...current, strId];
      return { key, ids };
    });
    if (key) {
      fetch(`${API_BASE_URL}/api/settings/announcements/${encodeURIComponent(strId)}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(console.error);
    }
  }

  return { items, unreadCount, markRead };
}
