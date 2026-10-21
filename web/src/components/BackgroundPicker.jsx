import { useEffect, useState } from 'react';
import { SCENES } from '../bgScenes.js';
import { BG_SETTING_EVENT, getBackgroundScene, setBackgroundScene } from './SynthBackground.jsx';

/** Pick the animated background. Applies instantly; remembered on this device. */
export default function BackgroundPicker() {
  const [value, setValue] = useState(getBackgroundScene);
  useEffect(() => {
    const sync = () => setValue(window.__dmsBgScene || getBackgroundScene());
    window.addEventListener(BG_SETTING_EVENT, sync);
    return () => window.removeEventListener(BG_SETTING_EVENT, sync);
  }, []);

  const choose = (id) => {
    setValue(id);
    setBackgroundScene(id);
  };

  const dark = (() => {
    const t = document.documentElement.dataset.theme;
    return !t || t === 'dark';
  })();

  return (
    <div className="bg-picker">
      <div className="bg-options" role="radiogroup" aria-label="خلفية الموقع">
        {[...SCENES, { id: 'none', name: 'من غير خلفية متحركة', swatch: 'var(--bg)' }].map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value === s.id}
            className={`bg-option ${value === s.id ? 'on' : ''}`}
            onClick={() => choose(s.id)}
          >
            <span className="bg-swatch" style={{ background: s.swatch }} />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        الخلفية بتتحرك مع الأغنية اللي شغالة، ومع الماوس أو لمس الشاشة.
        {dark ? '' : ' بتظهر في الثيم الليلي بس.'}
      </p>
    </div>
  );
}
