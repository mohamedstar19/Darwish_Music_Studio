import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { usePlayer, usePlayerTime } from '../state/PlayerContext.jsx';
import { Cover } from './common.jsx';
import Icon from './Icon.jsx';
import { FavoriteButton, TrackMeta } from './Tracks.jsx';

function ProgressBar({ disabled }) {
  const p = usePlayer();
  const { time } = usePlayerTime();
  const [drag, setDrag] = useState(null);
  const dur = p.duration || p.current?.duration || 0;
  const value = drag ?? time;
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
        <button type="button" className={`icon-btn ctl-extra ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} aria-pressed={p.shuffle} aria-label="عشوائي">
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
          className={`icon-btn ctl-extra repeat ${p.repeat !== 'off' ? 'on' : ''}`}
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
  if (p.mode === 'radio' && p.radio?.external) {
    const s = p.radio.station || {};
    return (
      <div className="queue-panel">
        <h4>بث مباشر</h4>
        <p>{s.description || s.name}</p>
        {p.radio.nowTitle ? <p className="muted">بيذيع دلوقتي: {p.radio.nowTitle}</p> : null}
        {s.homepage ? (
          <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
            موقع المحطة
          </a>
        ) : null}
      </div>
    );
  }
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

/** "[01:23.45] line" → [{ t: 83.45, text }] (a line may carry several timestamps). */
function parseLrc(lrc) {
  const out = [];
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Timed lyrics: the current line lights up and stays in view; tap a line to jump there. */
function SyncedLyrics({ lines }) {
  const p = usePlayer();
  const { time } = usePlayerTime();
  const boxRef = useRef(null);
  let current = -1;
  for (let i = 0; i < lines.length; i += 1) if (lines[i].t <= time + 0.25) current = i;
  useEffect(() => {
    const el = boxRef.current?.querySelector('.lrc-line.now');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);
  return (
    <div className="lrc" ref={boxRef}>
      {lines.map((l, i) => (
        <button
          key={`${l.t}-${i}`}
          type="button"
          className={`lrc-line ${i === current ? 'now' : i < current ? 'past' : ''}`}
          onClick={() => p.seek(l.t)}
        >
          {l.text || '♪'}
        </button>
      ))}
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
  const lines = data.lyricsSynced ? parseLrc(data.lyricsSynced) : [];
  return (
    <div className="lyrics">
      {lines.length ? (
        <SyncedLyrics lines={lines} />
      ) : data.lyrics ? (
        <pre>{data.lyrics}</pre>
      ) : (
        <p className="muted">مفيش كلمات متاحة للأغنية دي.</p>
      )}
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
    // The page behind shouldn't scroll while the full player covers it.
    document.documentElement.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('no-scroll');
    };
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
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              onClose();
              p.stop();
            }}
          >
            <Icon name="close" size={16} /> قفل المشغل
          </button>
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
        {tab === 'queue' ? (
          <QueuePanel />
        ) : t.id ? (
          <Lyrics trackId={t.id} />
        ) : (
          <p className="muted">دي محطة بث مباشر من برة، فمفيش كلمات للأغاني بتاعتها.</p>
        )}
      </div>
    </div>
  );
}

function MiniProgress() {
  const { time, duration } = usePlayerTime();
  return <div className="pb-mini-progress" style={{ '--pct': `${duration ? (time / duration) * 100 : 0}%` }} />;
}

function CloseButton({ className = '' }) {
  const p = usePlayer();
  return (
    <button type="button" className={`icon-btn pb-close ${className}`} onClick={p.stop} aria-label="قفل المشغل" title="قفل المشغل">
      <Icon name="close" size={18} />
    </button>
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
          <CloseButton className="pb-close-mobile" />
        </div>
        <div className="pb-side">
          <CloseButton />
          <SleepTimerMenu />
          <button type="button" className="icon-btn" onClick={() => setFull(true)} aria-label="قائمة الانتظار">
            <Icon name="queue" size={18} />
          </button>
          <Volume />
        </div>
        <MiniProgress />
      </div>
      {full ? <FullPlayer onClose={() => setFull(false)} /> : null}
    </>
  );
}
