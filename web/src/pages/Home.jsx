import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorBox, Loading, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { PlaylistCard, Shelf, StationCard, TrackShelf, WorkCard } from '../components/Tracks.jsx';
import { useFetch } from '../hooks.js';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'سهرانين؟ 🌙';
  if (h < 12) return 'صباح الذكريات ☀️';
  if (h < 18) return 'مساء الطفولة 🎈';
  return 'مساء الحنين 🌆';
}

export default function Home() {
  const { data, error, loading, reload } = useFetch('/api/home');
  const { user, isStaff } = useAuth();
  const player = usePlayer();
  const toast = useToast();

  const surprise = async (filter) => {
    try {
      await player.surprise(filter);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const hasMusic = data.newest.length > 0;

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <div className="kicker">{greeting()}{user ? `، ${user.displayName}` : ''}</div>
          <h1>
            {'ذكريات عايشة جوانا... وأغاني عمرها ما بتنسينا'.split(' ').map((w, i) => (
              <Fragment key={i}>
                {i ? ' ' : null}
                <span className="word" style={{ '--i': i }}>
                  {w}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="muted" dir="ltr" style={{ textAlign: 'right' }}>
            Your Memories. Your Music. Your Universe.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => surprise('')}>
              <Icon name="dice" /> فاجئني بأغنية
            </button>
            <Link to="/radio" className="btn btn-ghost btn-lg">
              <Icon name="radio" /> اسمع الراديو
            </Link>
            <Link to="/quiz" className="btn btn-ghost btn-lg">
              <Icon name="game" /> خمّن الشارة
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-logo">
            <img src="/logo-512.png" alt="" width="240" height="240" />
            <span className="eq hero-eq">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      </section>

      {!hasMusic ? (
        <Empty icon="music" title="المكتبة لسه فاضية">
          {isStaff ? (
            <>
              ابدأ من <Link to="/admin/tracks">لوحة الإدارة</Link> وارفع أول أغنية، وحدد حقوقها، وانشرها.
            </>
          ) : (
            'قريب جدًا هيبقى فيه أغاني هنا.'
          )}
        </Empty>
      ) : null}

      {data.recent.length ? (
        <Section title="رجّعلي اللي كنت بسمعه">
          <TrackShelf tracks={data.recent} />
        </Section>
      ) : null}

      <Section title="محطات الراديو" to="/radio">
        <Shelf className="shelf-stations">
          {data.stations.map((s) => (
            <StationCard key={s.id} station={s} />
          ))}
        </Shelf>
      </Section>

      {data.playlists.length ? (
        <Section title="عيش ذكرياتك من جديد">
          <Shelf>
            {data.playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </Shelf>
        </Section>
      ) : null}

      {data.newest.length ? (
        <Section title="أحدث الإضافات">
          <TrackShelf tracks={data.newest} />
        </Section>
      ) : null}

      {data.popular.length ? (
        <Section title="الأكثر استماعًا">
          <TrackShelf tracks={data.popular} />
        </Section>
      ) : null}

      {data.works.length ? (
        <Section title="كرتون وأنمي" to="/explore">
          <Shelf>
            {data.works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </Shelf>
        </Section>
      ) : null}

      {data.decades.length ? (
        <Section title="آلة الزمن" to="/years">
          <div className="decade-row">
            {data.decades.map((d) => (
              <Link key={d.decade} to={`/years?decade=${d.decade}`} className="decade-chip">
                <b>{String(d.decade).slice(2)}s</b>
                <small>{d.count} أغنية</small>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {data.categories.some((c) => c.trackCount) ? (
        <Section title="التصنيفات" to="/explore">
          <div className="category-grid">
            {data.categories
              .filter((c) => c.trackCount)
              .map((c) => (
                <Link key={c.id} to={`/category/${c.slug}`} className="category-tile" style={{ '--tile': c.color }}>
                  <span>{c.name}</span>
                  <small>{c.trackCount} أغنية</small>
                </Link>
              ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
