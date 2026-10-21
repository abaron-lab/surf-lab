// Procedural ocean sound: filtered noise for the roar, short bursts for spray.
// Starts only after a user gesture (browser autoplay rules).

export function createAudio() {
  let ctx = null, roarGain, roarFilter, hissGain, master, noiseBuf;
  let muted = false;

  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.015 * w * 6; d[i] = b * 0.6 + w * 0.08; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    roarFilter = ctx.createBiquadFilter(); roarFilter.type = 'lowpass'; roarFilter.frequency.value = 500;
    roarGain = ctx.createGain(); roarGain.gain.value = 0.3;
    src.connect(roarFilter).connect(roarGain).connect(master);
    src.start();
    const src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true; src2.playbackRate.value = 1.7;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    hissGain = ctx.createGain(); hissGain.gain.value = 0;
    src2.connect(hp).connect(hissGain).connect(master);
    src2.start();
  }

  function burst(freq = 1800, dur = 0.35, vol = 0.4) {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }

  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
    // intensity 0..1 (closeness to the breaking lip), tube 0/1, speed m/s
    update(intensity, tube, speed) {
      if (!ctx) return;
      const t = ctx.currentTime;
      roarGain.gain.setTargetAtTime(0.18 + intensity * 0.5 + tube * 0.25, t, 0.2);
      roarFilter.frequency.setTargetAtTime(tube ? 280 : 420 + intensity * 600, t, 0.2);
      hissGain.gain.setTargetAtTime(Math.min(0.12, speed / 160), t, 0.1);
    },
    splash(v = 1) { burst(1200 + Math.random() * 800, 0.3 + v * 0.2, 0.25 * v); },
    whoosh() { burst(900, 0.6, 0.35); },
  };
}
