import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatTime } from '../api.js';
import { Loading, Modal } from '../components/common.jsx';
import { useAdminBase } from './base.js';

const SOURCE_LABEL = { AcoustID: 'من صوت الأغنية', Deezer: 'Deezer', iTunes: 'iTunes', 'تنظيف الاسم': 'الاسم بعد التنظيف' };

/** One suggested name: title — artist, where it came from and how sure it is. */
export function Candidate({ c, onPick, busy, pickLabel = 'استخدم ده' }) {
  const pct = Math.round((c.confidence || 0) * 100);
  return (
    <div className="id-candidate">
      <div className="grow">
        <b>{c.title}</b>
        {c.artist ? <span className="muted"> — {c.artist}</span> : null}
        <div className="muted small">
          <span className={`status ${c.source === 'AcoustID' ? 'status-ready' : ''}`}>{SOURCE_LABEL[c.source] || c.source}</span>
          {c.album ? ` · ${c.album}` : ''}
          {c.year ? ` · ${c.year}` : ''}
          {c.duration ? ` · ${formatTime(c.duration)}` : ''}
          <span className={`id-conf ${pct >= 90 ? 'hi' : pct >= 70 ? 'mid' : 'lo'}`}> · متأكد {pct}%</span>
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-small" onClick={() => onPick(c)} disabled={busy}>
        {pickLabel}
      </button>
    </div>
  );
}

/** "What is this song?": listens to the file (AcoustID) and searches by name. */
export default function IdentifySong({ trackId, onPick, onClose }) {
  const base = useAdminBase();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .post(`/api/admin/tracks/${trackId}/identify`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [trackId]);

  return (
    <Modal title="اعرف الأغنية من صوتها" onClose={onClose} wide>
      {!data && !error ? <Loading label="بيسمع الأغنية ويدوّر عليها..." /> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {data ? (
        <>
          <p className="muted small">
            الاسم الحالي: <b>{data.track.title}</b>
            {data.track.artist ? ` — ${data.track.artist}` : ''} · {formatTime(data.track.duration)}
          </p>
          {!data.keySet ? (
            <p className="note-box small">
              التعرف من الصوت مش شغال لسه لأن مفتاح AcoustID مش متسجّل، فالنتايج دي من البحث بالاسم بس. سجّل المفتاح من{' '}
              <Link to={`${base}/health`} onClick={onClose}>
                صحة المكتبة
              </Link>
              .
            </p>
          ) : null}
          {data.soundError ? <p className="note-box small">التعرف من الصوت: {data.soundError}</p> : null}
          {data.candidates.length ? (
            <div className="id-list">
              {data.candidates.map((c, i) => (
                <Candidate key={i} c={c} onPick={onPick} pickLabel="حطه في الخانات" />
              ))}
            </div>
          ) : (
            <p className="muted">ملقيناش الأغنية دي. ده طبيعي في الأغاني القديمة وتترات الكرتون؛ اكتب الاسم بإيدك.</p>
          )}
          <p className="muted small">
            اختيارك بيتحط في خانات الاسم والفنان والسنة، وبعدها اضغط حفظ. اسمعها الأول لو مش متأكد.
          </p>
        </>
      ) : null}
    </Modal>
  );
}
