"use strict";

const STORAGE_KEY = "aster-synth-state-v1";
const $ = (selector) => document.querySelector(selector);
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const state = {
  root: 0, scale: "major", seventh: false, wave: "sawtooth", cutoff: 0.6, attack: 0.02, release: 0.4, bpm: 90,
  steps: [], // chord progression, stored as scale degrees so it follows key changes
  ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
};
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

// Diatonic chord on scale degree d (0-6): thirds stacked from the scale.
function chord(root, scale, d, seventh) {
  const s = SCALES[scale];
  const tone = (i) => s[(d + i) % 7] + 12 * Math.floor((d + i) / 7);
  const iv = (seventh ? [2, 4, 6] : [2, 4]).map((i) => tone(i) - tone(0));
  const minor = iv[0] === 3, dim = iv[1] === 6;
  const flatKey = [1, 3, 5, 8, 10].includes((root + (scale === "minor" ? 3 : 0)) % 12); // by relative major
  const pitch = (root + tone(0)) % 12;
  const suffix = seventh ? (dim ? "m7b5" : minor ? "m7" : iv[2] === 11 ? "maj7" : "7") : dim ? "dim" : minor ? "m" : "";
  return {
    name: (flatKey ? FLAT : SHARP)[pitch] + suffix,
    roman: (minor ? ROMAN[d].toLowerCase() : ROMAN[d]) + (dim ? "°" : ""),
    notes: [36 + pitch, 48 + pitch, ...iv.map((i) => 48 + pitch + i)], // MIDI: bass note + chord rooted in the C3 octave
  };
}
console.assert(ROMAN.map((_, d) => chord(0, "major", d, true).name).join(" ") === "Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5", "chord self-check: C major");
console.assert(ROMAN.map((_, d) => chord(0, "minor", d, false).name).join(" ") === "Cm Ddim Eb Fm Gm Ab Bb", "chord self-check: C minor");

let ctx, filter;
const cutoffHz = () => 100 * 2 ** (state.cutoff * 7); // slider moves in octaves: pitch hearing is logarithmic
function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: cutoffHz(), Q: 2 });
    filter.connect(new DynamicsCompressorNode(ctx)).connect(ctx.destination); // overlapping pads must not clip
  }
  ctx.resume(); // browsers start the context suspended until a touch
  return ctx;
}
function noteOn(notes, t = audio().currentTime) {
  const gain = new GainNode(ctx, { gain: 0 });
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.5 / notes.length, t + state.attack);
  gain.connect(filter);
  const oscs = notes.flatMap((n) => [-6, 6].map((detune) => { // detuned pair per note for a fuller tone
    const osc = new OscillatorNode(ctx, { type: state.wave, frequency: 440 * 2 ** ((n - 69) / 12), detune });
    osc.connect(gain);
    osc.start(t);
    return osc;
  }));
  return { gain, oscs };
}
function noteOff({ gain, oscs }, t = ctx.currentTime) {
  gain.gain.cancelAndHoldAtTime(t); // shortcut: Chromium/Safari only, fine in Android WebView; replace if this must run in Firefox
  gain.gain.linearRampToValueAtTime(0, t + state.release);
  oscs.forEach((osc) => osc.stop(t + state.release));
}

let rec = false;
$("#rec").onclick = (e) => e.currentTarget.setAttribute("aria-pressed", (rec = !rec));

const pads = ROMAN.map((_, d) => {
  const pad = document.createElement("button");
  pad.className = "pad";
  pad.style.setProperty("--h", 250 + d * 47);
  let voice;
  const down = () => {
    if (voice) return;
    voice = noteOn(chord(state.root, state.scale, d, state.seventh).notes);
    pad.classList.add("on");
    if (rec) { state.steps.push({ d, seventh: state.seventh }); save(); render(); }
  };
  const up = () => {
    if (!voice) return;
    noteOff(voice);
    voice = null;
    pad.classList.remove("on");
  };
  pad.onpointerdown = (e) => { pad.setPointerCapture(e.pointerId); down(); };
  pad.onlostpointercapture = pad.onblur = pad.onkeyup = up;
  pad.onkeydown = (e) => { if (!e.repeat && (e.key === " " || e.key === "Enter")) down(); };
  $("#seventh").before(pad);
  return pad;
});

let timer = null, step, nextTime, seqVoice, current = -1;
function tick() {
  while (nextTime < ctx.currentTime + 0.1) { // schedule ahead on the audio clock: JS timers jitter
    const i = step++ % state.steps.length, s = state.steps[i], bar = 240 / state.bpm;
    seqVoice = noteOn(chord(state.root, state.scale, s.d, s.seventh).notes, nextTime);
    noteOff(seqVoice, nextTime + bar * 0.95);
    setTimeout(() => { if (timer) { current = i; render(); } }, (nextTime - ctx.currentTime) * 1000);
    nextTime += bar;
  }
}
function play(on) {
  clearInterval(timer);
  timer = null;
  current = -1;
  if (seqVoice) noteOff(seqVoice);
  seqVoice = null;
  if (on && state.steps.length) {
    step = 0;
    nextTime = audio().currentTime + 0.05;
    timer = setInterval(tick, 25);
  }
  render();
}
$("#play").onclick = () => play(!timer);

function render() {
  pads.forEach((pad, d) => {
    const c = chord(state.root, state.scale, d, state.seventh);
    pad.innerHTML = `<small>${c.roman}</small>${c.name}`;
    pad.setAttribute("aria-label", c.name);
  });
  $("#bpmOut").textContent = state.bpm;
  $("#play").textContent = timer ? "정지" : "재생";
  $("#play").disabled = !state.steps.length;
  $("#steps").replaceChildren(...state.steps.map((s, i) => {
    const chip = document.createElement("button");
    chip.textContent = chord(state.root, state.scale, s.d, s.seventh).name;
    chip.className = i === current ? "chip now" : "chip";
    chip.setAttribute("aria-label", `${chip.textContent} 삭제`);
    chip.onclick = () => { state.steps.splice(i, 1); save(); if (state.steps.length) render(); else play(false); };
    return chip;
  }));
  $(".now")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (ctx) filter.frequency.setTargetAtTime(cutoffHz(), ctx.currentTime, 0.02);
}

SHARP.forEach((name, i) => $("[data-k=root]").add(new Option(name === FLAT[i] ? name : `${name}/${FLAT[i]}`, i)));
document.querySelectorAll("[data-k]").forEach((el) => {
  const k = el.dataset.k, prop = el.type === "checkbox" ? "checked" : "value";
  el[prop] = state[k];
  el.oninput = () => {
    state[k] = prop === "checked" ? el.checked : isNaN(el.value) ? el.value : +el.value;
    save();
    render();
  };
});
document.addEventListener("visibilitychange", () => { if (document.hidden) { play(false); ctx?.suspend(); } }); // no sound from the background
render();
