import { useEffect, useMemo, useState } from 'react';

const READ_KEY = 'riverview-announcements-read';

function loadReadIds() {
  try {
    const raw = sessionStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids) {
  sessionStorage.setItem(READ_KEY, JSON.stringify(ids));
}

export function useAnnouncements(announcements) {
  const [readIds, setReadIds] = useState(loadReadIds);

  const sorted = useMemo(() => {
    const list = Array.isArray(announcements) ? announcements : [];
    return [...list].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [announcements]);

  useEffect(() => {
    const validIds = new Set(sorted.map(a => String(a._id)));
    setReadIds(prev => {
      const filtered = prev.filter(id => validIds.has(id));
      if (filtered.length !== prev.length) {
        saveReadIds(filtered);
        return filtered;
      }
      return prev;
    });
  }, [sorted]);

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
    setReadIds(prev => {
      if (prev.includes(strId)) return prev;
      const next = [...prev, strId];
      saveReadIds(next);
      return next;
    });
  }

  return { items, unreadCount, markRead };
}