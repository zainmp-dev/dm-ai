"use client";

import { BookOpen, ChevronDown, ChevronUp, Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgentsFlow } from "@/components/agents-flow-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage, apiWorkspaceSearch } from "@/lib/api";
import { speakAssistantLine, cancelAssistantSpeech } from "@/lib/assistant-voice";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { interpretVoiceCommand, VOICE_COMMAND_EXAMPLES } from "@/lib/voice-commands";

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

export function VoiceCommandOverlay({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const { push: toast } = useToast();
  const { openAgentsFlow } = useAgentsFlow();
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const workspaceConfigured = useWorkspaceStore((s) => Boolean(s.workspace?.workspaceConfigured));
  const [browserOk, setBrowserOk] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [caption, setCaption] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  /** Bump to drop stale workspace-search responses and speech when user starts over or cancels. */
  const voiceTurnRef = useRef(0);
  /** True after user turns the mic on; stays on until they click the mic again (not after each utterance). */
  const userWantsMicOnRef = useRef(false);

  useEffect(() => {
    setBrowserOk(!!speechRecognitionConstructor());
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

  useEffect(() => () => stopVoiceSession(), [stopVoiceSession]);

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
      rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";

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
          const trimmed = finalText.trim();
          const result = interpretVoiceCommand(finalText);
          if (result.kind === "navigate") {
            router.push(result.href);
            toast(`Opening ${result.label}`, { durationMs: 2400 });
            speakAssistantLine(`Opening ${result.label}.`);
            setCaption("");
          } else if (result.kind === "open-agents-flow") {
            openAgentsFlow();
            toast("AI agents overview", { durationMs: 2400 });
            speakAssistantLine("Opening the AI agents overview.");
            setCaption("");
          } else {
            setCaption(trimmed);
            if (!workspaceConfigured) {
              toast("Complete workspace setup to ask the AI by voice.", { durationMs: 5000 });
              speakAssistantLine("Finish workspace setup before asking questions.");
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
                speakAssistantLine(clipForSpeech(answer));
              } catch (e) {
                if (turn !== voiceTurnRef.current) return;
                const msg = apiErrorMessage(e);
                toast(msg, { durationMs: 6500 });
                speakAssistantLine("Sorry, I could not answer that right now.");
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
  }, [disposeRecognition, openAgentsFlow, router, selectedAiModel, toast, workspaceConfigured]);

  const onMicClick = useCallback(() => {
    if (askingAi) {
      voiceTurnRef.current += 1;
      cancelAssistantSpeech();
      setAskingAi(false);
      setCaption("");
      return;
    }
    if (listening) stopVoiceSession();
    else openVoiceSession();
  }, [askingAi, listening, openVoiceSession, stopVoiceSession]);

  if (disabled || !browserOk) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-5 right-5 z-[35] flex flex-col items-end gap-2",
        "max-[480px]:bottom-4 max-[480px]:right-4",
      )}
    >
      {panelOpen && (
        <div
          className={cn(
            "pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-lg",
            "dark:border-zinc-700 dark:bg-[#161618]",
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b] dark:text-zinc-400">Voice assistant</p>
          <p className="mt-2 text-sm leading-relaxed text-[#475569] dark:text-zinc-300">
            Tap the mic once to start listening; tap again when you want to stop. After a spoken answer, the mic stays on so you can ask
            another question. Speech recognition runs in your browser; answers use workspace AI and can be read aloud (mute in Settings
            if you prefer).
          </p>
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
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[#64748b] dark:text-zinc-500">Try saying</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {VOICE_COMMAND_EXAMPLES.map((ex) => (
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

      <div className="pointer-events-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "size-11 shrink-0 rounded-full border-[#e5e7eb] bg-white p-0 shadow-md dark:border-zinc-700 dark:bg-zinc-900",
            "hover:bg-[#f5f7fa] dark:hover:bg-zinc-800",
          )}
          onClick={() => setPanelOpen((o) => !o)}
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
            askingAi ? "Stop voice answer" : listening ? "Stop voice command" : "Start voice command or question"
          }
        >
          <Mic className="size-6" strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
