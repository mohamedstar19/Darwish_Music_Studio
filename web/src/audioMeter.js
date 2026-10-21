/*
 * Reads how loud the music is right now, so visuals can move with the song.
 *
 * Uses audio.captureStream() + an AnalyserNode. That taps a copy of the sound
 * without rerouting playback, so nothing can go silent. It only works for our own
 * audio (library songs, synced radio, relayed streams) in browsers that support
 * captureStream (Chrome, Edge). Everywhere else (outside internet streams, Firefox,
 * Safari) we fall back to a gentle simulated beat while something is playing.
 */

const BPM = 112;

function sameOrigin(src) {
  try {
    const u = new URL(src, window.location.href);
    return u.protocol === 'blob:' || u.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function createAudioMeter(audio) {
  const canCapture = typeof audio.captureStream === 'function';
  let ctx = null;
  let analyser = null;
  let data = null;
  let source = null;
  let connectedSrc = null;
  let avgBass = 0;

  function connect() {
    if (!canCapture) return;
    const src = audio.currentSrc;
    if (!src || src === connectedSrc) return;
    try {
      source?.disconnect();
    } catch {
      // already disconnected
    }
    source = null;
    connectedSrc = src;
    if (!sameOrigin(src)) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = ctx || new Ctx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const stream = audio.captureStream();
      if (!stream.getAudioTracks().length) {
        connectedSrc = null; // tracks show up a moment later; try again on the next sample
        return;
      }
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        data = new Uint8Array(analyser.frequencyBinCount);
      }
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser); // analysis only: never connected to the speakers
    } catch {
      source = null;
    }
  }

  audio.addEventListener('playing', connect);

  return {
    /** @returns {{ energy: number, kick: number, real: boolean }} values 0..1 */
    sample(t, playing) {
      if (playing && !source && canCapture) connect();
      if (playing && source && analyser) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        analyser.getByteFrequencyData(data);
        let bass = 0;
        for (let i = 1; i < 7; i += 1) bass += data[i];
        bass /= 6 * 255;
        let all = 0;
        for (let i = 0; i < data.length; i += 1) all += data[i];
        all /= data.length * 255;
        avgBass = avgBass * 0.94 + bass * 0.06;
        const kick = Math.max(0, Math.min(1, (bass - avgBass) * 5));
        // Silent stretches (or a tainted stream) read as zero: keep a little life in it.
        if (all < 0.005) return { energy: 0.25, kick: 0, real: false };
        return { energy: Math.min(1, all * 1.8 + kick * 0.25), kick, real: true };
      }
      if (playing) {
        const phase = ((t * BPM) / 60) % 1;
        const kick = Math.exp(-phase * 7);
        return { energy: 0.3 + 0.6 * kick, kick, real: false };
      }
      return { energy: 0.06, kick: 0, real: false };
    },
    destroy() {
      audio.removeEventListener('playing', connect);
      try {
        source?.disconnect();
      } catch {
        // ignore
      }
      ctx?.close().catch(() => {});
    },
  };
}
