"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Loader2, Paperclip, FileText, Phone } from "lucide-react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";
import { voiceService, attachmentService } from "@/lib/services";
import { toast } from "@/lib/toast";
import Orb from "@/components/ui/Orb";
import { DocumentCard, type GeneratedDocument } from "@/components/chat/document-card";

// Mirrors chat-input.tsx's ACCEPT_TYPES, plus spreadsheets since Excel
// analysis was explicitly requested for the voice upload flow.
const ACCEPT_TYPES = "image/*,.pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xlsx,.xls,.csv";

type CallPhase = "precall" | "connecting" | "call";
type AgentState = "connecting" | "listening" | "thinking" | "speaking" | "idle";

interface VoiceModalProps {
  open: boolean;
  onClose: () => void;
  /** Continue an existing voice chat instead of starting a new one. */
  chatId?: number;
  /** Fires once the session is created — always, even for a brand new call,
   * so the caller can navigate to / refresh the chat that now has messages. */
  onChatId?: (chatId: number) => void;
}

// Hue in degrees (0-360), applied as a shift over the orb's base
// purple/cyan gradient — distinct per state so the color itself signals
// what ColabAI is doing, not just the animation.
const ORB_HUE: Record<AgentState, number> = {
  connecting: 200,
  idle: 200,
  listening: 140,
  thinking: 260,
  speaking: 0,
};

const ORB_INTENSITY: Record<AgentState, number> = {
  connecting: 0.15,
  idle: 0.3,
  listening: 0.6,
  thinking: 0.5,
  speaking: 0.85,
};

/** WebGL orb (reactbits.dev "Orb") whose color/energy reflects the agent's current state. */
function Blob({ state }: { state: AgentState }) {
  const isConnecting = state === "connecting";

  return (
    <div className="relative flex items-center justify-center h-56 w-56 sm:h-64 sm:w-64">
      <div className={`absolute inset-0 transition-opacity duration-500 ${isConnecting ? "opacity-40" : "opacity-100"}`}>
        <Orb
          hue={ORB_HUE[state]}
          hoverIntensity={ORB_INTENSITY[state]}
          rotateOnHover
          forceHoverState={state !== "connecting" && state !== "idle"}
        />
      </div>
      {isConnecting && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/40 border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      )}
      {isConnecting && (
        <Loader2 className="relative z-10 h-8 w-8 text-primary animate-spin" />
      )}
    </div>
  );
}

const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Setting up ColabAI — one moment…",
  idle: "Ready — start talking",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

interface PendingAttachment {
  id: number;
  fileName: string;
  uploading: boolean;
}

export function VoiceModal({ open, onClose, chatId, onChatId }: VoiceModalProps) {
  const [phase, setPhase] = useState<CallPhase>("precall");
  const [agentState, setAgentState] = useState<AgentState>("connecting");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<PipecatClient | null>(null);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const clientRef = useRef<PipecatClient | null>(null);
  const cancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    clientRef.current?.disconnect().catch(() => {});
    clientRef.current = null;
    setClient(null);
  }, []);

  // Reset to the pre-call screen every time the modal opens; actual
  // connection only happens once the user hits "Start Call".
  useEffect(() => {
    if (!open) return;
    setPhase("precall");
    setError(null);
    setDocuments([]);
    setAttachment(null);
    return () => cleanup();
  }, [open, cleanup]);

  const handleFileSelect = async (file: File) => {
    setAttachment({ id: -1, fileName: file.name, uploading: true });
    try {
      const res = await attachmentService.presend(file);
      const uploaded = res.data.data;
      setAttachment({ id: uploaded.id, fileName: uploaded.fileName, uploading: false });
    } catch (err: any) {
      setAttachment(null);
      const message =
        err?.response?.data?.message || err?.message || "Couldn't upload file";
      toast.error(message);
    }
  };

  const startCall = async () => {
    cancelledRef.current = false;
    setError(null);
    setPhase("connecting");
    setAgentState("connecting");

    try {
      const res = await voiceService.createSession(
        undefined,
        chatId,
        attachment && !attachment.uploading ? [attachment.id] : undefined,
      );
      const { roomUrl, token, chatId: resolvedChatId } = res.data.data;
      if (cancelledRef.current) return;
      onChatId?.(resolvedChatId);

      const client = new PipecatClient({
        transport: new DailyTransport(),
        enableMic: true,
        enableCam: false,
        callbacks: {
          onBotReady: () => setAgentState("idle"),
          onUserStartedSpeaking: () => setAgentState("listening"),
          onUserStoppedSpeaking: () => setAgentState("thinking"),
          onBotStartedSpeaking: () => setAgentState("speaking"),
          onBotStoppedSpeaking: () => setAgentState("idle"),
          onDisconnected: () => setAgentState("idle"),
          onServerMessage: (data: any) => {
            if (data?.type === "document_generated" && data.document) {
              setDocuments((prev) => [...prev, data.document]);
            }
          },
        },
      });

      clientRef.current = client;
      setClient(client);
      setPhase("call");
      await client.connect({ url: roomUrl, token });
    } catch (err: any) {
      if (cancelledRef.current) return;
      const message =
        err?.response?.data?.message || err?.message || "Couldn't start voice session";
      setError(message);
      setPhase("call");
      toast.error(message);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    clientRef.current?.enableMic(!next);
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="relative flex flex-col items-center rounded-3xl border border-border/50 bg-background shadow-2xl w-full max-w-sm px-6 py-10"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {phase === "precall" ? (
              <>
                <Blob state="idle" />

                <p className="mt-6 text-sm font-medium text-muted-foreground text-center">
                  Ready when you are
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = "";
                  }}
                />

                {attachment ? (
                  <div className="mt-4 flex items-center gap-2 rounded-full border border-border/50 bg-muted px-3 py-1.5 text-xs text-muted-foreground max-w-full">
                    {attachment.uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate max-w-[10rem]">{attachment.fileName}</span>
                    <button
                      onClick={() => setAttachment(null)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Remove attachment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Attach a document to discuss
                  </button>
                )}

                <button
                  onClick={startCall}
                  disabled={!!attachment?.uploading}
                  className="mt-6 h-11 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Start Call
                </button>
              </>
            ) : (
              <>
                <Blob state={error ? "idle" : agentState} />

                <p className="mt-6 text-sm font-medium text-muted-foreground text-center">
                  {error ? error : STATE_LABEL[agentState]}
                </p>

                {documents.length > 0 && (
                  <div className="mt-5 w-full flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {documents.map((doc) => (
                      <DocumentCard key={doc.id} document={doc} />
                    ))}
                  </div>
                )}

                <div className="mt-6 flex items-center gap-4">
                  <button
                    onClick={toggleMute}
                    disabled={!!error || agentState === "connecting"}
                    className={`h-11 w-11 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      muted
                        ? "bg-destructive/10 border-destructive/30 text-destructive"
                        : "bg-muted border-border/50 text-foreground hover:bg-muted/70"
                    }`}
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={handleClose}
                    className="h-11 px-6 rounded-full bg-destructive/90 hover:bg-destructive text-white text-sm font-medium transition-colors"
                  >
                    End
                  </button>
                </div>
              </>
            )}

            {/* No visible output — this is what actually creates the <audio>
                element and plays the bot's voice track. Without it the call
                connects and streams audio, but nothing is ever heard. */}
            {client && (
              <PipecatClientProvider client={client}>
                <PipecatClientAudio />
              </PipecatClientProvider>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
