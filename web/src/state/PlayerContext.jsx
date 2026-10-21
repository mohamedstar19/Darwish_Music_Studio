import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
// hls.js is imported on demand, only when an HLS (.m3u8) station is played.
import { api, listenerId, saveStorage, storage, streamUrl } from '../api.js';

const PlayerContext = createContext(null);

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  if (!audioRef.current) {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }
  const audio = audioRef.current;

  const saved = useMemo(() => storage('dms.player', null), []);
  const [queue, setQueue] = useState(saved?.queue || []);
  const [index, setIndex] = useState(saved?.index ?? 0);
  const [mode, setMode] = useState('queue'); // 'queue' | 'radio'
  const [radio, setRadio] = useState(null); // { slug, station, track, upNext, recent, listeners, ... }
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(saved?.time || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => storage('dms.volume', 0.9));
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(null);
  const [repeat, setRepeat] = useState('off'); // 'off' | 'all' | 'one'
  const [shuffle, setShuffle] = useState(false);
  const [sleep, setSleep] = useState(null); // { until } | { endOfTrack: true }
  const [source, setSource] = useState('ondemand');

  // External stations have no track in our library; show the station (and its live song title) instead.
  const externalNow = useMemo(() => {
    if (mode !== 'radio' || !radio?.external) return null;
    return {
      id: null,
      external: true,
      title: radio.nowTitle || radio.station?.name || '',
      artist: null,
      work: null,
      cover: radio.station?.logo || null,
      duration: 0,
    };
  }, [mode, radio?.external, radio?.nowTitle, radio?.station?.name, radio?.station?.logo]);

  const current = mode === 'radio' ? externalNow || radio?.track || null : queue[index] || null;

  // Latest state for event handlers registered once.
  const st = useRef({});
  st.current = { queue, index, mode, radio, repeat, sleep, current, source, isPlaying, time };

  const pendingOffset = useRef(null);
  const loadedTrackId = useRef(null);
  const listen = useRef({ trackId: null, seconds: 0, lastTime: 0, source: 'ondemand', stationId: null });
  const radioRetry = useRef(null);
  const hlsRef = useRef(null);
  const externalRetried = useRef(false);

  const detachHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // ---- Listening log ----
  const flushListen = useCallback((useBeacon = false) => {
    const l = listen.current;
    if ((l.trackId || l.stationId) && l.seconds >= 5) {
      const body = { trackId: l.trackId, seconds: Math.round(l.seconds), source: l.source, stationId: l.stationId };
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/plays', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      } else {
        api.post('/api/plays', body).catch(() => {});
      }
    }
    listen.current = { ...l, trackId: null, seconds: 0, lastTime: 0 };
  }, []);

  const load = useCallback(
    (track, { offset = 0, autoplay = true, src = 'ondemand', stationId = null } = {}) => {
      if (!track) return;
      flushListen();
      detachHls();
      listen.current = { trackId: track.id, seconds: 0, lastTime: offset, source: src, stationId };
      setError(null);
      setTime(offset);
      setDuration(track.duration || 0);
      pendingOffset.current = offset > 0 ? offset : null;
      loadedTrackId.current = track.id;
      audio.src = streamUrl(track.id);
      if (autoplay) {
        audio.play().catch((err) => {
          if (err.name !== 'AbortError') setIsPlaying(false);
        });
      }
    },
    [audio, flushListen, detachHls],
  );

  /** Start an external internet-radio stream (Icecast/Shoutcast/HLS) from its live edge. */
  const startExternal = useCallback(
    async (data) => {
      flushListen();
      detachHls();
      listen.current = { trackId: null, seconds: 0, lastTime: 0, source: 'radio', stationId: data.station.id };
      setError(null);
      setTime(0);
      setDuration(0);
      pendingOffset.current = null;
      loadedTrackId.current = `ext:${data.station.slug}`;
      let url = data.streamUrl;
      // Browsers block http:// audio on an https:// page, so relay it through our server.
      if (window.location.protocol === 'https:' && url.startsWith('http:') && !data.isHls) {
        url = `/api/stations/${data.station.slug}/stream`;
      }
      if (data.isHls && !audio.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) {
          setError('المتصفح ده مش بيدعم نوع البث ده');
          return;
        }
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (d.fatal) setError('المحطة مش متاحة دلوقتي. جرب تاني بعد شوية.');
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
      } else {
        audio.src = url;
      }
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') setIsPlaying(false);
      });
    },
    [audio, flushListen, detachHls],
  );

  // ---- On-demand queue ----
  const playList = useCallback(
    (tracks, startIndex = 0, src = 'ondemand') => {
      const list = (tracks || []).filter(Boolean);
      if (!list.length) return;
      clearTimeout(radioRetry.current);
      setMode('queue');
      setRadio(null);
      setSource(src);
      let q = list;
      let i = Math.min(Math.max(startIndex, 0), list.length - 1);
      if (shuffle) {
        const first = list[i];
        q = [first, ...shuffled(list.filter((_, k) => k !== i))];
        i = 0;
      }
      setQueue(q);
      setIndex(i);
      load(q[i], { src });
    },
    [load, shuffle],
  );

  const playTrack = useCallback((track, src) => playList([track], 0, src), [playList]);

  const jumpTo = useCallback(
    (i) => {
      const q = st.current.queue;
      if (!q[i]) return;
      setMode('queue');
      setRadio(null);
      setIndex(i);
      load(q[i], { src: st.current.source });
    },
    [load],
  );

  const playNext = useCallback(
    (track) => {
      if (st.current.mode !== 'queue' || !st.current.queue.length) return playTrack(track);
      const at = st.current.index;
      setQueue((q) => {
        const copy = [...q];
        copy.splice(at + 1, 0, track);
        return copy;
      });
      return undefined;
    },
    [playTrack],
  );

  const addToQueue = useCallback(
    (tracks) => {
      const list = [].concat(tracks);
      if (st.current.mode !== 'queue' || !st.current.queue.length) return playList(list);
      setQueue((q) => [...q, ...list]);
      return undefined;
    },
    [playList],
  );

  const removeFromQueue = useCallback((i) => {
    setQueue((q) => q.filter((_, k) => k !== i));
    setIndex((cur) => (i < cur ? cur - 1 : cur));
  }, []);

  const next = useCallback(
    (auto = false) => {
      const s = st.current;
      if (s.mode === 'radio') return;
      if (!s.queue.length) return;
      if (s.index < s.queue.length - 1) {
        jumpTo(s.index + 1);
      } else if (s.repeat === 'all' || !auto) {
        jumpTo(0);
      } else {
        flushListen();
        setIsPlaying(false);
      }
    },
    [jumpTo, flushListen],
  );

  const prev = useCallback(() => {
    const s = st.current;
    if (s.mode === 'radio') return;
    if (audio.currentTime > 4 || s.index === 0) {
      audio.currentTime = 0;
      return;
    }
    jumpTo(s.index - 1);
  }, [audio, jumpTo]);

  // ---- Radio ----
  const tuneRadio = useCallback(
    async (slug, { autoplay = true } = {}) => {
      clearTimeout(radioRetry.current);
      const asked = performance.now();
      let data;
      try {
        data = await api.get(`/api/stations/${slug}/now?listener=${listenerId()}`);
      } catch (err) {
        setError(err.message);
        return;
      }
      const latency = (performance.now() - asked) / 2000;
      if (data.external && !data.empty) {
        setRadio({ slug, ...data });
        // Already tuned in and playing: only refresh the song title / listener count.
        const tuned = loadedTrackId.current === `ext:${slug}` && !audio.paused && !audio.ended;
        if (!tuned) startExternal(data);
        return;
      }
      if (data.empty || !data.track) {
        setRadio({ slug, ...data });
        setError('المحطة دي لسه مفيهاش أغاني متاحة');
        setIsPlaying(false);
        return;
      }
      setRadio({ slug, ...data });
      const remaining = (new Date(data.endsAt) - new Date(data.serverTime)) / 1000;
      if (loadedTrackId.current === data.track.id && audio.src && !audio.ended) {
        // Same song: just correct drift if it is noticeable.
        const expected = data.offsetSec + latency;
        if (Math.abs(audio.currentTime - expected) > 8) audio.currentTime = expected;
        return;
      }
      if (loadedTrackId.current === data.track.id && audio.ended && remaining > 0.5) {
        // We finished slightly before the station clock; wait for the next song.
        radioRetry.current = setTimeout(() => tuneRadio(slug, { autoplay }), remaining * 1000 + 300);
        return;
      }
      load(data.track, { offset: data.offsetSec + latency, autoplay, src: 'radio', stationId: data.station.id });
    },
    [audio, load, startExternal],
  );

  const playStation = useCallback(
    (slug) => {
      flushListen();
      detachHls();
      audio.pause();
      externalRetried.current = false;
      loadedTrackId.current = null;
      setMode('radio');
      setSource('radio');
      setRadio({ slug, loading: true });
      tuneRadio(slug);
    },
    [audio, flushListen, detachHls, tuneRadio],
  );

  // Keep radio in sync and listener counts fresh.
  useEffect(() => {
    if (mode !== 'radio' || !radio?.slug || !isPlaying) return undefined;
    const t = setInterval(() => tuneRadio(radio.slug), 30_000);
    return () => clearInterval(t);
  }, [mode, radio?.slug, isPlaying, tuneRadio]);

  // ---- Basic controls ----
  const toggle = useCallback(() => {
    const s = st.current;
    if (s.mode === 'radio' && s.radio?.slug) {
      if (audio.paused) tuneRadio(s.radio.slug); // rejoin live, never resume behind
      else audio.pause();
      return;
    }
    if (!s.current) return;
    if (!audio.src || loadedTrackId.current !== s.current.id) {
      load(s.current, { offset: s.time, src: s.source });
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [audio, load, tuneRadio]);

  const seek = useCallback(
    (sec) => {
      if (st.current.mode === 'radio') return;
      if (Number.isFinite(sec)) {
        audio.currentTime = Math.max(0, sec);
        listen.current.lastTime = audio.currentTime;
        setTime(audio.currentTime);
      }
    },
    [audio],
  );

  const setVolume = useCallback(
    (v) => {
      const vol = Math.min(Math.max(v, 0), 1);
      audio.volume = vol;
      setVolumeState(vol);
      setMuted(false);
      audio.muted = false;
      saveStorage('dms.volume', vol);
    },
    [audio],
  );

  const toggleMute = useCallback(() => {
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, [audio]);

  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const s = st.current;
      if (!on && s.mode === 'queue' && s.queue.length > 1) {
        const cur = s.queue[s.index];
        setQueue([cur, ...shuffled(s.queue.filter((_, k) => k !== s.index))]);
        setIndex(0);
      }
      return !on;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const setSleepTimer = useCallback((minutes) => {
    if (!minutes) setSleep(null);
    else if (minutes === 'end') setSleep({ endOfTrack: true });
    else setSleep({ until: Date.now() + minutes * 60_000, minutes });
  }, []);

  const surprise = useCallback(
    async (filter = '') => {
      const tracks = await api.get(`/api/tracks/random?count=25${filter}`);
      if (!tracks.length) throw new Error('مفيش أغاني متاحة لسه');
      playList(tracks, 0, 'surprise');
      return tracks[0];
    },
    [playList],
  );

  // ---- Audio element events (registered once) ----
  useEffect(() => {
    audio.volume = volume;
    const onTime = () => {
      const t = audio.currentTime;
      const l = listen.current;
      const delta = t - l.lastTime;
      if (delta > 0 && delta < 2) l.seconds += delta;
      l.lastTime = t;
      setTime(t);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
      if (pendingOffset.current !== null) {
        audio.currentTime = Math.min(pendingOffset.current, Math.max(0, (audio.duration || 0) - 0.5));
        listen.current.lastTime = audio.currentTime;
        pendingOffset.current = null;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setError(null);
      externalRetried.current = false;
    };
    const onEnded = () => {
      const s = st.current;
      flushListen();
      if (s.sleep?.endOfTrack) {
        setSleep(null);
        setIsPlaying(false);
        return;
      }
      if (s.mode === 'radio' && s.radio?.slug) {
        tuneRadio(s.radio.slug);
        return;
      }
      if (s.repeat === 'one') {
        audio.currentTime = 0;
        listen.current = { ...listen.current, trackId: s.current?.id, lastTime: 0, seconds: 0 };
        audio.play().catch(() => {});
        return;
      }
      next(true);
    };
    const onError = () => {
      if (!audio.src || !loadedTrackId.current) return;
      setBuffering(false);
      const s = st.current;
      if (s.mode === 'radio' && s.radio?.external) {
        // External stream dropped or refused: try reconnecting once, then tell the listener.
        setError(navigator.onLine ? 'المحطة مش متاحة دلوقتي. جرب تاني بعد شوية.' : 'انقطع الاتصال بالإنترنت');
        if (navigator.onLine && !externalRetried.current) {
          externalRetried.current = true;
          setTimeout(() => tuneRadio(s.radio.slug), 4000);
        }
        return;
      }
      const msg = navigator.onLine ? 'تعذر تشغيل الأغنية دي. هنجرب اللي بعدها.' : 'انقطع الاتصال بالإنترنت';
      setError(msg);
      api.post('/api/telemetry/playback-error', {
        trackId: loadedTrackId.current,
        message: `${audio.error?.code || ''} ${audio.error?.message || ''}`.trim(),
      }).catch(() => {});
      if (navigator.onLine && s.mode === 'queue' && s.index < s.queue.length - 1) {
        setTimeout(() => next(true), 2500);
      }
    };
    const onOffline = () => setError('انقطع الاتصال بالإنترنت. هنكمل أول ما يرجع.');
    const onOnline = () => {
      setError(null);
      const s = st.current;
      if (s.mode === 'radio' && s.radio?.slug) tuneRadio(s.radio.slug);
      else if (s.current && audio.error) load(s.current, { offset: audio.currentTime || 0, src: s.source });
    };
    const onUnload = () => flushListen(true);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onUnload);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, next, tuneRadio, load, flushListen]);

  // ---- Sleep timer with a gentle fade-out ----
  useEffect(() => {
    if (!sleep?.until) return undefined;
    const tick = setInterval(() => {
      const left = sleep.until - Date.now();
      if (left <= 0) {
        audio.pause();
        audio.volume = volume;
        setSleep(null);
      } else if (left < 15_000) {
        audio.volume = volume * (left / 15_000);
      }
    }, 500);
    return () => {
      clearInterval(tick);
      audio.volume = volume;
    };
  }, [sleep, audio, volume]);

  /** Stop and close the player completely (the ✕ on the player). */
  const stop = useCallback(() => {
    flushListen();
    detachHls();
    clearTimeout(radioRetry.current);
    loadedTrackId.current = null;
    pendingOffset.current = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setQueue([]);
    setIndex(0);
    setMode('queue');
    setRadio(null);
    setIsPlaying(false);
    setBuffering(false);
    setTime(0);
    setDuration(0);
    setError(null);
    setSleep(null);
    saveStorage('dms.player', null);
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }, [audio, flushListen, detachHls]);

  // ---- Lock screen / headset controls ----
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const origin = window.location.origin;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.title,
      artist: current.artist?.name || (mode === 'radio' ? radio?.station?.name : '') || 'Darwish Music Studio',
      album: current.work?.title || '',
      artwork: current.cover ? [{ src: origin + current.cover, sizes: '800x800', type: 'image/jpeg' }] : [],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => toggle());
    ms.setActionHandler('pause', () => audio.pause());
    try {
      ms.setActionHandler('stop', () => stop());
    } catch {
      // stop action not supported
    }
    ms.setActionHandler('nexttrack', mode === 'radio' ? null : () => next());
    ms.setActionHandler('previoustrack', mode === 'radio' ? null : () => prev());
    try {
      ms.setActionHandler('seekto', mode === 'radio' ? null : (d) => seek(d.seekTime));
    } catch {
      // seekto not supported in this browser
    }
  }, [current, mode, radio?.station?.name, toggle, next, prev, seek, audio, stop]);

  useEffect(() => {
    document.title = current ? `${current.title} · Darwish Music Studio` : 'Darwish Music Studio';
  }, [current]);

  // Remember the queue so a reload resumes where you were.
  useEffect(() => {
    if (mode !== 'queue' || !queue.length) return;
    saveStorage('dms.player', { queue: queue.slice(0, 300), index, time: Math.floor(time) });
  }, [queue, index, mode, Math.floor(time / 5)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The time changes 4 times a second while playing. It lives in its own context so only the
  // progress bar re-renders for it, not every card and list on the page.
  const value = useMemo(
    () => ({
      audio,
      current,
      queue,
      index,
      mode,
      radio,
      isPlaying,
      duration,
      volume,
      muted,
      buffering,
      error,
      repeat,
      shuffle,
      sleep,
      playList,
      playTrack,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setSleepTimer,
      playStation,
      surprise,
      stop,
    }),
    [
      audio, current, queue, index, mode, radio, isPlaying, duration, volume, muted, buffering, error, repeat,
      shuffle, sleep, playList, playTrack, playNext, addToQueue, removeFromQueue, jumpTo, toggle, next, prev,
      seek, setVolume, toggleMute, toggleShuffle, cycleRepeat, setSleepTimer, playStation, surprise, stop,
    ],
  );
  const timeValue = useMemo(() => ({ time, duration }), [time, duration]);

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={timeValue}>{children}</PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}

const PlayerTimeContext = createContext({ time: 0, duration: 0 });

export function usePlayer() {
  return useContext(PlayerContext);
}

/** Current playback position; only components that show it should use this. */
export function usePlayerTime() {
  return useContext(PlayerTimeContext);
}
