import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTime } from '../api.js';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { Cover } from './common.jsx';
import Icon from './Icon.jsx';
import { useTrackActions } from './TrackActions.jsx';

export function Equalizer() {
  return (
    <span className="eq eq-small" aria-label="بيشتغل دلوقتي">
      <i />
      <i />
      <i />
    </span>
  );
}

export function TrackMeta({ track }) {
  return (
    <span className="track-meta">
      {track.artist ? <Link to={`/artist/${track.artist.id}`}>{track.artist.name}</Link> : null}
      {track.artist && track.work ? ' · ' : null}
      {track.work ? <Link to={`/work/${track.work.id}`}>{track.work.title}</Link> : null}
    </span>
  );
}

export function FavoriteButton({ track, size = 18 }) {
  const { user, favoriteIds, toggleFavorite } = useAuth();
  const toast = useToast();
  // Live external radio has no track to favorite.
  if (!track?.id) return null;
  const on = favoriteIds.has(track.id);
  return (
    <button
      type="button"
      className={`icon-btn fav-btn ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'شيل من المفضلة' : 'ضيف للمفضلة'}
      onClick={(e) => {
        e.stopPropagation();
        if (!user) {
          toast('سجل دخول عشان تحفظ المفضلة');
          return;
        }
        toggleFavorite(track.id).catch((err) => toast(err.message, 'error'));
      }}
    >
      <Icon name="heart" size={size} filled={on} />
    </button>
  );
}

export function TrackMenu({ track, extra }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const player = usePlayer();
  const actions = useTrackActions();
  const toast = useToast();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label="خيارات" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={pick(() => { player.playNext(track); toast('هتشتغل بعد الحالية'); })}>
            <Icon name="next" size={16} /> شغلها بعد الحالية
          </button>
          <button role="menuitem" onClick={pick(() => { player.addToQueue(track); toast('اتضافت لقائمة الانتظار'); })}>
            <Icon name="queue" size={16} /> ضيف لقائمة الانتظار
          </button>
          <button role="menuitem" onClick={pick(() => actions.openAddToPlaylist(track))}>
            <Icon name="plus" size={16} /> ضيف لقائمة تشغيل
          </button>
          <Link role="menuitem" to={`/track/${track.id}`} onClick={() => setOpen(false)}>
            <Icon name="music" size={16} /> تفاصيل الأغنية
          </Link>
          {extra?.map((x) => (
            <button key={x.label} role="menuitem" onClick={pick(x.onClick)}>
              <Icon name={x.icon || 'close'} size={16} /> {x.label}
            </button>
          ))}
          <button role="menuitem" onClick={pick(() => actions.openReport(track))}>
            <Icon name="flag" size={16} /> إبلاغ عن مشكلة
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Vertical list of tracks. Clicking a row plays the whole list from that row. */
export function TrackList({ tracks, source, numbered = true, extraActions, showCover = true }) {
  const player = usePlayer();
  if (!tracks?.length) return null;
  return (
    <ol className="track-list">
      {tracks.map((t, i) => {
        const active = player.mode === 'queue' && player.current?.id === t.id;
        return (
          <li
            key={`${t.id}-${i}`}
            className={`track-row ${active ? 'active' : ''}`}
            onDoubleClick={() => player.playList(tracks, i, source)}
          >
            <button
              type="button"
              className="track-index"
              aria-label={`شغل ${t.title}`}
              onClick={() => (active ? player.toggle() : player.playList(tracks, i, source))}
            >
              {active && player.isPlaying ? <Equalizer /> : <span className="num">{numbered ? i + 1 : ''}</span>}
              <span className="play-hover">
                <Icon name={active && player.isPlaying ? 'pause' : 'play'} size={16} />
              </span>
            </button>
            {showCover ? <Cover src={t.cover} size={44} seed={t.id} /> : null}
            <div className="track-text">
              <Link to={`/track/${t.id}`} className="track-title">
                {t.title}
              </Link>
              <TrackMeta track={t} />
            </div>
            <span className="track-duration">{formatTime(t.duration)}</span>
            <FavoriteButton track={t} />
            <TrackMenu track={t} extra={extraActions?.(t, i)} />
          </li>
        );
      })}
    </ol>
  );
}

/** Square card for horizontal shelves. */
export function TrackCard({ track, list, index, source }) {
  const player = usePlayer();
  const active = player.mode === 'queue' && player.current?.id === track.id;
  return (
    <div className={`card ${active ? 'active' : ''}`}>
      <div className="card-cover">
        <Cover src={track.cover} seed={track.id} />
        <button
          type="button"
          className="card-play"
          aria-label={`شغل ${track.title}`}
          onClick={() => (active ? player.toggle() : player.playList(list || [track], index || 0, source))}
        >
          <Icon name={active && player.isPlaying ? 'pause' : 'play'} size={22} />
        </button>
      </div>
      <Link to={`/track/${track.id}`} className="card-title">
        {track.title}
      </Link>
      <div className="card-sub">{track.work?.title || track.artist?.name || ' '}</div>
    </div>
  );
}

/**
 * Horizontal row of cards with no visible scrollbar: arrow buttons (desktop),
 * faded edges where more cards are hidden, mouse drag, and page dots.
 */
export function Shelf({ children, className = '' }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [pages, setPages] = useState({ count: 1, current: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    // Hidden or not-yet-laid-out shelves report a tiny width; show no dots then. Cap at 8 dots.
    const count = max > 4 && el.clientWidth > 80 ? Math.min(8, Math.ceil(el.scrollWidth / el.clientWidth)) : 1;
    setEdges({ start: pos <= 4, end: pos >= max - 4 });
    setPages({ count, current: max > 4 ? Math.round((pos / max) * (count - 1)) : 0 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  // In RTL the "forward" direction is towards negative scrollLeft.
  const sign = () => (ref.current && getComputedStyle(ref.current).direction === 'rtl' ? -1 : 1);

  const go = (dir) => {
    const el = ref.current;
    el.scrollBy({ left: el.clientWidth * 0.85 * dir * sign(), behavior: 'smooth' });
  };

  const goTo = (i) => {
    const el = ref.current;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: ((max * i) / Math.max(1, pages.count - 1)) * sign(), behavior: 'smooth' });
  };

  // Drag to scroll with the mouse (touch already scrolls natively).
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      ref.current.classList.add('dragging');
      ref.current.setPointerCapture(d.id);
    }
    if (d.moved) ref.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    ref.current.classList.remove('dragging');
    if (d.moved) {
      // Swallow the click that follows a drag so cards don't open by accident.
      const swallow = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      ref.current.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => ref.current?.removeEventListener('click', swallow, { capture: true }), 50);
    }
    drag.current = null;
  };

  return (
    <div className={`shelf-wrap ${edges.start ? 'at-start' : ''} ${edges.end ? 'at-end' : ''}`}>
      <button type="button" className="shelf-arrow shelf-prev" onClick={() => go(-1)} disabled={edges.start} aria-label="اللي قبل">
        <Icon name="back" size={22} />
      </button>
      <div
        ref={ref}
        className={`shelf ${className}`}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
      <button type="button" className="shelf-arrow shelf-next" onClick={() => go(1)} disabled={edges.end} aria-label="اللي بعد">
        <Icon name="back" size={22} className="flip-x" />
      </button>
      {pages.count > 1 ? (
        <div className="shelf-dots" role="tablist" aria-label="الصفحات">
          {Array.from({ length: pages.count }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === pages.current}
              aria-label={`صفحة ${i + 1}`}
              className={i === pages.current ? 'on' : ''}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TrackShelf({ tracks, source }) {
  if (!tracks?.length) return null;
  return (
    <Shelf>
      {tracks.map((t, i) => (
        <TrackCard key={t.id} track={t} list={tracks} index={i} source={source} />
      ))}
    </Shelf>
  );
}

export function WorkCard({ work }) {
  return (
    <Link to={`/work/${work.id}`} className="card">
      <div className="card-cover">
        <Cover src={work.cover} seed={work.id + 3} />
      </div>
      <div className="card-title">{work.title}</div>
      <div className="card-sub">
        {work.year || ''} {work.trackCount ? `· ${work.trackCount} أغنية` : ''}
      </div>
    </Link>
  );
}

export function ArtistCard({ artist }) {
  return (
    <Link to={`/artist/${artist.id}`} className="card artist-card">
      <div className="card-cover round-cover">
        <Cover src={artist.photo} round seed={artist.id + 7} />
      </div>
      <div className="card-title">{artist.name}</div>
      <div className="card-sub">{artist.trackCount ? `${artist.trackCount} أغنية` : 'فنان'}</div>
    </Link>
  );
}

export function PlaylistCard({ playlist }) {
  const covers = playlist.covers || [];
  return (
    <Link to={`/playlist/${playlist.id}`} className="card">
      <div className="card-cover mosaic">
        {covers.length >= 4 ? (
          covers.slice(0, 4).map((c) => <img key={c} src={c} alt="" loading="lazy" />)
        ) : (
          <Cover src={covers[0]} seed={playlist.id + 11} />
        )}
      </div>
      <div className="card-title">{playlist.title}</div>
      <div className="card-sub">{playlist.description || `${playlist.trackCount ?? 0} أغنية`}</div>
    </Link>
  );
}

export function StationCard({ station, onPlay }) {
  const player = usePlayer();
  const live = player.mode === 'radio' && player.radio?.slug === station.slug;
  return (
    <div className={`station-card ${live ? 'live' : ''}`} style={{ '--station': station.color }}>
      <div className="station-top">
        {station.logo ? <img className="station-logo" src={station.logo} alt="" loading="lazy" /> : null}
        <Link to={`/radio/${station.slug}`} className="station-name">
          {station.name}
        </Link>
      </div>
      <p className="station-desc">{station.description}</p>
      <div className="station-foot">
        <button
          type="button"
          className="station-play"
          aria-label={`شغل محطة ${station.name}`}
          onClick={() => (live ? player.toggle() : (onPlay || player.playStation)(station.slug))}
        >
          <Icon name={live && player.isPlaying ? 'pause' : 'play'} size={20} />
        </button>
        {live && player.isPlaying ? <span className="live-badge">● مباشر</span> : null}
        {station.listeners ? <span className="muted small">{station.listeners} بيسمعوا</span> : null}
      </div>
    </div>
  );
}
