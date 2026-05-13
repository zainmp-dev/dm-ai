"use client";

import { ChevronDown, ChevronUp, Mic, SkipForward, Square, Trash2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { AdminNavItem } from "@/lib/admin/nav-config";
import {
  ADMIN_VOICE_EXAMPLES,
  interpretAdminVoiceCommand,
  isAdminVoiceSpeakEnabled,
  setAdminVoiceSpeakEnabled,
} from "@/lib/admin-voice-commands";
import {
  cancelAssistantSpeech,
  getSpeechRecognitionLang,
  isAssistantSpeechActive,
  speakAssistantLine,
} from "@/lib/assistant-voice";
import { cn } from "@/lib/utils";
import { parseVoiceControlIntent } from "@/lib/voice-control-intents";

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const voiceApisSubscribe = () => () => {};
function voiceApisSnapshot(): boolean {
  return !!speechRecognitionCtor();
}

const VOICE_DEBOUNCE_MS = 1600;

export function AdminVoiceOverlay({
  filteredNav,
  onOpenCommandPalette,
}: {
  filteredNav: AdminNavItem[];
  onOpenCommandPalette: () => void;
}) {
  const router = useRouter();
  const { push: toast } = useToast();
  const browserOk = useSyncExternalStore(voiceApisSubscribe, voiceApisSnapshot, () => false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [caption, setCaption] = useState("");
  const [confirmSpeechOn, setConfirmSpeechOn] = useState(() =>
    typeof window !== "undefined" ? isAdminVoiceSpeakEnabled() : true,
  );
  const [speechPlaying, setSpeechPlaying] = useState(false);
  const lastSpokenRef = useRef("");

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const userWantsMicOnRef = useRef(false);
  const lastFinalHandledRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const allowedHref = useCallback((href: string) => filteredNav.some((n) => n.href === href), [filteredNav]);

  useEffect(() => {
    const active = listening || Boolean(caption);
    if (!active) {
      let raf = 0;
      raf = requestAnimationFrame(() => setSpeechPlaying(false));
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setInterval(() => {
      setSpeechPlaying(isAssistantSpeechActive());
    }, 300);
    return () => window.clearInterval(id);
  }, [listening, caption]);

  const togglePanelOpen = useCallback(() => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) setConfirmSpeechOn(isAdminVoiceSpeakEnabled());
      return next;
    });
  }, []);

  const disposeRecognition = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const stopVoiceSession = useCallback(() => {
    userWantsMicOnRef.current = false;
    disposeRecognition();
    setListening(false);
  }, [disposeRecognition]);

  const stopEverything = useCallback(() => {
    cancelAssistantSpeech();
    stopVoiceSession();
    setCaption("");
  }, [stopVoiceSession]);

  const skipSpeechOnly = useCallback(() => {
    cancelAssistantSpeech();
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const adminSpeak = useCallback(
    (text: string) => {
      lastSpokenRef.current = text;
      if (!isAdminVoiceSpeakEnabled()) return;
      speakAssistantLine(text);
    },
    [],
  );

  const openVoiceSession = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      toast("Voice needs a browser with speech recognition (try Chrome or Edge).", { durationMs: 5200 });
      return;
    }
    if (!window.isSecureContext) {
      toast("Voice works best on HTTPS.", { durationMs: 4500 });
    }

    cancelAssistantSpeech();
    disposeRecognition();
    userWantsMicOnRef.current = true;
    setListening(true);
    setCaption("");

    const spawn = () => {
      if (!userWantsMicOnRef.current) return;
      const rec = new Ctor();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = getSpeechRecognitionLang();

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) finalText += piece;
          else interim += piece;
        }
        const display = (finalText || interim).trim();
        if (display) setCaption(display);

        if (finalText.trim()) {
          const trimmed = finalText.trim().replace(/\s+/g, " ");
          const now = Date.now();
          if (
            trimmed === lastFinalHandledRef.current.text &&
            now - lastFinalHandledRef.current.at < VOICE_DEBOUNCE_MS
          ) {
            return;
          }

          const control = parseVoiceControlIntent(trimmed);
          if (control === "stop_all") {
            lastFinalHandledRef.current = { text: trimmed, at: now };
            stopEverything();
            return;
          }
          if (control === "stop_speech_only") {
            lastFinalHandledRef.current = { text: trimmed, at: now };
            skipSpeechOnly();
            return;
          }
          if (control === "clear_ui") {
            lastFinalHandledRef.current = { text: trimmed, at: now };
            setCaption("");
            return;
          }
          if (control === "repeat_last") {
            lastFinalHandledRef.current = { text: trimmed, at: now };
            const line = lastSpokenRef.current;
            if (!line) {
              toast("Nothing to repeat yet.", { durationMs: 3200 });
              return;
            }
            adminSpeak(line);
            return;
          }

          lastFinalHandledRef.current = { text: trimmed, at: now };

          const result = interpretAdminVoiceCommand(trimmed);
          setCaption("");
          if (result.kind === "open-command-palette") {
            onOpenCommandPalette();
            toast("Command palette", { durationMs: 2200 });
            adminSpeak("Opening command palette.");
            return;
          }
          if (result.kind === "navigate") {
            if (!allowedHref(result.href)) {
              toast(`Voice: "${result.label}" is not available for your role.`, { durationMs: 4800 });
              adminSpeak("That section is not available for your account.");
              return;
            }
            router.push(result.href);
            toast(`Opening ${result.label}`, { durationMs: 2400 });
            adminSpeak(`Opening ${result.label}.`);
            return;
          }
          const hint = filteredNav
            .filter((n) => n.href !== "/admin")
            .slice(0, 6)
            .map((n) => n.label)
            .join(", ");
          toast(`Try: ${ADMIN_VOICE_EXAMPLES.slice(0, 4).join(" · ")}${hint ? ` — or: ${hint}` : ""}`, { durationMs: 6500 });
          adminSpeak("I did not understand. Try a section name or say command palette.");
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorLike) => {
        if (event.error === "aborted") return;
        if (event.error === "no-speech") return;
        userWantsMicOnRef.current = false;
        disposeRecognition();
        const msg =
          event.error === "not-allowed"
            ? "Microphone blocked. Allow this site (lock icon), then try again."
            : `Voice stopped: ${event.error}`;
        toast(msg, { durationMs: 5000 });
        setListening(false);
      };

      rec.onend = () => {
        recRef.current = null;
        if (!userWantsMicOnRef.current) {
          setListening(false);
          return;
        }
        window.setTimeout(spawn, 80);
      };

      try {
        rec.start();
      } catch {
        toast("Could not start microphone.", { durationMs: 4200 });
        userWantsMicOnRef.current = false;
        setListening(false);
      }
    };

    spawn();
  }, [adminSpeak, allowedHref, disposeRecognition, filteredNav, onOpenCommandPalette, router, skipSpeechOnly, stopEverything, toast]);

  const onMicClick = useCallback(() => {
    if (listening) stopVoiceSession();
    else openVoiceSession();
  }, [listening, openVoiceSession, stopVoiceSession]);

  const toggleSpeak = (on: boolean) => {
    setConfirmSpeechOn(on);
    setAdminVoiceSpeakEnabled(on);
    if (!on) cancelAssistantSpeech();
  };

  if (!browserOk) return null;

  const showBusyControls = listening || speechPlaying || Boolean(caption);

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-5 right-5 z-[45] flex flex-col items-end gap-2",
        "max-[480px]:bottom-4 max-[480px]:right-4",
      )}
      role="region"
      aria-label="Admin voice controls"
    >
      {panelOpen && (
        <div
          className={cn(
            "pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-[#161618]",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-400">
              Voice — admin console
            </p>
            <span className="rounded-md bg-[#eef2ff] px-2 py-0.5 font-mono text-[10px] text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
              {getSpeechRecognitionLang().toUpperCase()}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#475569] dark:text-zinc-300">
            Same engine as workspace voice: recognition follows your accent preference in localStorage. Say{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">stop</span>,{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">skip</span>,{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">clear</span>, or{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">repeat</span>. Only routes your role allows are opened.
          </p>

          <div className="mt-4 rounded-xl border border-[#e5e7eb] p-3 dark:border-zinc-700">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">Setup</p>
            <Label className="mt-3 flex cursor-pointer items-center gap-3 text-[13px] font-normal text-[#0f172a] dark:text-zinc-100">
              <input
                type="checkbox"
                checked={confirmSpeechOn}
                onChange={(e) => toggleSpeak(e.target.checked)}
                className="size-4 rounded border-zinc-300 accent-[#1a56db] dark:border-zinc-600"
              />
              <span className="flex items-center gap-2">
                <Volume2 className="size-4 text-[#1a56db]" strokeWidth={1.75} aria-hidden />
                Speak route confirmations (uses workspace voice/accent preferences when enabled)
              </span>
            </Label>
          </div>

          {(listening || caption) && (
            <p
              className={cn(
                "mt-3 max-h-40 overflow-y-auto rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                listening ? "bg-[#f0f4ff] text-[#1a56db] dark:bg-blue-950/40 dark:text-blue-200" : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
              )}
            >
              {listening ? "Listening… " : ""}
              {caption || "—"}
            </p>
          )}

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">Try saying</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {[...ADMIN_VOICE_EXAMPLES, "Stop", "Repeat"].map((ex) => (
              <li
                key={ex}
                className="rounded-full bg-[#f5f7fa] px-2.5 py-1 text-[11px] text-[#475569] dark:bg-zinc-800 dark:text-zinc-300"
              >
                {ex}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        {showBusyControls && (
          <div
            className="flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-[#e5e7eb] bg-white/95 p-1 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
            role="toolbar"
            aria-label="Admin voice toolbar"
          >
            {(listening || speechPlaying) && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-9 shrink-0 rounded-xl p-0 text-zinc-600 hover:bg-red-50 hover:text-red-700 dark:text-zinc-300 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                  onClick={stopEverything}
                  aria-label="Stop microphone and speech"
                  title="Stop all"
                >
                  <Square className="size-4 fill-current" aria-hidden />
                </Button>
                {speechPlaying && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 shrink-0 rounded-xl p-0 text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200"
                    onClick={skipSpeechOnly}
                    aria-label="Skip spoken confirmation"
                    title="Skip audio"
                  >
                    <SkipForward className="size-4" strokeWidth={1.75} aria-hidden />
                  </Button>
                )}
              </>
            )}
            {Boolean(caption) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-9 shrink-0 rounded-xl p-0 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={() => setCaption("")}
                aria-label="Clear caption text"
                title="Clear text"
              >
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "size-11 shrink-0 rounded-full border-[#e5e7eb] bg-white p-0 shadow-md dark:border-zinc-700 dark:bg-zinc-900",
              "hover:bg-[#f5f7fa] dark:hover:bg-zinc-800",
            )}
            onClick={togglePanelOpen}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? "Hide voice setup" : "Show voice setup"}
          >
            {panelOpen ? <ChevronDown className="size-5 text-[#64748b]" /> : <ChevronUp className="size-5 text-[#64748b]" />}
          </Button>
          <Button
            type="button"
            className={cn(
              "size-14 shrink-0 rounded-full p-0 shadow-lg transition-transform",
              listening ? "animate-pulse bg-red-600 text-white hover:bg-red-600" : "bg-[#1a56db] text-white hover:bg-[#1648c0]",
            )}
            onClick={onMicClick}
            aria-pressed={listening}
            aria-label={listening ? "Stop admin voice listening" : "Start admin voice — navigate by speech"}
          >
            <Mic className="size-6" strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
