import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { Loading } from './common.jsx';

/** One-time recovery codes: shown once, with copy and download. */
function RecoveryCodes({ codes, onDone }) {
  const toast = useToast();
  const text = `Darwish Music Studio — أكواد الطوارئ (كل كود يشتغل مرة واحدة)\n\n${codes.join('\n')}\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('اتنسخوا', 'success');
    } catch {
      toast('مقدرتش أنسخ، اكتبهم بإيدك', 'error');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dms-recovery-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="tfa-box">
      <b>احفظ أكواد الطوارئ دي في مكان آمن</b>
      <p className="muted small">
        لو الموبايل ضاع أو اتمسح التطبيق، تقدر تدخل بواحد منهم بدل الكود. كل كود بيشتغل مرة واحدة، ومش هتشوفهم تاني.
      </p>
      <div className="tfa-codes" dir="ltr">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <div className="row-btns">
        <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
          انسخهم
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={download}>
          نزّلهم ملف
        </button>
        <button type="button" className="btn btn-primary btn-small" onClick={onDone}>
          حفظتهم ✓
        </button>
      </div>
    </div>
  );
}

const codeInput = (props) => (
  <input
    className="input tfa-input"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9 ]{6,7}"
    maxLength={7}
    placeholder="123456"
    dir="ltr"
    required
    {...props}
  />
);

/**
 * 2-step sign-in settings: turn on (QR code → first code → recovery codes),
 * new recovery codes, or turn off. `onEnabled` runs once it is on and the codes are saved.
 */
export default function TwoFactorSettings({ onEnabled }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, qrSvg }
  const [codes, setCodes] = useState(null);
  const [mode, setMode] = useState(null); // 'disable' | 'recovery'
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/api/auth/2fa').then(setStatus).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <Loading />;

  if (codes) {
    return (
      <RecoveryCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          load();
          onEnabled?.();
        }}
      />
    );
  }

  if (setup) {
    return (
      <form
        className="tfa-box"
        onSubmit={(e) => {
          e.preventDefault();
          const code = new FormData(e.target).get('code');
          run(async () => {
            const r = await api.post('/api/auth/2fa/confirm', { code });
            setUser(r.user);
            setSetup(null);
            setCodes(r.recoveryCodes);
            toast('التحقق بخطوتين اشتغل', 'success');
          });
        }}
      >
        <ol className="tfa-steps">
          <li>
            نزّل تطبيق <b>Google Authenticator</b> أو <b>Microsoft Authenticator</b> على موبايلك.
          </li>
          <li>من التطبيق اختار "إضافة حساب" ← "امسح رمز QR" وامسح ده:</li>
        </ol>
        <img className="tfa-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`} alt="QR" width="200" height="200" />
        <p className="muted small">
          مش قادر تمسح؟ اختار "إدخال مفتاح" واكتب: <code dir="ltr">{setup.secret}</code>
        </p>
        <label>
          3. اكتب الكود اللي ظهر في التطبيق
          {codeInput({ name: 'code', autoFocus: true })}
        </label>
        <div className="row-btns">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'لحظة...' : 'تأكيد وتشغيل'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
            إلغاء
          </button>
        </div>
      </form>
    );
  }

  if (!status.enabled) {
    return (
      <div className="tfa-box">
        <p className="muted small">
          بعد ما تكتب كلمة المرور، الموقع هيطلب كود من 6 أرقام بيتغير كل 30 ثانية في تطبيق على موبايلك. كده حتى لو حد عرف كلمة
          المرور مش هيقدر يدخل.
        </p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(async () => setSetup(await api.post('/api/auth/2fa/setup')))}>
          فعّل التحقق بخطوتين
        </button>
      </div>
    );
  }

  return (
    <div className="tfa-box">
      <p>
        <span className="status status-ready">✓ شغال</span>{' '}
        <span className="muted small">باقي {status.recoveryLeft} من أكواد الطوارئ</span>
      </p>
      {status.recoveryLeft <= 2 ? <p className="form-error small">أكواد الطوارئ قربت تخلص. اعمل أكواد جديدة.</p> : null}
      {!mode ? (
        <div className="row-btns">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setMode('recovery')}>
            أكواد طوارئ جديدة
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setMode('disable')}>
            إيقاف التحقق بخطوتين
          </button>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            const body = { password: f.get('password'), code: f.get('code') };
            run(async () => {
              if (mode === 'disable') {
                const r = await api.post('/api/auth/2fa/disable', body);
                setUser(r.user);
                toast('التحقق بخطوتين اتوقف', 'success');
                setMode(null);
                load();
              } else {
                const r = await api.post('/api/auth/2fa/recovery', body);
                setMode(null);
                setCodes(r.recoveryCodes);
              }
            });
          }}
        >
          {mode === 'disable' && status.required ? (
            <p className="form-error small">حسابك حساب إدارة: لو وقفته، لوحة الإدارة هتطلب منك تفعّله تاني.</p>
          ) : null}
          <label>
            كلمة المرور
            <input name="password" type="password" className="input" required autoComplete="current-password" />
          </label>
          <label>
            الكود من التطبيق
            {codeInput({ name: 'code' })}
          </label>
          <div className="row-btns">
            <button className={`btn ${mode === 'disable' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
              {mode === 'disable' ? 'إيقاف' : 'اعمل أكواد جديدة'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>
              رجوع
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
