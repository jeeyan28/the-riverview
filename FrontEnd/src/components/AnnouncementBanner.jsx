import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Megaphone, X } from 'lucide-react';

const ANNOUNCEMENT_ROTATION_MS = 5000;

function AnnouncementBanner({ announcements = [], onHeightChange }) {
  const [dismissedIds, setDismissedIds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [textOverflows, setTextOverflows] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [rotationCycle, setRotationCycle] = useState(0);
  const bannerRef = useRef(null);
  const copyRef = useRef(null);
  const items = useMemo(() => (
    [...(Array.isArray(announcements) ? announcements : [])]
      .filter((item) => !dismissedIds.includes(item._id))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  ), [announcements, dismissedIds]);
  const selectedIndex = Math.max(0, items.findIndex((item) => item._id === selectedId));
  const announcement = items[selectedIndex];
  const isRotating = items.length > 1 && pageVisible && !expanded;

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!isRotating) return;
    setRotationCycle((cycle) => cycle + 1);
    const timer = window.setTimeout(() => {
      setSelectedId(items[(selectedIndex + 1) % items.length]._id);
    }, ANNOUNCEMENT_ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [items, selectedIndex, isRotating]);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) {
      onHeightChange(0);
      return;
    }

    function measure() {
      onHeightChange(banner.getBoundingClientRect().height);
      if (!expanded && copyRef.current) {
        setTextOverflows(copyRef.current.scrollWidth > copyRef.current.clientWidth);
      }
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    observer.observe(copyRef.current);
    return () => observer.disconnect();
  }, [announcement, expanded, onHeightChange]);

  function changeAnnouncement(direction) {
    const nextIndex = (selectedIndex + direction + items.length) % items.length;
    setSelectedId(items[nextIndex]._id);
    setExpanded(false);
  }

  if (!announcement) return null;

  return (
    <aside
      ref={bannerRef}
      className={`announcement-banner${expanded ? ' is-expanded' : ''}`}
      aria-label="Venue announcements"
    >
      <div className="announcement-banner-inner">
        <span className="announcement-banner-label">
          <Megaphone size={18} aria-hidden="true" />
          <span>Announcement</span>
        </span>

        <div className="announcement-banner-content" aria-live={isRotating ? 'off' : 'polite'} aria-atomic="true">
          <p ref={copyRef} id="announcement-banner-copy" className="announcement-banner-copy">
            <strong>{announcement.title}</strong>
            <span className="announcement-banner-message">{announcement.message}</span>
          </p>
        </div>

        <div className="announcement-banner-actions">
          {textOverflows && (
            <button
              type="button"
              className="announcement-banner-expand"
              aria-expanded={expanded}
              aria-controls="announcement-banner-copy"
              aria-label={expanded ? 'Collapse announcement' : 'Read full announcement'}
              onClick={() => setExpanded((value) => !value)}
            >
              <span>{expanded ? 'Show less' : 'Read more'}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
          {items.length > 1 && (
            <div className="announcement-banner-pagination" aria-label="Announcement navigation">
              <button type="button" className="announcement-banner-previous" aria-label="Previous announcement" onClick={() => changeAnnouncement(-1)}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="announcement-banner-count" aria-label={`Announcement ${selectedIndex + 1} of ${items.length}`}>
                {selectedIndex + 1}/{items.length}
              </span>
              <button type="button" aria-label="Next announcement" onClick={() => changeAnnouncement(1)}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            type="button"
            className="announcement-banner-dismiss"
            aria-label={`Dismiss announcement: ${announcement.title}`}
            onClick={() => {
              setDismissedIds((ids) => [...ids, announcement._id]);
              setExpanded(false);
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="announcement-banner-progress" aria-hidden="true">
          {isRotating && <span key={`${announcement._id}:${rotationCycle}`} style={{ animationDuration: `${ANNOUNCEMENT_ROTATION_MS}ms` }} />}
        </div>
      )}
    </aside>
  );
}

export default AnnouncementBanner;
