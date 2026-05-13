/**
 * Spoken control phrases for the Web Speech overlays (workspace + admin).
 * Parsed before route / AI interpretation so "stop" never triggers a search.
 */

export type VoiceControlIntent =
  | "stop_all"
  | "stop_speech_only"
  | "clear_ui"
  | "repeat_last";

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,!?']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip light filler so "okay stop" still matches. */
function stripFiller(s: string): string {
  return s.replace(/^(okay|ok|hey|please|uh|um)\s+/i, "").trim();
}

/**
 * Returns a control intent if the transcript is only a short control phrase.
 * Long sentences that merely contain "stop" are not treated as controls.
 */
export function parseVoiceControlIntent(transcript: string): VoiceControlIntent | null {
  const n = stripFiller(normalize(transcript));
  if (!n || n.length > 48) return null;

  const words = n.split(" ").filter(Boolean);
  if (words.length > 6) return null;

  if (
    /^(stop|stop now|stop listening|stop voice|stop command|end voice|turn off (the )?mic|mute mic|exit voice|quit voice)$/.test(n) ||
    /^full stop$/.test(n)
  ) {
    return "stop_all";
  }

  if (
    /^(skip|skip that|next|hurry up)$/.test(n) ||
    /^(stop (talking|speaking|reading)|shut up|quiet|silence|enough)$/.test(n) ||
    /^cancel$/.test(n)
  ) {
    return "stop_speech_only";
  }

  if (/^(clear|reset|erase)$/.test(n) || /^clear (the )?(text|caption|screen)$/.test(n)) {
    return "clear_ui";
  }

  if (/^(repeat|again|say that again|what was that|one more time)$/.test(n)) {
    return "repeat_last";
  }

  return null;
}
