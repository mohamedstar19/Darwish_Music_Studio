import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, listenerId } from '../api.js';
import { Cover, Empty, ErrorBox, Loading, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { StationCard, TrackMeta } from '../components/Tracks.jsx';
import { useDebounced, useFetch } from '../hooks.js';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';

export function RadioList() {
  const { data, loading, error, reload } = useFetch('/api/stations');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="page">
      <h1 className="page-title">الراديو</h1>
      <p className="muted">محطات شغالة على مدار اليوم. كل اللي فاتحين المحطة بيسمعوا نفس الأغنية في نفس اللحظة.</p>
      <div className="station-grid">
        {data.map((s) => (
          <StationCard key={s.id} station={s} />
        ))}
      </div>
    </div>
  );
}

function RequestBox({ slug, mode, onSent }) {
  const { user } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!dq.trim()) {
      setResults([]);
      return;
    }
    api.get(`/api/stations/${slug}/requestable?q=${encodeURIComponent(dq)}`).then(setResults).catch(() => setResults([]));
  }, [dq, slug]);

  if (mode === 'off') return null;
  if (!user) {
    return (
      <p className="muted">
        <Link to="/login">سجل دخول</Link> عشان تطلب أغنية على المحطة.
      </p>
    );
  }

  const send = async (track) => {
    try {
      const r = await api.post(`/api/stations/${slug}/requests`, { trackId: track.id, message });
      toast(r.status === 'approved' ? 'طلبك اتقبل وهيتذاع قريب 🎶' : 'طلبك وصل وهيتراجع', 'success');
      setQ('');
      setMessage('');
      setResults([]);
      onSent?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="request-box">
      <input className="input" placeholder="دوّر على أغنية تطلبها..." value={q} onChange={(e) => setQ(e.target.value)} />
      <input className="input" placeholder="إهداء أو رسالة (اختياري)" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} />
      {results.length ? (
        <div className="pick-list">
          {results.map((t) => (
            <button key={t.id} type="button" className="pick-item" onClick={() => send(t)}>
              <Cover src={t.cover} size={36} seed={t.id} />
              <span>
                {t.title}
                <small className="muted"> {t.work?.title || ''}</small>
              </span>
              <span className="btn btn-small">اطلب</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StationPage() {
  const { slug } = useParams();
  const player = usePlayer();
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const requests = useFetch(`/api/stations/${slug}/requests`);
  const tunedHere = player.mode === 'radio' && player.radio?.slug === slug;

  // Preview what's on air without tuning in.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get(`/api/stations/${slug}/now?listener=preview-${listenerId()}`)
        .then((d) => alive && setLive(d))
        .catch((e) => alive && setError(e));
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug]);

  const data = tunedHere && player.radio?.track ? player.radio : live;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const station = data.station;

  return (
    <div className="page station-page" style={{ '--station': station.color }}>
      <header className="station-hero">
        <div className="kicker">محطة راديو</div>
        <h1>{station.name}</h1>
        <p className="muted">{station.description}</p>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => (tunedHere ? player.toggle() : player.playStation(slug))}
            disabled={data.empty}
          >
            <Icon name={tunedHere && player.isPlaying ? 'pause' : 'play'} />
            {tunedHere && player.isPlaying ? 'إيقاف' : 'اسمع مباشر'}
          </button>
          {data.listeners ? <span className="muted">{data.listeners} بيسمعوا دلوقتي</span> : null}
        </div>
      </header>

      {data.empty ? (
        <Empty icon="radio" title="المحطة دي لسه فاضية">الإدارة لسه مضافتش أغاني متاحة للمحطة.</Empty>
      ) : (
        <div className="two-col">
          <Section title="على الهوا دلوقتي">
            {data.track ? (
              <div className="on-air">
                <Cover src={data.track.cover} size={120} seed={data.track.id} />
                <div>
                  <span className="live-badge">● مباشر</span>
                  <h3>
                    <Link to={`/track/${data.track.id}`}>{data.track.title}</Link>
                  </h3>
                  <TrackMeta track={data.track} />
                </div>
              </div>
            ) : null}
            {data.upNext ? (
              <>
                <h4 className="sub-head">الجاية</h4>
                <div className="mini-row">
                  <Cover src={data.upNext.cover} size={40} seed={data.upNext.id} />
                  <div>
                    <div>{data.upNext.title}</div>
                    <TrackMeta track={data.upNext} />
                  </div>
                </div>
              </>
            ) : null}
            {data.recent?.length ? <h4 className="sub-head">اتذاعت قبل كده</h4> : null}
            {data.recent?.map((t, i) => (
              <div className="mini-row" key={`${t.id}-${i}`}>
                <Cover src={t.cover} size={40} seed={t.id} />
                <div>
                  <div>{t.title}</div>
                  <TrackMeta track={t} />
                </div>
              </div>
            ))}
          </Section>
          <Section title="اطلب أغنية">
            <RequestBox slug={slug} mode={station.requestsMode} onSent={requests.reload} />
            {requests.data?.length ? <h4 className="sub-head">طلبات مستنية دورها</h4> : null}
            {requests.data?.map((r) => (
              <div className="mini-row" key={r.id}>
                <Cover src={r.track.cover} size={36} seed={r.track.id} />
                <div className="grow">
                  <div>{r.track.title}</div>
                  <small className="muted">
                    {r.by ? `طلب ${r.by}` : ''} {r.message ? `· "${r.message}"` : ''}
                  </small>
                </div>
                <small className={`status status-${r.status}`}>{r.status === 'approved' ? 'في الطابور' : 'مستني موافقة'}</small>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
