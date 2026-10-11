// Tiny Web Audio helpers: a click for tapping and a metronome for the school card.

let ac = null;
const ctx = () => (ac ??= new (window.AudioContext || window.webkitAudioContext)());

export function tick(freq = 1000, when = 0, gain = 0.25) {
    const a = ctx();
    const t = a.currentTime + when;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.07);
}

let metro = null;

/** Start a metronome; calls onBeat(i) on every beat for visual sync. Returns a stop function. */
export function startMetronome(bpm, onBeat) {
    stopMetronome();
    const interval = 60000 / bpm;
    let i = 0;
    const beat = () => { tick(i % 4 === 0 ? 1320 : 880); onBeat?.(i); i++; };
    beat();
    metro = setInterval(beat, interval);
    return stopMetronome;
}

export function stopMetronome() {
    if (metro) clearInterval(metro);
    metro = null;
}
