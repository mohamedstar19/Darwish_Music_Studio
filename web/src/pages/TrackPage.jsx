import { Link, useParams } from 'react-router-dom';
import { formatTime } from '../api.js';
import { Cover, ErrorBox, Loading, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useTrackActions } from '../components/TrackActions.jsx';
import { FavoriteButton, TrackShelf } from '../components/Tracks.jsx';
import { useFetch } from '../hooks.js';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';

const RIGHTS_LABEL = { original: 'عمل أصلي', licensed: 'محتوى مرخّص', pending: 'قيد مراجعة الحقوق' };

export default function TrackPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/api/tracks/${id}`);
  const player = usePlayer();
  const actions = useTrackActions();
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const t = data.track;
  const active = player.mode === 'queue' && player.current?.id === t.id;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: t.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('الرابط اتنسخ');
      }
    } catch {
      // cancelled
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <Cover src={t.cover} size={220} className="page-header-cover" seed={t.id} />
        <div className="page-header-text">
          <div className="kicker">أغنية{t.year ? ` · ${t.year}` : ''}</div>
          <h1>{t.title}</h1>
          <p className="track-meta big">
            {t.artist ? <Link to={`/artist/${t.artist.id}`}>{t.artist.name}</Link> : null}
            {t.work ? (
              <>
                {t.artist ? ' · ' : ''}
                <Link to={`/work/${t.work.id}`}>{t.work.title}</Link>
              </>
            ) : null}
            {t.category ? (
              <>
                {' · '}
                <Link to={`/category/${t.category.slug}`}>{t.category.name}</Link>
              </>
            ) : null}
          </p>
          <p className="muted small">
            {formatTime(t.duration)} · {t.playCount} مرة استماع · <span className="rights-tag">{RIGHTS_LABEL[t.rightsType]}</span>
          </p>
          <div className="page-header-actions">
            <button type="button" className="btn btn-primary" onClick={() => (active ? player.toggle() : player.playList([t, ...data.related], 0))}>
              <Icon name={active && player.isPlaying ? 'pause' : 'play'} /> {active && player.isPlaying ? 'إيقاف' : 'تشغيل'}
            </button>
            <FavoriteButton track={t} size={22} />
            <button type="button" className="btn btn-ghost" onClick={() => actions.openAddToPlaylist(t)}>
              <Icon name="plus" /> لقائمة تشغيل
            </button>
            <button type="button" className="btn btn-ghost" onClick={share}>
              مشاركة
            </button>
            {t.canDownload ? (
              <a className="btn btn-ghost" href={`/api/tracks/${t.id}/download`} download>
                <Icon name="upload" className="flip-y" /> تنزيل
              </a>
            ) : null}
            <button type="button" className="icon-btn" onClick={() => actions.openReport(t)} aria-label="إبلاغ">
              <Icon name="flag" />
            </button>
          </div>
        </div>
      </header>

      <div className="two-col">
        <Section title="الكلمات">
          {t.lyrics ? <pre className="lyrics-block">{t.lyrics}</pre> : <p className="muted">مفيش كلمات متاحة للأغنية دي.</p>}
        </Section>
        <Section title="الاعتمادات">
          {t.credits ? <pre className="lyrics-block muted">{t.credits}</pre> : <p className="muted">مفيش بيانات اعتمادات لسه.</p>}
        </Section>
      </div>

      {data.related.length ? (
        <Section title="أغاني قريبة منها">
          <TrackShelf tracks={data.related} />
        </Section>
      ) : null}
    </div>
  );
}
