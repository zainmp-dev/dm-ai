const VOICE_OFF_KEY = "fp_assistant_voice_off";
const VOICE_ACCENT_KEY = "fp_assistant_voice_accent";

export type VoiceAccentPreference = "auto" | "in" | "us" | "uk";

/** User preference — default on; set to "1" in localStorage to mute assistant speech. */

export function isAssistantVoiceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(VOICE_OFF_KEY) !== "1";
}

export function setAssistantVoiceEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.removeItem(VOICE_OFF_KEY);
  } else {
    window.localStorage.setItem(VOICE_OFF_KEY, "1");
  }
}

/**
 * Spoken accent when the browser exposes matching voices.
 * `auto` prefers clear Indian English, then US, then UK.
 */

export function getVoiceAccent(): VoiceAccentPreference {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(VOICE_ACCENT_KEY)?.toLowerCase();
  if (v === "in" || v === "us" || v === "uk" || v === "auto") return v;
  return "auto";
}

export function setVoiceAccent(accent: VoiceAccentPreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_ACCENT_KEY, accent);
}

export function cancelAssistantSpeech() {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}

export function prefetchAssistantVoices() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.getVoices();
  } catch {
    /* noop */
  }
}

function normalizeLangTag(lang: string): string {
  return lang.trim().replace(/_/g, "-").toLowerCase();
}

/** Prefer the clearest English voice for onboarding — clean Indian English when available. */

function scoreVoice(v: SpeechSynthesisVoice, accent: VoiceAccentPreference): number {
  const L = normalizeLangTag(v.lang || "");
  const bundle = `${v.name} ${v.lang}`.toLowerCase();

  let s = 0;

  if (
    /samantha|aaron|nicky|daniel|karen|sangeeta|veena|rishi|google us|google uk|google english|microsoft|natural|enhanced|premium|neural|wavenet/i.test(
      bundle,
    )
  ) {
    s += 10;
  }

  if (v.default) s += 4;

  if (/compact|tiny|whisper|croak|bubbles|pipe organ|organ$/i.test(bundle)) s -= 8;

  const isEnIn = L.startsWith("en-in");
  const isEnUs = L.startsWith("en-us");
  const isEnGb = L.startsWith("en-gb") || L.startsWith("en-uk");
  const isEnAu = L.startsWith("en-au");

  if (accent === "in") {
    if (isEnIn) s += 28;
    if (/india|english.*india|indian/i.test(bundle)) s += 12;
    if (isEnUs) s += 6;
    if (isEnGb) s += 4;
    return s;
  }

  if (accent === "us") {
    if (isEnUs) s += 28;
    if (isEnIn) s += 5;
    if (isEnGb) s += 4;
    return s;
  }

  if (accent === "uk") {
    if (isEnGb || L.startsWith("en-uk")) s += 28;
    if (isEnIn) s += 5;
    if (isEnUs) s += 6;
    return s;
  }

  if (isEnIn) s += 24;
  if (isEnUs) s += 18;
  if (isEnGb || L.startsWith("en-uk")) s += 14;
  if (isEnAu) s += 10;
  if (/^en\b/.test(L)) s += 4;

  return s;
}

function pickAssistantVoice(voices: SpeechSynthesisVoice[], accent: VoiceAccentPreference): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const sorted = [...voices].sort((a, b) => scoreVoice(b, accent) - scoreVoice(a, accent));
  const best = sorted[0];
  if (accent !== "auto" && best && scoreVoice(best, accent) < 4) {
    const fallback = [...voices].sort((a, b) => scoreVoice(b, "auto") - scoreVoice(a, "auto"))[0];
    return fallback ?? best;
  }
  return best ?? null;
}

function defaultUtteranceLang(accent: VoiceAccentPreference): string {
  if (accent === "in") return "en-IN";
  if (accent === "us") return "en-US";
  if (accent === "uk") return "en-GB";
  return "en-IN";
}

/**
 * Clear, steady assistant narration: Indian English when the OS lists it, else high-quality US/UK.
 */

export function speakAssistantLine(text: string) {
  if (typeof window === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") return;
  if (!isAssistantVoiceEnabled()) return;

  const accent = getVoiceAccent();

  const run = () => {
    cancelAssistantSpeech();
    const synth = window.speechSynthesis;
    if (!synth) return;

    const voices = synth.getVoices();
    const voice = pickAssistantVoice(voices, accent);

    const u = new SpeechSynthesisUtterance(text.trim());
    u.rate = 0.96;
    u.pitch = 1;
    u.volume = 1;

    if (voice) {
      u.voice = voice;
      u.lang = normalizeLangTag(voice.lang) || defaultUtteranceLang(accent);
    } else {
      u.lang = defaultUtteranceLang(accent);
    }

    synth.speak(u);
  };

  prefetchAssistantVoices();
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (voices.length === 0 && window.speechSynthesis) {
    const onVoices = () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", onVoices);
      run();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.setTimeout(() => {
      if ((window.speechSynthesis?.getVoices().length ?? 0) > 0) {
        window.speechSynthesis?.removeEventListener("voiceschanged", onVoices);
        run();
      }
    }, 120);
    return;
  }

  run();
}
