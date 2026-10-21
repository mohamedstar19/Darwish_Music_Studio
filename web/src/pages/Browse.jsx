import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, Loading, PageHeader, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { Shelf, TrackList, WorkCard } from '../components/Tracks.jsx';
import { useDebounced, useFetch } from '../hooks.js';
import { usePlayer } from '../state/PlayerContext.jsx';

const KIND_LABELS = {
  cartoon: 'كرتون',
  anime: 'أنمي',
  series: 'مسلسل',
  film: 'فيلم',
  original: 'عمل أصلي',
  other: 'أخرى',
};

export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function PlayAll({ tracks, source }) {
  const player = usePlayer();
  if (!tracks?.length) return null;
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => player.playList(tracks, 0, source)}>
        <Icon name="play" /> شغّل الكل
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          const i = Math.floor(Math.random() * tracks.length);
          if (!player.shuffle) player.toggleShuffle();
          player.playList(tracks, i, source);
        }}
      >
        <Icon name="shuffle" /> عشوائي
      </button>
    </>
  );
}

export { PlayAll };

export function Explore() {
  const cats = useFetch('/api/categories');
  const [kind, setKind] = useState('');
  const works = useFetch(`/api/works${kind ? `?kind=${kind}` : ''}`);
  return (
    <div className="page">
      <h1 className="page-title">استكشف</h1>
      <Section title="التصنيفات">
        {cats.loading ? <Loading /> : null}
        <div className="category-grid">
          {cats.data?.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="category-tile" style={{ '--tile': c.color }}>
              <span>{c.name}</span>
              <small>{c.trackCount} أغنية</small>
            </Link>
          ))}
        </div>
      </Section>
      <Section
        title="الأعمال"
        action={
          <div className="chips">
            {['', 'cartoon', 'anime', 'series', 'film', 'original'].map((k) => (
              <button key={k || 'all'} type="button" className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                {k ? kindLabel(k) : 'الكل'}
              </button>
            ))}
          </div>
        }
      >
        {works.loading ? <Loading /> : null}
        {works.data?.length === 0 ? <Empty title="مفيش أعمال هنا لسه" /> : null}
        <div className="grid">
          {works.data?.map((w) => (
            <WorkCard key={w.id} work={w} />
          ))}
        </div>
      </Section>
    </div>
  );
}

export function Search() {
  const [params] = useSearchParams();
  const q = useDebounced(params.get('q') || '', 250);
  const { data, loading, error } = useFetch(q ? `/api/search?q=${encodeURIComponent(q)}` : null);
  if (!q) return <Empty icon="search" title="اكتب اللي بتدور عليه فوق" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;
  const nothing = !data.tracks.length && !data.works.length && !data.artists.length;
  return (
    <div className="page">
      <h1 className="page-title">نتائج "{q}"</h1>
      {nothing ? <Empty icon="search" title="ملقيناش حاجة">جرب كلمة تانية أو اسم الكرتون.</Empty> : null}
      {data.works.length ? (
        <Section title="أعمال">
          <Shelf>
            {data.works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </Shelf>
        </Section>
      ) : null}
      {data.tracks.length ? (
        <Section title="أغاني">
          <TrackList tracks={data.tracks} />
        </Section>
      ) : null}
      {data.artists.length ? (
        <Section title="فنانين">
          <div className="chips">
            {data.artists.map((a) => (
              <Link key={a.id} to={`/artist/${a.id}`} className="chip">
                {a.name} <small>({a.trackCount})</small>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

export function CategoryPage() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useFetch(`/api/categories/${slug}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="page">
      <PageHeader kicker="تصنيف" title={data.category.name} subtitle={data.category.description} color={data.category.color}>
        <PlayAll tracks={data.tracks} />
        <span className="muted">{data.tracks.length} أغنية</span>
      </PageHeader>
      {data.tracks.length ? <TrackList tracks={data.tracks} /> : <Empty title="مفيش أغاني منشورة هنا لسه" />}
    </div>
  );
}

export function WorkPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/api/works/${id}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const w = data.work;
  return (
    <div className="page">
      <PageHeader
        cover={w.cover}
        kicker={`${kindLabel(w.kind)}${w.year ? ` · ${w.year}` : ''}${w.studio ? ` · ${w.studio}` : ''}`}
        title={w.title}
        subtitle={w.originalTitle}
      >
        <PlayAll tracks={data.tracks} />
      </PageHeader>
      {w.description ? <p className="prose">{w.description}</p> : null}
      {data.tracks.length ? <TrackList tracks={data.tracks} /> : <Empty title="مفيش أغاني منشورة للعمل ده لسه" />}
    </div>
  );
}

export function ArtistPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/api/artists/${id}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="page">
      <PageHeader cover={null} round kicker="فنان" title={data.artist.name} subtitle={data.artist.bio}>
        <PlayAll tracks={data.tracks} />
      </PageHeader>
      <TrackList tracks={data.tracks} />
    </div>
  );
}

/** آلة الزمن: browse by year or decade. */
export function Years() {
  const [params, setParams] = useSearchParams();
  const years = useFetch('/api/years');
  const decade = params.get('decade');
  const year = params.get('year');
  const url = year ? `/api/years/${year}` : decade ? `/api/years/${decade}?decade=1` : null;
  const picked = useFetch(url);
  const player = usePlayer();

  const decades = [...new Set((years.data || []).map((y) => Math.floor(y.year / 10) * 10))];
  const inDecade = (years.data || []).filter((y) => !decade || Math.floor(y.year / 10) * 10 === Number(decade));

  return (
    <div className="page">
      <h1 className="page-title">آلة الزمن</h1>
      <p className="muted">اختار سنة وارجع بالزمن لأغاني الفترة دي.</p>
      {years.loading ? <Loading /> : null}
      {years.data?.length === 0 ? <Empty icon="calendar" title="لسه مفيش أغاني عليها سنة">ضيف سنة الإنتاج للأغاني أو الأعمال من لوحة الإدارة.</Empty> : null}
      <div className="chips">
        {decades.map((d) => (
          <button key={d} type="button" className={`chip ${Number(decade) === d && !year ? 'on' : ''}`} onClick={() => setParams({ decade: d })}>
            {d}s
          </button>
        ))}
      </div>
      <div className="year-strip">
        {inDecade.map((y) => (
          <button
            key={y.year}
            type="button"
            className={`year-btn ${Number(year) === y.year ? 'on' : ''}`}
            onClick={() => setParams({ decade: Math.floor(y.year / 10) * 10, year: y.year })}
          >
            <b>{y.year}</b>
            <small>{y.count}</small>
          </button>
        ))}
      </div>
      {picked.loading ? <Loading /> : null}
      {picked.data ? (
        <>
          <div className="page-header-actions">
            <PlayAll tracks={picked.data.tracks} />
            {picked.data.tracks.length ? (
              <button type="button" className="btn btn-ghost" onClick={() => player.surprise(`&decade=${decade || Math.floor(year / 10) * 10}`)}>
                <Icon name="dice" /> فاجئني من الفترة دي
              </button>
            ) : null}
          </div>
          {picked.data.works.length ? (
            <Section title="أعمال الفترة دي">
              <Shelf>
                {picked.data.works.map((w) => (
                  <WorkCard key={w.id} work={w} />
                ))}
              </Shelf>
            </Section>
          ) : null}
          <Section title="الأغاني">
            <TrackList tracks={picked.data.tracks} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
