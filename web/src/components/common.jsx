import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

export function Cover({ src, alt = '', size, className = '', round = false, seed = 0 }) {
  const hue = (Number(seed) * 47) % 360;
  return (
    <div
      className={`cover ${round ? 'cover-round' : ''} ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <div className="cover-fallback" style={{ '--hue': hue }}>
          <Icon name="music" size={28} />
        </div>
      )}
    </div>
  );
}

export function Loading({ label = 'بيحمّل...' }) {
  return (
    <div className="loading" role="status">
      <span className="eq">
        <i />
        <i />
        <i />
        <i />
      </span>
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <p>{error.message || String(error)}</p>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          جرب تاني
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ icon = 'music', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {children ? <div className="muted">{children}</div> : null}
    </div>
  );
}

export function Section({ title, to, action, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {to ? (
          <Link to={to} className="see-all">
            عرض الكل
          </Link>
        ) : (
          action
        )}
      </div>
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ cover, kicker, title, subtitle, color, children, round }) {
  return (
    <header className="page-header" style={color ? { '--accent-local': color } : undefined}>
      {cover !== undefined ? <Cover src={cover} size={180} className="page-header-cover" round={round} /> : null}
      <div className="page-header-text">
        {kicker ? <div className="kicker">{kicker}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
        {children ? <div className="page-header-actions">{children}</div> : null}
      </div>
    </header>
  );
}
