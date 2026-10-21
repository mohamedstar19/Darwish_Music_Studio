import { Link } from 'react-router-dom';
import { Cover } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useFetch } from '../hooks.js';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';

/** وضع السيارة: huge buttons, minimal text. Set it up before you drive. */
export default function Car() {
  const p = usePlayer();
  const toast = useToast();
  const stations = useFetch('/api/stations');
  const t = p.current;
  const radio = p.mode === 'radio';

  return (
    <div className="car-mode">
      <div className="car-top">
        <Link to="/" className="btn btn-ghost">
          <Icon name="close" /> خروج
        </Link>
        <span className="muted small">جهّز اللي هتسمعه قبل ما تسوق 🚗</span>
      </div>
      <div className="car-now">
        <Cover src={t?.cover} className="car-cover" seed={t?.id} />
        <div className="car-title">{t?.title || 'اختار محطة'}</div>
        <div className="car-sub">{radio ? `● ${p.radio?.station?.name || ''}` : t?.work?.title || t?.artist?.name || ''}</div>
      </div>
      <div className="car-controls" dir="ltr">
        <button type="button" onClick={p.prev} disabled={radio} aria-label="السابق">
          <Icon name="prev" size={48} />
        </button>
        <button type="button" className="car-play" onClick={p.toggle} aria-label={p.isPlaying ? 'إيقاف' : 'تشغيل'}>
          <Icon name={p.isPlaying ? 'pause' : 'play'} size={64} />
        </button>
        <button type="button" onClick={() => p.next()} disabled={radio} aria-label="التالي">
          <Icon name="next" size={48} />
        </button>
      </div>
      <div className="car-stations">
        {stations.data?.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`car-station ${radio && p.radio?.slug === s.slug ? 'on' : ''}`}
            style={{ '--station': s.color }}
            onClick={() => p.playStation(s.slug)}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          className="car-station"
          onClick={() => p.surprise().catch((e) => toast(e.message, 'error'))}
        >
          🎲 فاجئني
        </button>
      </div>
    </div>
  );
}
