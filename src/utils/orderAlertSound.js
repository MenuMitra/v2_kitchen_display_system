export const SOUND_STORAGE_KEY = "kds_order_alert_sound";
export const DEFAULT_ALERT_SOUND = "chime";

export const SOUND_OPTIONS = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "beep", label: "Beep" },
];

const SOUND_PATTERNS = {
  chime: [
    { frequency: 880, duration: 0.12, delay: 0 },
    { frequency: 1174, duration: 0.18, delay: 0.14 },
  ],
  bell: [
    { frequency: 740, duration: 0.25, delay: 0 },
    { frequency: 988, duration: 0.35, delay: 0.08 },
  ],
  beep: [
    { frequency: 1046, duration: 0.15, delay: 0 },
    { frequency: 1046, duration: 0.15, delay: 0.25 },
  ],
};

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playOrderAlertSound(soundName = DEFAULT_ALERT_SOUND) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const pattern = SOUND_PATTERNS[soundName] || SOUND_PATTERNS[DEFAULT_ALERT_SOUND];
  const now = ctx.currentTime;

  pattern.forEach((tone) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + tone.delay;
    const end = start + tone.duration;

    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}

export function getSelectedAlertSound() {
  return localStorage.getItem(SOUND_STORAGE_KEY) || DEFAULT_ALERT_SOUND;
}

export function setSelectedAlertSound(soundName) {
  localStorage.setItem(SOUND_STORAGE_KEY, soundName);
}

export function getSoundLabel(soundName) {
  const option = SOUND_OPTIONS.find((item) => item.value === soundName);
  return option?.label || "Chime";
}
