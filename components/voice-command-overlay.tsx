"use client";

import { BookOpen, ChevronDown, ChevronUp, Mic, SkipForward, Square, Trash2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAgentsFlow } from "@/components/agents-flow-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage, apiWorkspaceSearch } from "@/lib/api";
import {
  cancelAssistantSpeech,
  getSpeechRecognitionLang,
  isAssistantSpeechActive,
  isAssistantVoiceEnabled,
  setAssistantVoiceEnabled,
  speakAssistantLine,
} from "@/lib/assistant-voice";
import { cn } from "@/lib/utils";
import { parseVoiceControlIntent } from "@/lib/voice-control-intents";
import { interpretVoiceCommand, VOICE_COMMAND_EXAMPLES } from "@/lib/voice-commands";
import { useWorkspaceStore } from "@/lib/workspace-store";

/** Trim AI markdown/noise for speech — keep under typical synthesis limits. */
function clipForSpeech(text: string, maxLen = 1800): string {
  const t = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxLen * 0.55 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Minimal types — Web Speech API is not in all TS lib targets. */
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

function speechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const voiceApisSubscribe = () => () => {};
function voiceApisSnapshot(): boolean {
  return !!speechRecognitionConstructor();
}

const VOICE_DEBOUNCE_MS = 1600;

export function VoiceCommandOverlay({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const { push: toast } = useToast();
  const { openAgentsFlow } = useAgentsFlow();
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const workspaceConfigured = useWorkspaceStore((s) => Boolean(s.workspace?.workspaceConfigured));
  const browserOk = useSyncExternalStore(voiceApisSubscribe, voiceApisSnapshot, () => false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [caption, setCaption] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  /** Last text actually sent to the speaker (short clip) — used for “repeat”. */
  const lastSpokenClipRef = useRef("");
  /** Full last AI reply (for readable repeat caption). */
  const lastAiAnswerRef = useRef("");
  const [speakAnswersOn, setSpeakAnswersOn] = useState(() =>
    typeof window !== "undefined" ? isAssistantVoiceEnabled() : true,
  );
  const [speechPlaying, setSpeechPlaying] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  /** Bump to drop stale workspace-search responses and speech when user starts over or cancels. */
  const voiceTurnRef = useRef(0);
  /** Avoid double-firing from continuous recognition on the same phrase. */
  const lastFinalHandledRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  /** True after user turns the mic on; stays on until they stop (not after each utterance). */
  const userWantsMicOnRef = useRef(false);

  useEffect(() => {
    const active = listening || askingAi || Boolean(caption);
    if (!active) {
      let raf = 0;
      // Defer so we don't synchronously setState in the effect body (eslint set-state-in-effect).
      raf = requestAnimationFrame(() => setSpeechPlaying(false));
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setInterval(() => {
      setSpeechPlaying(isAssistantSpeechActive());
    }, 300);
    return () => window.clearInterval(id);
  }, [listening, askingAi, caption]);

  const togglePanelOpen = useCallback(() => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) setSpeakAnswersOn(isAssistantVoiceEnabled());
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
    voiceTurnRef.current += 1;
    cancelAssistantSpeech();
    stopVoiceSession();
    setCaption("");
    setAskingAi(false);
  }, [stopVoiceSession]);

  const skipSpeechOnly = useCallback(() => {
    cancelAssistantSpeech();
    if (askingAi) {
      voiceTurnRef.current += 1;
      setAskingAi(false);
      setCaption("");
      toast("Stopped answer", { durationMs: 2400 });
    }
  }, [askingAi, toast]);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const openVoiceSession = useCallback(() => {
    const Ctor = speechRecognitionConstructor();
    if (!Ctor) {
      toast("Voice commands need a browser with speech recognition (try Chrome or Edge).", { durationMs: 5200 });
      return;
    }

    if (!window.isSecureContext) {
      toast("Voice works best on HTTPS (secure site).", { durationMs: 4800 });
    }

    voiceTurnRef.current += 1;
    cancelAssistantSpeech();
    setAskingAi(false);
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
            const clip = lastSpokenClipRef.current;
            const full = lastAiAnswerRef.current;
            if (!clip && !full) {
              toast("Nothing to repeat yet.", { durationMs: 3200 });
              return;
            }
            if (full) setCaption(full);
            else setCaption(clip);
            if (clip) speakAssistantLine(clip);
            return;
          }

          lastFinalHandledRef.current = { text: trimmed, at: now };

          const result = interpretVoiceCommand(trimmed);
          if (result.kind === "navigate") {
            lastAiAnswerRef.current = "";
            router.push(result.href);
            toast(`Opening ${result.label}`, { durationMs: 2400 });
            const line = `Opening ${result.label}.`;
            lastSpokenClipRef.current = line;
            speakAssistantLine(line);
            setCaption("");
          } else if (result.kind === "open-agents-flow") {
            lastAiAnswerRef.current = "";
            openAgentsFlow();
            toast("AI agents overview", { durationMs: 2400 });
            const line = "Opening the AI agents overview.";
            lastSpokenClipRef.current = line;
            speakAssistantLine(line);
            setCaption("");
          } else {
            setCaption(trimmed);
            if (!workspaceConfigured) {
              lastAiAnswerRef.current = "";
              toast("Complete workspace setup to ask the AI by voice.", { durationMs: 5000 });
              const line = "Finish workspace setup before asking questions.";
              lastSpokenClipRef.current = line;
              speakAssistantLine(line);
              return;
            }
            const turn = voiceTurnRef.current;
            setAskingAi(true);
            setPanelOpen(true);
            void (async () => {
              try {
                const { answer } = await apiWorkspaceSearch({ query: trimmed, aiModel: selectedAiModel });
                if (turn !== voiceTurnRef.current) return;
                setCaption(answer);
                lastAiAnswerRef.current = answer;
                const clip = clipForSpeech(answer);
                lastSpokenClipRef.current = clip;
                speakAssistantLine(clip);
              } catch (e) {
                if (turn !== voiceTurnRef.current) return;
                const msg = apiErrorMessage(e);
                lastAiAnswerRef.current = "";
                toast(msg, { durationMs: 6500 });
                const line = "Sorry, I could not answer that right now.";
                lastSpokenClipRef.current = line;
                speakAssistantLine(line);
              } finally {
                if (turn === voiceTurnRef.current) setAskingAi(false);
              }
            })();
          }
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorLike) => {
        if (event.error === "aborted") return;
        if (event.error === "no-speech") return;
        userWantsMicOnRef.current = false;
        disposeRecognition();
        const msg =
          event.error === "not-allowed"
            ? "Microphone blocked. Allow this site in the address bar (lock icon), then try again."
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
        toast("Could not start microphone. Check permissions.", { durationMs: 4200 });
        userWantsMicOnRef.current = false;
        setListening(false);
      }
    };

    spawn();
  }, [disposeRecognition, openAgentsFlow, router, selectedAiModel, skipSpeechOnly, stopEverything, toast, workspaceConfigured]);

  const toggleSpeakAnswers = (on: boolean) => {
    setSpeakAnswersOn(on);
    setAssistantVoiceEnabled(on);
    if (!on) cancelAssistantSpeech();
  };

  const onMicClick = useCallback(() => {
    if (askingAi) {
      skipSpeechOnly();
      return;
    }
    if (listening) stopVoiceSession();
    else openVoiceSession();
  }, [askingAi, listening, openVoiceSession, skipSpeechOnly, stopVoiceSession]);

  const showBusyControls = listening || askingAi || speechPlaying || Boolean(caption);

  if (disabled || !browserOk) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-5 right-5 z-[35] flex flex-col items-end gap-2",
        "max-[480px]:bottom-4 max-[480px]:right-4",
      )}
      role="region"
      aria-label="Voice assistant"
    >
      {panelOpen && (
        <div
          className={cn(
            "pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-lg",
            "dark:border-zinc-700 dark:bg-[#161618]",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-400">
              Voice assistant
            </p>
            <span className="rounded-md bg-[#eef2ff] px-2 py-0.5 font-mono text-[10px] text-[#3730a3] dark:bg-indigo-950/70 dark:text-indigo-200">
              {(typeof navigator !== "undefined" ? getSpeechRecognitionLang() : "en").toUpperCase()}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#475569] dark:text-zinc-300">
            Mic stays on until you stop it. Accent for listening and speaking comes from your workspace setup wizard (same as read-aloud).
            Say <span className="font-medium text-zinc-700 dark:text-zinc-200">stop</span>,{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">skip</span>,{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">clear</span>, or{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-200">repeat</span> anytime.
          </p>

          <div className="mt-4 rounded-xl border border-[#e5e7eb] p-3 dark:border-zinc-700">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">Setup</p>
            <Label className="mt-3 flex cursor-pointer items-center gap-3 text-[13px] font-normal text-[#0f172a] dark:text-zinc-100">
              <input
                type="checkbox"
                checked={speakAnswersOn}
                onChange={(e) => toggleSpeakAnswers(e.target.checked)}
                className="size-4 rounded border-zinc-300 accent-[#1a56db] dark:border-zinc-600"
              />
              <span className="flex items-center gap-2">
                <Volume2 className="size-4 text-[#1a56db]" strokeWidth={1.75} aria-hidden />
                Read answers aloud
              </span>
            </Label>
          </div>

          {(listening || caption || askingAi) && (
            <p
              className={cn(
                "mt-3 max-h-48 overflow-y-auto rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                listening || askingAi
                  ? "bg-[#f0f4ff] text-[#1a56db] dark:bg-blue-950/40 dark:text-blue-200"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
              )}
            >
              {listening ? "Listening… " : askingAi ? "Asking workspace AI… " : ""}
              {(listening || askingAi) && caption ? <span className="font-medium">{caption}</span> : caption || "—"}
            </p>
          )}

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">Try saying</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {[...VOICE_COMMAND_EXAMPLES, "Stop", "Skip", "Repeat"].map((ex) => (
              <li
                key={ex}
                className="rounded-full bg-[#f5f7fa] px-2.5 py-1 text-[11px] text-[#475569] dark:bg-zinc-800 dark:text-zinc-300"
              >
                {ex}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 h-9 w-full justify-center gap-2 rounded-xl text-[#1a56db] dark:text-blue-400"
            onClick={() => openAgentsFlow()}
          >
            <BookOpen className="size-4" strokeWidth={1.75} aria-hidden />
            How AI agents run
          </Button>
        </div>
      )}

      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        {showBusyControls && (
          <div
            className="flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-[#e5e7eb] bg-white/95 p-1 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
            role="toolbar"
            aria-label="Voice controls"
          >
            {(listening || speechPlaying || askingAi) && (
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
                {(speechPlaying || askingAi) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 shrink-0 rounded-xl p-0 text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200"
                    onClick={skipSpeechOnly}
                    aria-label="Skip spoken answer"
                    title="Skip audio"
                  >
                    <SkipForward className="size-4" strokeWidth={1.75} aria-hidden />
                  </Button>
                )}
              </>
            )}
            {!askingAi && Boolean(caption) && (
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
            aria-label={panelOpen ? "Hide voice assistant help" : "Show voice assistant help"}
          >
            {panelOpen ? <ChevronDown className="size-5 text-[#64748b]" /> : <ChevronUp className="size-5 text-[#64748b]" />}
          </Button>
          <Button
            type="button"
            className={cn(
              "size-14 shrink-0 rounded-full p-0 shadow-lg transition-transform",
              listening
                ? "animate-pulse bg-red-600 text-white hover:bg-red-600"
                : askingAi
                  ? "animate-pulse bg-amber-600 text-white hover:bg-amber-600"
                  : "bg-[#1a56db] text-white hover:bg-[#1648c0]",
            )}
            onClick={onMicClick}
            aria-pressed={listening || askingAi}
            aria-label={
              askingAi ? "Cancel answer — stop playback" : listening ? "Stop listening" : "Start voice command"
            }
          >
            <Mic className="size-6" strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
