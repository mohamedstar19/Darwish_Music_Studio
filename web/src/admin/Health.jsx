import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { useAdminBase } from './base.js';
import NameFixer from './NameFixer.jsx';

/** What's missing or odd in the library, with a fix next to each item. */
export default function Health() {
  const base = useAdminBase();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api
        .get('/api/admin/health')
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch(setError),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while the picture search runs.
  useEffect(() => {
    if (!data?.artwork?.running) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data?.artwork?.running, load]);

  const startArt = async () => {
    try {
      await api.post('/api/admin/artwork/auto', {});
      toast('بدأ البحث عن الصور', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const stopArt = async () => {
    await api.post('/api/admin/artwork/stop');
    load();
  };

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const c = data.counts;
  const a = data.artwork;

  const items = [
    { n: c.no_image, label: 'أغنية من غير أي صورة', fix: 'images', to: `${base}/tracks?missing=image` },
    { n: c.artists_no_photo, label: 'فنان من غير صورة', fix: 'images', to: `${base}/artists` },
    { n: c.works_no_cover, label: 'عمل (فيلم/كرتون) من غير بوستر', fix: 'images', to: `${base}/works` },
    { n: c.no_lyrics, label: 'أغنية من غير كلمات', to: `${base}/tracks?missing=lyrics` },
    { n: c.no_category, label: 'أغنية من غير تصنيف', to: `${base}/tracks?missing=category` },
    { n: c.no_artist, label: 'أغنية من غير فنان', to: `${base}/tracks?missing=artist` },
    { n: c.bad_name, label: 'أغنية اسمها شكله غلط (اسم موقع، Track 01…)', to: `${base}/tracks?missing=name` },
    { n: c.name_suggestions, label: 'اسم مقترح مستني رأيك', to: `${base}/health` },
    { n: c.ready_unpublished, label: 'أغنية جاهزة وحقوقها سليمة بس مش منشورة', to: `${base}/tracks?ready=unpublished` },
    { n: c.pending_rights, label: 'أغنية حقوقها قيد المراجعة', to: `${base}/tracks?rights=pending` },
    { n: c.failed, label: 'أغنية فشلت في المعالجة', to: `${base}/tracks?status=failed` },
    { n: c.processing, label: 'أغنية لسه بتتجهز', to: `${base}/tracks?status=processing` },
    { n: c.not_on_station, label: 'أغنية منشورة مش على أي محطة راديو', to: `${base}/tracks?published=yes` },
  ];

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>صحة المكتبة</h1>
        <button type="button" className="btn btn-ghost btn-small" onClick={load}>
          تحديث
        </button>
      </div>
      <p className="muted">
        {c.tracks} أغنية في المكتبة. دي الحاجات اللي محتاجة تظبيط، وجنب كل واحدة طريقة تصلحها.
      </p>

      <div className="card-box art-box">
        <div className="art-head">
          <Icon name="search" size={22} />
          <div className="grow">
            <b>صور وكلمات من الإنترنت</b>
            <p className="muted small">
              بيدوّر على صور الفنانين وبوسترات الأفلام والأنمي وأغلفة الأغاني الناقصة (Deezer و iTunes و ويكيبيديا)،
              وعلى كلمات الأغاني (LRCLIB، وكتير منها متزامنة مع الأغنية)، وبياخد بس النتيجة اللي مطابقة بوضوح. اللي مش متأكد منه بيسيبه، وتقدر تختاره بنفسك من زرار "دوّر على صورة من
              الإنترنت" في صفحة الفنان أو العمل أو الأغنية.
            </p>
          </div>
          {a.running ? (
            <button type="button" className="btn btn-danger btn-small" onClick={stopArt}>
              إيقاف
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={startArt}
              disabled={!c.no_image && !c.artists_no_photo && !c.works_no_cover && !c.no_lyrics}
            >
              كمّل الصور والكلمات الناقصة
            </button>
          )}
        </div>
        {a.startedAt ? (
          <div className="bulk-progress">
            <div className="bulk-progress-head">
              <b>
                {a.running ? 'شغال...' : 'خلص'} {a.done} / {a.total}
              </b>
              <span className="muted small">
                لقى {a.found} · سابه {a.skipped}
                {a.current ? ` · دلوقتي: ${a.current}` : ''}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${a.total ? Math.round((a.done / a.total) * 100) : 0}%` }} />
            </div>
            {a.recent.length ? (
              <ul className="upload-results">
                {[...a.recent].reverse().map((r, i) => (
                  <li key={i} className="ok">
                    <span className="mark">✓</span>
                    <span className="grow">
                      <b>{r.name}</b>
                      <small className="muted">
                        {' '}
                        ← {r.match} · {r.source}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <NameFixer counts={c} onChanged={load} />

      <div className="health-list">
        {items.map((it) => (
          <Link key={it.label} to={it.to} className={`health-item ${it.n ? 'warn' : 'ok'}`}>
            <b>{it.n}</b>
            <span>{it.label}</span>
            <small>{it.n ? 'اعرضهم ←' : '✓'}</small>
          </Link>
        ))}
      </div>

      {data.soundDuplicates?.length ? (
        <Section title="نفس الأغنية بالظبط (اتعرفت من الصوت)">
          <p className="muted small">
            الملفات دي صوتها واحد حتى لو أساميها مختلفة. سيب أحسن نسخة وامسح الباقي.
          </p>
          <ul className="upload-results">
            {data.soundDuplicates.map((d) => (
              <li key={d.key} className="dup">
                <span className="mark">{d.n}×</span>
                <span className="grow">
                  <b>{d.title}</b> <small className="muted">· {d.artist || 'من غير فنان'}</small>
                </span>
                <span className="chips">
                  {d.ids.map((id) => (
                    <Link key={id} to={`${base}/tracks?edit=${id}`} className="chip">
                      #{id}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {data.duplicates.length ? (
        <Section title="أغاني ممكن تكون متكررة (نفس الاسم ونفس الفنان)">
          <p className="muted small">
            الملفات دي مختلفة بس ليها نفس الاسم. افتح كل واحدة واسمعها، وامسح اللي مش محتاجه.
          </p>
          <ul className="upload-results">
            {data.duplicates.map((d) => (
              <li key={d.key + d.ids.join(',')} className="dup">
                <span className="mark">{d.n}×</span>
                <span className="grow">
                  <b>{d.title}</b> <small className="muted">· {d.artist || 'من غير فنان'}</small>
                </span>
                <span className="chips">
                  {d.ids.map((id) => (
                    <Link key={id} to={`${base}/tracks?edit=${id}`} className="chip">
                      #{id}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
