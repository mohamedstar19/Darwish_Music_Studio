import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { usePlayer } from '../state/PlayerContext.jsx';
import { Cover } from './common.jsx';
import Icon from './Icon.jsx';
import { FavoriteButton, TrackMeta } from './Tracks.jsx';

function ProgressBar({ disabled }) {
  const p = usePlayer();
  const [drag, setDrag] = useState(null);
  const dur = p.duration || p.current?.duration || 0;
  const value = drag ?? p.time;
  return (
    <div className="progress" dir="ltr">
      <span className="time">{formatTime(value)}</span>
      <input
        type="range"
        min={0}
        max={dur || 1}
        step={0.5}
        value={Math.min(value, dur || 1)}
        disabled={disabled || !dur}
        aria-label="موضع التشغيل"
        style={{ '--pct': `${dur ? (Math.min(value, dur) / dur) * 100 : 0}%` }}
        onChange={(e) => setDrag(Number(e.target.value))}
        onMouseUp={() => {
          if (drag !== null) p.seek(drag);
          setDrag(null);
        }}
        onTouchEnd={() => {
          if (drag !== null) p.seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) p.seek(drag);
          setDrag(null);
        }}
      />
      <span className="time">{formatTime(dur)}</span>
    </div>
  );
}

export function Controls({ big = false }) {
  const p = usePlayer();
  const radio = p.mode === 'radio';
  const size = big ? 30 : 20;
  return (
    <div className={`controls ${big ? 'controls-big' : ''}`} dir="ltr">
      {!radio ? (
        <button type="button" className={`icon-btn ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} aria-pressed={p.shuffle} aria-label="عشوائي">
          <Icon name="shuffle" size={big ? 22 : 18} />
        </button>
      ) : null}
      <button type="button" className="icon-btn" onClick={p.prev} disabled={radio} aria-label="السابق">
        <Icon name="prev" size={size} />
      </button>
      <button type="button" className="play-btn" onClick={p.toggle} aria-label={p.isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}>
        {p.buffering && p.isPlaying ? <span className="spinner" /> : <Icon name={p.isPlaying ? 'pause' : 'play'} size={size} />}
      </button>
      <button type="button" className="icon-btn" onClick={() => p.next()} disabled={radio} aria-label="التالي">
        <Icon name="next" size={size} />
      </button>
      {!radio ? (
        <button
          type="button"
          className={`icon-btn repeat ${p.repeat !== 'off' ? 'on' : ''}`}
          onClick={p.cycleRepeat}
          aria-label={p.repeat === 'one' ? 'تكرار الأغنية' : p.repeat === 'all' ? 'تكرار القائمة' : 'بدون تكرار'}
        >
          <Icon name="repeat" size={big ? 22 : 18} />
          {p.repeat === 'one' ? <small>1</small> : null}
        </button>
      ) : null}
    </div>
  );
}

export function SleepTimerMenu() {
  const p = usePlayer();
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (!p.sleep?.until) return undefined;
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [p.sleep]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const left = p.sleep?.until ? Math.max(1, Math.round((p.sleep.until - Date.now()) / 60000)) : null;
  const choose = (v) => {
    p.setSleepTimer(v);
    setOpen(false);
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={`icon-btn ${p.sleep ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="مؤقت النوم">
        <Icon name="timer" size={18} />
        {left ? <small className="badge">{left}د</small> : p.sleep?.endOfTrack ? <small className="badge">♪</small> : null}
      </button>
      {open ? (
        <div className="menu menu-up" role="menu">
          <div className="menu-label">إيقاف التشغيل بعد</div>
          {[15, 30, 45, 60, 90].map((m) => (
            <button key={m} role="menuitem" onClick={() => choose(m)}>
              {m} دقيقة
            </button>
          ))}
          <button role="menuitem" onClick={() => choose('end')}>
            آخر الأغنية الحالية
          </button>
          {p.sleep ? (
            <button role="menuitem" onClick={() => choose(null)}>
              إلغاء المؤقت
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Volume() {
  const p = usePlayer();
  return (
    <div className="volume" dir="ltr">
      <button type="button" className="icon-btn" onClick={p.toggleMute} aria-label={p.muted ? 'تشغيل الصوت' : 'كتم الصوت'}>
        <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={p.muted ? 0 : p.volume}
        aria-label="مستوى الصوت"
        style={{ '--pct': `${(p.muted ? 0 : p.volume) * 100}%` }}
        onChange={(e) => p.setVolume(Number(e.target.value))}
      />
    </div>
  );
}

function QueuePanel() {
  const p = usePlayer();
  if (p.mode === 'radio') {
    const r = p.radio || {};
    return (
      <div className="queue-panel">
        {r.upNext ? (
          <>
            <h4>الجاية على المحطة</h4>
            <div className="mini-row">
              <Cover src={r.upNext.cover} size={40} seed={r.upNext.id} />
              <div>
                <div>{r.upNext.title}</div>
                <TrackMeta track={r.upNext} />
              </div>
            </div>
          </>
        ) : null}
        {r.recent?.length ? <h4>اتذاعت قبل كده</h4> : null}
        {r.recent?.map((t, i) => (
          <div className="mini-row" key={`${t.id}-${i}`}>
            <Cover src={t.cover} size={40} seed={t.id} />
            <div>
              <div>{t.title}</div>
              <TrackMeta track={t} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="queue-panel">
      <h4>قائمة الانتظار ({p.queue.length})</h4>
      <ol>
        {p.queue.map((t, i) => (
          <li key={`${t.id}-${i}`} className={`mini-row ${i === p.index ? 'active' : ''}`}>
            <button type="button" className="mini-play" onClick={() => p.jumpTo(i)} aria-label={`شغل ${t.title}`}>
              <Cover src={t.cover} size={40} seed={t.id} />
            </button>
            <div className="grow">
              <div>{t.title}</div>
              <TrackMeta track={t} />
            </div>
            {i !== p.index ? (
              <button type="button" className="icon-btn" onClick={() => p.removeFromQueue(i)} aria-label="شيل من القائمة">
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Lyrics({ trackId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/api/tracks/${trackId}`).then((d) => setData(d.track)).catch(() => setData({}));
  }, [trackId]);
  if (!data) return <p className="muted">بيحمّل...</p>;
  return (
    <div className="lyrics">
      {data.lyrics ? <pre>{data.lyrics}</pre> : <p className="muted">مفيش كلمات متاحة للأغنية دي.</p>}
      {data.credits ? (
        <>
          <h4>الاعتمادات</h4>
          <pre className="muted">{data.credits}</pre>
        </>
      ) : null}
    </div>
  );
}

function FullPlayer({ onClose }) {
  const p = usePlayer();
  const [tab, setTab] = useState('queue');
  const t = p.current;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!t) return null;
  return (
    <div className={`full-player ${p.isPlaying ? 'playing' : ''}`} role="dialog" aria-label="المشغل الكامل">
      <div className="full-bg" style={t.cover ? { backgroundImage: `url(${t.cover})` } : undefined} />
      <button type="button" className="icon-btn full-close" onClick={onClose} aria-label="تصغير المشغل">
        <Icon name="chevron" size={28} />
      </button>
      <div className="full-main">
        <Cover src={t.cover} className="full-cover" seed={t.id} />
        {p.mode === 'radio' ? (
          <div className="live-line">
            <span className="live-badge">● مباشر</span> {p.radio?.station?.name}
            {p.radio?.listeners ? <span className="muted"> · {p.radio.listeners} بيسمعوا دلوقتي</span> : null}
          </div>
        ) : null}
        <div className="full-title">
          <div>
            <h2>{t.title}</h2>
            <TrackMeta track={t} />
          </div>
          <FavoriteButton track={t} size={24} />
        </div>
        <ProgressBar disabled={p.mode === 'radio'} />
        <Controls big />
        <div className="full-extras">
          <SleepTimerMenu />
          <Volume />
        </div>
      </div>
      <div className="full-side">
        <div className="tabs">
          <button type="button" className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>
            {p.mode === 'radio' ? 'المحطة' : 'قائمة الانتظار'}
          </button>
          <button type="button" className={tab === 'lyrics' ? 'on' : ''} onClick={() => setTab('lyrics')}>
            الكلمات والاعتمادات
          </button>
        </div>
        {tab === 'queue' ? <QueuePanel /> : <Lyrics trackId={t.id} />}
      </div>
    </div>
  );
}

export default function PlayerBar() {
  const p = usePlayer();
  const [full, setFull] = useState(false);
  const t = p.current;

  // Space bar toggles play when not typing.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) && !e.target.isContentEditable) {
        e.preventDefault();
        p.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  if (!t && !(p.mode === 'radio' && p.radio)) return null;

  return (
    <>
      <div className={`player-bar ${p.mode === 'radio' ? 'is-radio' : ''} ${p.isPlaying ? 'playing' : ''}`}>
        {p.error ? <div className="player-error">{p.error}</div> : null}
        <div className="pb-now">
          <button type="button" className="pb-cover" onClick={() => setFull(true)} aria-label="فتح المشغل الكامل">
            <Cover src={t?.cover} size={56} seed={t?.id} />
          </button>
          <div className="pb-text">
            <button type="button" className="pb-title" key={t?.id || 'radio'} onClick={() => setFull(true)}>
              {t?.title || (p.radio?.loading ? 'بيتصل بالمحطة...' : p.radio?.station?.name)}
            </button>
            {p.mode === 'radio' ? (
              <span className="track-meta">
                <span className="live-badge">● مباشر</span>{' '}
                <Link to={`/radio/${p.radio?.slug}`}>{p.radio?.station?.name}</Link>
              </span>
            ) : t ? (
              <TrackMeta track={t} />
            ) : null}
          </div>
          {t ? <FavoriteButton track={t} /> : null}
        </div>
        <div className="pb-center">
          <Controls />
          <ProgressBar disabled={p.mode === 'radio'} />
        </div>
        <div className="pb-side">
          <SleepTimerMenu />
          <button type="button" className="icon-btn" onClick={() => setFull(true)} aria-label="قائمة الانتظار">
            <Icon name="queue" size={18} />
          </button>
          <Volume />
        </div>
        <div className="pb-mini-progress" style={{ '--pct': `${p.duration ? (p.time / p.duration) * 100 : 0}%` }} />
      </div>
      {full ? <FullPlayer onClose={() => setFull(false)} /> : null}
    </>
  );
}
