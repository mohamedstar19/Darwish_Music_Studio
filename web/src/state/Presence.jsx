import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, listenerId } from '../api.js';
import { usePlayer } from './PlayerContext.jsx';

const InstallContext = createContext({ canInstall: false, install: async () => false, installed: false });

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function appEvent(kind) {
  api.post('/api/telemetry/app-event', { kind, listenerId: listenerId() }).catch(() => {});
}

/**
 * Sends a heartbeat so the admin "live" dashboard can show who is online and
 * what they are listening to, and records visits, app launches and installs.
 */
export function PresenceProvider({ children }) {
  const player = usePlayer();
  const location = useLocation();
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const latest = useRef({});
  latest.current = {
    page: location.pathname,
    mode: player.mode,
    playing: player.isPlaying,
    trackId: player.current?.id ?? null,
    stationSlug: player.mode === 'radio' ? player.radio?.slug : null,
    position: player.time,
  };

  useEffect(() => {
    try {
      if (!sessionStorage.getItem('dms.visit')) {
        sessionStorage.setItem('dms.visit', '1');
        appEvent(isStandalone() ? 'app_open' : 'visit');
      }
    } catch {
      appEvent('visit');
    }
    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      appEvent('install');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const send = () => {
    api.post('/api/presence', { listenerId: listenerId(), installed: isStandalone(), ...latest.current }).catch(() => {});
  };

  // Heartbeat every 20s, plus right away when what's playing changes.
  useEffect(() => {
    send();
    const t = setInterval(send, 20_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(send, 400);
    return () => clearTimeout(t);
  }, [player.isPlaying, player.current?.id, player.mode, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    if (!promptEvent) return false;
    promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
    return choice?.outcome === 'accepted';
  };

  return (
    <InstallContext.Provider value={{ canInstall: !!promptEvent && !installed, install, installed }}>
      {children}
    </InstallContext.Provider>
  );
}

export function useInstall() {
  return useContext(InstallContext);
}
