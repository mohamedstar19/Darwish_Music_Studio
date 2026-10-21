import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { Modal } from './common.jsx';
import Icon from './Icon.jsx';

const Ctx = createContext(null);

function AddToPlaylistModal({ track, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [lists, setLists] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) api.get('/api/me/playlists').then(setLists).catch(() => setLists([]));
  }, [user]);

  if (!user) {
    return (
      <Modal title="إضافة لقائمة تشغيل" onClose={onClose}>
        <p>
          لازم <Link to="/login" onClick={onClose}>تسجل الدخول</Link> عشان تعمل قوائم تشغيل.
        </p>
      </Modal>
    );
  }

  const add = async (playlistId, title) => {
    setBusy(true);
    try {
      await api.post(`/api/playlists/${playlistId}/tracks`, { trackIds: [track.id] });
      toast(`اتضافت لـ "${title}"`, 'success');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const p = await api.post('/api/playlists', { title: newTitle });
      await add(p.id, p.title);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title={`إضافة "${track.title}"`} onClose={onClose}>
      <form className="row-form" onSubmit={create}>
        <input
          className="input"
          placeholder="قائمة جديدة..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={100}
        />
        <button className="btn btn-primary" disabled={busy || !newTitle.trim()}>
          إنشاء وإضافة
        </button>
      </form>
      <div className="pick-list">
        {lists === null ? <p className="muted">بيحمّل...</p> : null}
        {lists?.map((p) => (
          <button key={p.id} type="button" className="pick-item" disabled={busy} onClick={() => add(p.id, p.title)}>
            <Icon name="list" />
            <span>{p.title}</span>
            <span className="muted">{p.trackCount} أغنية</span>
          </button>
        ))}
        {lists?.length === 0 ? <p className="muted">معندكش قوائم لسه.</p> : null}
      </div>
    </Modal>
  );
}

export function ReportModal({ track, onClose }) {
  const toast = useToast();
  const [kind, setKind] = useState(track ? 'broken' : 'other');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/reports', { trackId: track?.id, kind, message, contact });
      toast('شكرًا! البلاغ وصل وهنراجعه.', 'success');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={track ? `بلاغ عن "${track.title}"` : 'إبلاغ عن مشكلة'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          نوع المشكلة
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="broken">الأغنية مش شغالة</option>
            <option value="metadata">بيانات غلط (اسم، فنان، صورة)</option>
            <option value="rights">حقوق ملكية / طلب إزالة</option>
            <option value="other">حاجة تانية</option>
          </select>
        </label>
        <label>
          التفاصيل
          <textarea className="input" rows={4} required value={message} onChange={(e) => setMessage(e.target.value)} maxLength={3000} />
        </label>
        <label>
          وسيلة تواصل (اختياري)
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
        </label>
        <button className="btn btn-primary" disabled={busy || !message.trim()}>
          إرسال البلاغ
        </button>
      </form>
    </Modal>
  );
}

export function TrackActionsProvider({ children }) {
  const [modal, setModal] = useState(null);
  const close = useCallback(() => setModal(null), []);
  const openAddToPlaylist = useCallback((track) => setModal({ type: 'playlist', track }), []);
  const openReport = useCallback((track) => setModal({ type: 'report', track }), []);
  return (
    <Ctx.Provider value={{ openAddToPlaylist, openReport }}>
      {children}
      {modal?.type === 'playlist' ? <AddToPlaylistModal track={modal.track} onClose={close} /> : null}
      {modal?.type === 'report' ? <ReportModal track={modal.track} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

export function useTrackActions() {
  return useContext(Ctx);
}
