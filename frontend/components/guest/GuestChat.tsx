"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";
import { ModelAvatar } from "@/components/chat/model-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  API_URL,
  ensureGuestSession,
  fetchGuestConfig,
  getGuestToken,
  guestAuthHeader,
  type GuestConfig,
  type GuestModel,
  type GuestStatus,
} from "@/lib/guest";

type Mode = "single" | "compare";

interface Reply {
  modelId: number;
  name: string;
  externalId: string;
  content: string;
  status: "STREAMING" | "DONE" | "FAILED";
}

interface Turn {
  key: number;
  prompt: string;
  replies: Reply[];
}

class GuestApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const LIMIT_CODE = "GUEST_LIMIT_REACHED";
const RESTRICTED_CODE = "GUEST_RESTRICTED";

async function guestPost(path: string, token: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      ...guestAuthHeader(token),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new GuestApiError(data.message || "Request failed", data.code);
  }
  return response;
}

/** Reads the SSE stream from /send, reporting accumulated text as it grows. */
async function readStream(response: Response, onText: (text: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      let parsed: { type?: string; content?: string; message?: string; code?: string };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.type === "token") {
        text += parsed.content ?? "";
        onText(text);
      } else if (parsed.type === "error") {
        throw new GuestApiError(
          parsed.message || "Failed to generate a response.",
          parsed.code,
        );
      }
    }
  }
  return text;
}

export function GuestChat() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<GuestConfig | null>(null);
  const [status, setStatus] = useState<GuestStatus | null>(null);
  const [mode, setMode] = useState<Mode>("single");
  const [singleModelId, setSingleModelId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);

  const chatIdRef = useRef<number | null>(null);
  const turnKeyRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // A signed-in user has the full app; the trial page is for visitors.
  useEffect(() => {
    if (!isLoading && user) router.replace("/home");
  }, [user, isLoading, router]);

  const refreshStatus = useCallback(() => {
    if (!getGuestToken()) return;
    ensureGuestSession()
      .then((s) => s.status && setStatus(s.status))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchGuestConfig()
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.models.length > 0) {
          setSingleModelId(cfg.models[0].id);
          setCompareIds(
            cfg.models.slice(0, Math.min(2, cfg.models.length)).map((m) => m.id),
          );
        }
        // Until a session exists the visitor has the full allowance.
        setStatus({
          singleLeft: Math.min(cfg.singleMessages, cfg.ipMessagesLeft),
          multiLeft: Math.min(cfg.multiMessages, cfg.ipMessagesLeft),
        });
        refreshStatus();
      })
      .catch(() => toast.error("Could not load the free trial. Please refresh."));
  }, [refreshStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const updateReply = useCallback(
    (turnKey: number, modelId: number, patch: Partial<Reply>) => {
      setTurns((prev) =>
        prev.map((t) =>
          t.key === turnKey
            ? {
                ...t,
                replies: t.replies.map((r) =>
                  r.modelId === modelId ? { ...r, ...patch } : r,
                ),
              }
            : t,
        ),
      );
    },
    [],
  );

  const toggleCompareModel = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (config && prev.length >= config.maxCompareModels) {
        toast.info(`You can compare up to ${config.maxCompareModels} models.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const noneLeft =
    status !== null &&
    (mode === "single" ? status.singleLeft <= 0 : status.multiLeft <= 0);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isSending || !config) return;

    const modelIds =
      mode === "single" ? (singleModelId ? [singleModelId] : []) : compareIds;
    if (modelIds.length === 0 || (mode === "compare" && modelIds.length < 2)) {
      toast.info(
        mode === "compare" ? "Pick at least 2 models to compare." : "Pick a model.",
      );
      return;
    }
    if (noneLeft) {
      setLimitOpen(true);
      return;
    }

    const models = modelIds
      .map((id) => config.models.find((m) => m.id === id))
      .filter((m): m is GuestModel => Boolean(m));
    const key = ++turnKeyRef.current;
    setIsSending(true);
    setInput("");
    setTurns((prev) => [
      ...prev,
      {
        key,
        prompt,
        replies: models.map((m) => ({
          modelId: m.id,
          name: m.name,
          externalId: m.externalId,
          content: "",
          status: "STREAMING" as const,
        })),
      },
    ]);

    try {
      const { token, status: fresh } = await ensureGuestSession();
      if (fresh) setStatus(fresh);

      if (!chatIdRef.current) {
        const res = await fetch(`${API_URL}/chats`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...guestAuthHeader(token) },
          body: JSON.stringify({ modelIds }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new GuestApiError(data.message || "Could not start the chat", data.code);
        }
        chatIdRef.current = data.data.id;
      }
      const chatId = chatIdRef.current;

      const streamModel = async (
        modelId: number,
        ids?: { userMessageId: number; assistantMessageId: number },
      ) => {
        try {
          const response = await guestPost(`/chats/${chatId}/send`, token, {
            content: prompt,
            modelId,
            ...(ids ?? {}),
          });
          const finalText = await readStream(response, (text) =>
            updateReply(key, modelId, { content: text }),
          );
          if (finalText.trim()) {
            updateReply(key, modelId, { status: "DONE" });
          } else {
            updateReply(key, modelId, {
              content: "Failed to generate a response.",
              status: "FAILED",
            });
          }
        } catch (err) {
          updateReply(key, modelId, {
            content: (err as Error).message || "Failed to generate a response.",
            status: "FAILED",
          });
          throw err;
        }
      };

      if (modelIds.length === 1) {
        await streamModel(modelIds[0]);
      } else {
        const prep = await guestPost(`/chats/${chatId}/prepare-multi`, token, {
          content: prompt,
        });
        const { data } = await prep.json();
        const results = await Promise.allSettled(
          modelIds.map((id) => streamModel(id, data)),
        );
        const failures = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        if (failures.length === results.length) throw failures[0].reason;
      }
    } catch (err) {
      // Stream errors are GuestApiError; session-start errors are axios errors.
      const axiosData = (err as { response?: { data?: { code?: string; message?: string } } })
        .response?.data;
      const code = axiosData?.code ?? (err as GuestApiError).code;
      const message = axiosData?.message ?? (err as GuestApiError).message;
      if (code === LIMIT_CODE) {
        setStatus({ singleLeft: 0, multiLeft: 0 });
        setLimitOpen(true);
      } else if (code === RESTRICTED_CODE) {
        toast.info(message);
      } else {
        toast.error(message || "Something went wrong. Please try again.");
      }
    } finally {
      setIsSending(false);
      refreshStatus();
    }
  };

  const modelChip = (m: GuestModel, active: boolean, onClick: () => void) => (
    <button
      key={m.id}
      type="button"
      onClick={onClick}
      disabled={isSending}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <ModelAvatar externalId={m.externalId} name={m.name} size={18} />
      {m.name}
    </button>
  );

  const allUsed = status !== null && status.singleLeft <= 0 && status.multiLeft <= 0;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          Colab AI
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium">
            Free trial
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {turns.length === 0 && (
            <div className="mt-16 text-center">
              <h1 className="text-2xl font-semibold sm:text-3xl">
                Try Colab AI. No sign-up needed.
              </h1>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                {config
                  ? `You get ${config.singleMessages} single-model and ${config.multiMessages} multi-model messages free.`
                  : "Loading…"}
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.key} className="flex flex-col gap-4">
              <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary/10 px-4 py-2.5 sm:max-w-[70%]">
                {turn.prompt}
              </div>
              <div
                className={
                  turn.replies.length > 1
                    ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                    : "max-w-3xl"
                }
              >
                {turn.replies.map((reply) => (
                  <div
                    key={reply.modelId}
                    className="rounded-2xl border border-border p-4"
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <ModelAvatar
                        externalId={reply.externalId}
                        name={reply.name}
                        size={18}
                      />
                      {reply.name}
                    </div>
                    {reply.status === "FAILED" ? (
                      <p className="text-sm text-destructive">{reply.content}</p>
                    ) : reply.content ? (
                      <MarkdownRenderer content={reply.content} />
                    ) : (
                      <p className="animate-pulse text-sm text-muted-foreground">
                        Thinking…
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-border p-0.5 text-sm">
              {(["single", "compare"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={isSending}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {m === "single" ? "One model" : "Compare models"}
                </button>
              ))}
            </div>
            {config?.models.map((m) =>
              mode === "single"
                ? modelChip(m, singleModelId === m.id, () => setSingleModelId(m.id))
                : modelChip(m, compareIds.includes(m.id), () =>
                    toggleCompareModel(m.id),
                  ),
            )}
          </div>

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder="Ask anything…"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
            />
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={isSending || !input.trim()}
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {status
                ? `${status.singleLeft} single · ${status.multiLeft} multi-model messages left`
                : ""}
            </span>
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Files, images, documents and more unlock when you sign up
            </span>
          </div>
        </div>
      </footer>

      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {allUsed
                ? "You have used your free messages"
                : "Create a free account to continue"}
            </DialogTitle>
            <DialogDescription>
              Sign up in seconds to keep chatting. Your conversation so far will be
              saved to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Link href="/register?redirect=/home" className="flex-1">
              <Button className="w-full">Sign up free</Button>
            </Link>
            <Link href="/login?redirect=/home" className="flex-1">
              <Button variant="outline" className="w-full">
                Log in
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
