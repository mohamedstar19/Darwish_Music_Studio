import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatBytes, formatDuration, formatTime } from '../api.js';
import { Cover, ErrorBox, Loading, Section } from '../components/common.jsx';
import { useFetch } from '../hooks.js';
import { BarChart, StatTile, timeAgo } from './ui.jsx';
import { useAdminBase } from './base.js';

/** Nightly backup: when it last ran, and whether it worked. */
function BackupCard({ b }) {
  if (!b) return null;
  if (!b.configured) {
    return (
      <div className="backup-card warn">
        <b>⚠ النسخ الاحتياطي لسه مااشتغلش</b>
        <span className="muted small">ظبط BACKUP_DIR في إعدادات السيرفر عشان أغانيك وبياناتك تتنسخ كل يوم.</span>
      </div>
    );
  }
  const bad = !b.ok || b.stale;
  return (
    <div className={`backup-card ${bad ? 'bad' : 'ok'}`}>
      <b>
        {!b.ok ? '✗ آخر نسخة احتياطية فشلت' : b.stale ? '⚠ مفيش نسخة احتياطية من أكتر من يوم ونص' : '✓ النسخ الاحتياطي شغال'}
        <span className="muted small"> · آخر مرة {timeAgo(b.finishedAt)}</span>
      </b>
      {b.ok ? (
        <span className="muted small">
          قاعدة البيانات ({b.tracks} أغنية، اتجربت إنها بترجع سليمة) · {b.mediaFiles} ملف أغاني وصور ({formatBytes(b.mediaBytes)}) · محفوظ{' '}
          {b.dbCopies} نسخة من قاعدة البيانات، والملفات المحذوفة بتفضل {b.keepDays} يوم
        </span>
      ) : (
        <span className="small">{b.error}</span>
      )}
    </div>
  );
}

export function Dashboard() {
  const base = useAdminBase();
  const { data, loading, error, reload } = useFetch('/api/admin/stats');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const c = data.counts;
  const totalBw = data.bandwidth.reduce((s, d) => s + d.bytes, 0);
  return (
    <div className="admin-page">
      <h1>لوحة التحكم</h1>
      <BackupCard b={data.backup} />
      <div className="stat-row">
        <StatTile label="مستخدم" value={c.users} hint={`${c.new_users} جديد آخر 30 يوم`} />
        <StatTile label="نشط آخر 7 أيام" value={c.active_users_7d} />
        <StatTile label="تشغيل النهارده" value={c.plays_today} />
        <StatTile label="تشغيل آخر 30 يوم" value={c.plays_30d} hint={formatDuration(c.seconds_30d)} />
        <StatTile label="أغنية منشورة" value={`${c.live_tracks} / ${c.tracks}`} />
        <StatTile label="حقوق قيد المراجعة" value={c.pending_rights} tone={c.pending_rights ? 'warn' : ''} />
        <StatTile label="بلاغات مفتوحة" value={c.open_reports} tone={c.open_reports ? 'warn' : ''} />
        <StatTile label="طلبات أغاني مستنية" value={c.pending_requests} />
      </div>

      <div className="two-col">
        <Section title="مرات التشغيل يوميًا (30 يوم)">
          <BarChart data={data.daily} valueKey="plays" labelKey="day" label="مرات التشغيل يوميًا" />
        </Section>
        <Section title={`استهلاك البيانات (30 يوم): ${formatBytes(totalBw)}`}>
          {data.bandwidth.length ? (
            <BarChart data={data.bandwidth} valueKey="bytes" labelKey="day" format={formatBytes} label="استهلاك البيانات يوميًا" />
          ) : (
            <p className="muted">لسه مفيش بيانات.</p>
          )}
        </Section>
      </div>

      <div className="two-col">
        <Section title="الأكثر استماعًا (30 يوم)">
          <ol className="top-list">
            {data.topTracks.map((t, i) => (
              <li key={t.id}>
                <span className="rank">{i + 1}</span>
                <Link to={`/track/${t.id}`} className="grow">{t.title}</Link>
                <span className="muted">{t.plays}</span>
              </li>
            ))}
          </ol>
          {!data.topTracks.length ? <p className="muted">لسه مفيش تشغيل.</p> : null}
        </Section>
        <Section title="المحطات (وقت الاستماع)">
          <ol className="top-list">
            {data.topStations.map((s, i) => (
              <li key={s.name}>
                <span className="rank">{i + 1}</span>
                <span className="grow">{s.name}</span>
                <span className="muted">{formatDuration(s.seconds)}</span>
              </li>
            ))}
          </ol>
          {!data.topStations.length ? <p className="muted">لسه مفيش استماع للراديو.</p> : null}
        </Section>
      </div>

      <div className="two-col">
        <Section title="تراخيص بتنتهي خلال 30 يوم">
          {data.expiring.length ? (
            <ul className="plain-list">
              {data.expiring.map((t) => (
                <li key={t.id}>
                  <Link to={`${base}/tracks?edit=${t.id}`}>{t.title}</Link> — <span className="muted">{t.license_expires_at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">مفيش تراخيص قربت تنتهي ✓</p>
          )}
        </Section>
        <Section title="معالجة الملفات وأخطاء التشغيل">
          <p className="muted">
            في الطابور: {data.queue} ·{' '}
            {data.processing.map((p) => `${p.processing_status}: ${p.n}`).join(' · ')}
          </p>
          <ul className="plain-list small">
            {data.errors.map((e, i) => (
              <li key={i}>
                <b>{e.title || 'غير معروف'}</b> <span className="muted">{e.message} · {timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
          {!data.errors.length ? <p className="muted">مفيش أخطاء تشغيل ✓</p> : null}
        </Section>
      </div>
    </div>
  );
}

/** Live view: who is online, what they're listening to, installs and downloads. */
export function Live() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get('/api/admin/live')
        .then((d) => {
          if (alive) {
            setData(d);
            setError(null);
          }
        })
        .catch((e) => alive && setError(e));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data && error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const c = data.counts;

  return (
    <div className="admin-page">
      <h1>
        مباشر <span className="live-badge">● تحديث كل 5 ثواني</span>
      </h1>
      <div className="stat-row">
        <StatTile label="أونلاين دلوقتي" value={c.online} hint={`أعلى رقم: ${data.peak.count}`} />
        <StatTile label="بيسمعوا دلوقتي" value={c.listening} hint={`${c.onRadio} على الراديو`} />
        <StatTile label="مسجلين / زوار" value={`${c.signedIn} / ${c.guests}`} />
        <StatTile label="من التطبيق المثبت" value={c.fromInstalledApp} />
        <StatTile label="تثبيت التطبيق" value={data.installs.installs_total} hint={`${data.installs.installs_30d} آخر 30 يوم`} />
        <StatTile label="فتح من التطبيق (30 يوم)" value={data.installs.app_opens_30d} />
        <StatTile label="تنزيلات الأغاني" value={data.downloads.total} hint={`${data.downloads.today} النهارده · ${data.downloads.last_30d} آخر 30 يوم`} />
        <StatTile label="زوار مختلفين" value={data.installs.visitors_today} hint={`${data.installs.visitors_30d} آخر 30 يوم`} />
      </div>

      <div className="two-col">
        <Section title="بيتسمع دلوقتي">
          {data.nowTracks.length ? (
            <ul className="plain-list">
              {data.nowTracks.map((t) => (
                <li key={t.id} className="mini-row">
                  <Cover src={t.cover} size={36} seed={t.id} />
                  <span className="grow">
                    {t.title} <small className="muted">{t.work || ''}</small>
                  </span>
                  <b>{t.listeners}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">محدش بيسمع حاجة دلوقتي.</p>
          )}
          {data.nowStations.length ? <h4 className="sub-head">المحطات</h4> : null}
          {data.nowStations.map((s) => (
            <div key={s.slug} className="bar-row">
              <span>{s.name}</span>
              <div className="bar">
                <i style={{ width: `${(s.listeners / data.nowStations[0].listeners) * 100}%`, background: s.color }} />
              </div>
              <small>{s.listeners}</small>
            </div>
          ))}
        </Section>
        <Section title="الأجهزة">
          {Object.entries(data.platforms).map(([p, n]) => (
            <div key={p} className="bar-row">
              <span>{p}</span>
              <div className="bar">
                <i style={{ width: `${(n / Math.max(1, c.online)) * 100}%` }} />
              </div>
              <small>{n}</small>
            </div>
          ))}
          {data.installPlatforms.length ? <h4 className="sub-head">التثبيت حسب النظام</h4> : null}
          {data.installPlatforms.map((p) => (
            <div key={p.platform} className="bar-row">
              <span>{p.platform}</span>
              <div className="bar">
                <i style={{ width: `${(p.n / Math.max(1, data.installs.installs_total)) * 100}%` }} />
              </div>
              <small>{p.n}</small>
            </div>
          ))}
        </Section>
      </div>

      <Section title={`مين أونلاين (${data.sessions.length})`}>
        {data.sessions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>بيسمع إيه</th>
                  <th>الحالة</th>
                  <th>الجهاز</th>
                  <th>الصفحة</th>
                  <th>أونلاين من</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.user ? (
                        <>
                          <b>{s.user.name}</b>
                          <div className="muted small" dir="ltr">{s.user.email}</div>
                        </>
                      ) : (
                        <span className="muted">زائر #{s.id.slice(0, 4)}</span>
                      )}
                    </td>
                    <td>
                      {s.track ? (
                        <>
                          {s.track.title}
                          {s.station ? <div className="small" style={{ color: 'var(--accent)' }}>📻 {s.station.name}</div> : null}
                          {!s.station && s.position !== null ? <div className="muted small">{formatTime(s.position)}</div> : null}
                        </>
                      ) : s.station ? (
                        <>
                          {s.nowTitle || <span className="muted">بث مباشر</span>}
                          <div className="small" style={{ color: 'var(--accent)' }}>📻 {s.station.name}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{s.playing ? <span className="status status-ready">▶ بيسمع</span> : <span className="status">⏸ متوقف</span>}</td>
                    <td>
                      {s.platform}
                      {s.installed ? <div className="muted small">تطبيق مثبت</div> : null}
                    </td>
                    <td className="muted small" dir="ltr">{s.page}</td>
                    <td className="muted small">{timeAgo(s.onlineSince)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">محدش أونلاين دلوقتي.</p>
        )}
      </Section>

      <div className="two-col">
        <Section title="تثبيت التطبيق يوميًا (30 يوم)">
          <BarChart data={data.daily} valueKey="installs" labelKey="day" label="تثبيت التطبيق يوميًا" />
        </Section>
        <Section title="تنزيلات الأغاني يوميًا (30 يوم)">
          <BarChart data={data.daily} valueKey="downloads" labelKey="day" label="تنزيلات الأغاني يوميًا" />
        </Section>
      </div>

      {data.topDownloads.length ? (
        <Section title="الأكثر تنزيلًا">
          <ol className="top-list">
            {data.topDownloads.map((t, i) => (
              <li key={t.id}>
                <span className="rank">{i + 1}</span>
                <span className="grow">{t.title}</span>
                <span className="muted">{t.downloads}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}
