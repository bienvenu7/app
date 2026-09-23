"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  getChatbotThread,
  getSupportSocketAuth,
  sendChatbotMessage,
  uploadChatbotThreadFile,
} from "@/app/actions/chatbot";
import { uploadFiles } from "@/app/actions/file";
import { unwrapAction } from "@/lib/auth-errors";
import {
  choicesFromReply,
  isLiveSupportStatus,
  isProofFileInput,
  localSupportMessage,
  mergeSupportMessage,
  parseSupportMessage,
  persistActiveTxid,
  pinnedFromPayload,
  readPersistedTxid,
  receiverPhoneValue,
  sanitizeBotReply,
  transactionIdFromProofInput,
  type ChatbotRequest,
  type ChatInput,
  type ChatPinned,
  type ChatSuggestion,
  type ChatbotReply,
  type SupportMessage,
  type ThreadStatus,
} from "@/lib/chatbot";

type SupportStatus = ThreadStatus | "NONE";

type SupportWaitingPayload = { threadId?: string; status?: string };
type SupportAcceptedPayload = {
  threadId?: string;
  adminId?: string;
  status?: string;
  agentReady?: boolean;
  message?: string;
  replay?: boolean;
};
type SupportTypingPayload = {
  threadId?: string;
  userId?: string;
  isAdmin?: boolean;
  isTyping?: boolean;
};
type SupportHistoryPayload = {
  threadId?: string;
  status?: string;
  messages?: unknown[];
};
type SupportClosedPayload = { threadId?: string; status?: string };
type SupportAgentPayload = {
  threadId?: string;
  adminId?: string;
  message?: string;
};
type SupportErrorPayload = { message?: string };

const TYPING_IDLE_MS = 2000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

export function useClientSupport(isAuthenticated: boolean) {
  const [status, setStatus] = useState<SupportStatus>("NONE");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [choices, setChoices] = useState<ChatSuggestion[]>([]);
  const [pinned, setPinned] = useState<ChatPinned>(() =>
    pinnedFromPayload({}),
  );
  const [prompt, setPrompt] = useState<ChatInput | undefined>(undefined);
  const [activeTxid, setActiveTxid] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [agentReadyMessage, setAgentReadyMessage] = useState<string | null>(
    null,
  );

  const socketRef = useRef<Socket | null>(null);
  const statusRef = useRef<SupportStatus>("NONE");
  const threadIdRef = useRef<string | null>(null);
  const promptRef = useRef<ChatInput | undefined>(undefined);
  const activeTxidRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | undefined>(undefined);
  const loadThreadRef = useRef<() => Promise<void>>(async () => {});

  const syncStatus = useCallback((next: SupportStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const syncThreadId = useCallback((next: string | null) => {
    threadIdRef.current = next;
    setThreadId(next);
  }, []);

  const syncPrompt = useCallback((next: ChatInput | undefined) => {
    promptRef.current = next;
    setPrompt(next);
  }, []);

  const syncTxid = useCallback((next: string | null) => {
    activeTxidRef.current = next;
    setActiveTxid(next);
    persistActiveTxid(next);
  }, []);

  const joinThread = useCallback((id: string) => {
    socketRef.current?.emit("support:join", { threadId: id });
  }, []);

  const matchesOpenThread = useCallback((eventThreadId: string | undefined) => {
    if (!eventThreadId) return false;
    const current = threadIdRef.current;
    return !current || current === eventThreadId;
  }, []);

  const appendSystem = useCallback(
    (eventThreadId: string | undefined, message: string | undefined) => {
      if (!message?.trim()) return;
      if (eventThreadId && !matchesOpenThread(eventThreadId)) return;
      const text = sanitizeBotReply(message);
      setMessages((prev) => {
        if (prev.some((item) => item.author === "BOT" && item.text === text)) {
          return prev;
        }
        return mergeSupportMessage(
          prev,
          localSupportMessage("BOT", text, {
            threadId: eventThreadId ?? threadIdRef.current ?? "",
          }),
        );
      });
    },
    [matchesOpenThread],
  );

  const applyReply = useCallback(
    (data: ChatbotReply) => {
      syncThreadId(data.threadId);
      setChoices(choicesFromReply(data));
      setPinned(pinnedFromPayload(data));
      syncPrompt(data.input);

      const alreadyHuman = isLiveSupportStatus(statusRef.current);
      const liveNow = data.live === true || data.status === "LIVE";
      const waitingNow = data.waiting === true || data.status === "WAITING";

      if (liveNow) {
        syncStatus("LIVE");
        joinThread(data.threadId);
      } else if (waitingNow) {
        syncStatus("WAITING");
        joinThread(data.threadId);
      } else if (
        statusRef.current === "NONE" ||
        statusRef.current === "CLOSED"
      ) {
        syncStatus("BOT");
      }

      if (data.echo) {
        const echo =
          data.echo.author === "BOT"
            ? { ...data.echo, text: sanitizeBotReply(data.echo.text) }
            : data.echo;
        setMessages((prev) => mergeSupportMessage(prev, echo));
      }

      const skipReply = liveNow || waitingNow || alreadyHuman;
      if (data.reply && !skipReply) {
        setMessages((prev) => [
          ...prev,
          localSupportMessage("BOT", sanitizeBotReply(data.reply), {
            threadId: data.threadId,
          }),
        ]);
      }
    },
    [joinThread, syncPrompt, syncStatus, syncThreadId],
  );

  const postBot = useCallback(
    async (body: ChatbotRequest, displayText?: string) => {
      if (displayText) {
        setMessages((prev) => [
          ...prev,
          localSupportMessage("CLIENT", displayText, {
            threadId: threadIdRef.current ?? "",
          }),
        ]);
      }
      setSending(true);
      try {
        const data = await unwrapAction(sendChatbotMessage(body));
        applyReply(data);
      } finally {
        setSending(false);
      }
    },
    [applyReply],
  );

  const emitLiveText = useCallback((text: string) => {
    const id = threadIdRef.current;
    const socket = socketRef.current;
    if (!socket || !id || !isLiveSupportStatus(statusRef.current)) return false;
    setMessages((prev) => [
      ...prev,
      localSupportMessage("CLIENT", text, { threadId: id }),
    ]);
    socket.emit("support:message", { threadId: id, text });
    socket.emit("support:typing", { threadId: id, isTyping: false });
    return true;
  }, []);

  const loadThread = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingThread(true);
    try {
      const data = await unwrapAction(getChatbotThread());
      const nextStatus = data.thread?.status ?? "NONE";
      syncStatus(nextStatus === "CLOSED" ? "CLOSED" : nextStatus);
      syncThreadId(data.thread?.id ?? null);
      setMessages(
        data.messages.map((item) =>
          item.author === "BOT"
            ? { ...item, text: sanitizeBotReply(item.text) }
            : item,
        ),
      );
      setChoices([]);
      setPinned(pinnedFromPayload(data));
      syncPrompt(data.input);
      setAgentReadyMessage(null);
      if (!activeTxidRef.current) {
        const stored = readPersistedTxid();
        if (stored) syncTxid(stored);
      }
      setAgentTyping(false);

      if (data.thread && isLiveSupportStatus(data.thread.status)) {
        joinThread(data.thread.id);
      }
    } finally {
      setLoadingThread(false);
    }
  }, [isAuthenticated, joinThread, syncPrompt, syncStatus, syncThreadId, syncTxid]);

  loadThreadRef.current = loadThread;

  useEffect(() => {
    if (!isAuthenticated) {
      syncStatus("NONE");
      syncThreadId(null);
      setMessages([]);
      setChoices([]);
      setPinned(pinnedFromPayload({}));
      syncPrompt(undefined);
      syncTxid(null);
      setAgentTyping(false);
      setAgentReadyMessage(null);
      return;
    }
    void loadThread();
  }, [isAuthenticated, loadThread, syncPrompt, syncStatus, syncThreadId, syncTxid]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    let refreshTimer: number | undefined;
    let socket: Socket | null = null;

    const attach = (next: Socket) => {
      next.on("connect_error", (err: Error) => {
        console.warn("[socket]", err.message);
      });

      next.on("connect", () => {
        const id = threadIdRef.current;
        if (id && isLiveSupportStatus(statusRef.current)) {
          next.emit("support:join", { threadId: id });
        }
      });

      next.on("support:waiting", (data: SupportWaitingPayload) => {
        if (!data.threadId) return;
        syncThreadId(data.threadId);
        syncStatus("WAITING");
        setAgentTyping(false);
        next.emit("support:join", { threadId: data.threadId });
      });

      next.on("support:accepted", (data: SupportAcceptedPayload) => {
        if (!data.threadId) return;
        syncThreadId(data.threadId);
        syncStatus("LIVE");
        setAgentTyping(false);
        next.emit("support:join", { threadId: data.threadId });
        if (data.replay || !data.message) return;
        setAgentReadyMessage(sanitizeBotReply(data.message));
        appendSystem(data.threadId, data.message);
      });

      next.on("support:agent-joined", (data: SupportAgentPayload) => {
        if (!matchesOpenThread(data.threadId)) return;
        if (data.threadId) syncThreadId(data.threadId);
        syncStatus("LIVE");
        appendSystem(data.threadId, data.message);
      });

      next.on("support:agent-left", (data: SupportAgentPayload) => {
        if (!matchesOpenThread(data.threadId)) return;
        setAgentTyping(false);
        appendSystem(data.threadId, data.message);
      });

      next.on("support:message", (raw: unknown) => {
        const parsed = parseSupportMessage(raw, threadIdRef.current ?? "");
        if (!parsed) return;
        if (
          parsed.threadId &&
          threadIdRef.current &&
          parsed.threadId !== threadIdRef.current
        ) {
          return;
        }
        if (parsed.threadId && !threadIdRef.current) {
          syncThreadId(parsed.threadId);
        }
        const nextMsg =
          parsed.author === "BOT"
            ? { ...parsed, text: sanitizeBotReply(parsed.text) }
            : parsed;
        setMessages((prev) => mergeSupportMessage(prev, nextMsg));
        setAgentTyping(false);
      });

      next.on("support:typing", (data: SupportTypingPayload) => {
        if (!data.threadId || data.threadId !== threadIdRef.current) return;
        if (data.isAdmin !== true) return;
        setAgentTyping(data.isTyping === true);
      });

      next.on("support:closed", (data: SupportClosedPayload) => {
        if (
          data.threadId &&
          threadIdRef.current &&
          data.threadId !== threadIdRef.current
        ) {
          return;
        }
        syncStatus("BOT");
        syncPrompt(undefined);
        syncTxid(null);
        setAgentTyping(false);
        setAgentReadyMessage(null);
        setChoices([]);
        void loadThreadRef.current();
      });

      next.on("support:history", (data: SupportHistoryPayload) => {
        if (!data.threadId || !matchesOpenThread(data.threadId)) return;
        syncThreadId(data.threadId);
        if (
          data.status === "BOT" ||
          data.status === "WAITING" ||
          data.status === "LIVE" ||
          data.status === "CLOSED"
        ) {
          syncStatus(data.status);
        }
        if (!Array.isArray(data.messages)) return;
        setMessages(
          data.messages
            .map((item) => parseSupportMessage(item, data.threadId))
            .filter((item): item is SupportMessage => !!item)
            .map((item) =>
              item.author === "BOT"
                ? { ...item, text: sanitizeBotReply(item.text) }
                : item,
            ),
        );
      });

      next.on("support:error", (data: SupportErrorPayload) => {
        if (data?.message) setSocketError(data.message);
      });
    };

    const connect = async () => {
      try {
        const auth = await unwrapAction(getSupportSocketAuth());
        if (cancelled) return;

        socket = io(auth.url, {
          auth: { token: auth.token },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 2000,
        });
        socketRef.current = socket;
        attach(socket);

        const delay = Math.max(
          5_000,
          auth.expiresAt - Date.now() - TOKEN_REFRESH_SKEW_MS,
        );
        refreshTimer = window.setTimeout(() => {
          socket?.disconnect();
          socketRef.current = null;
          void connect();
        }, delay);
      } catch {
        socketRef.current = null;
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [
    appendSystem,
    isAuthenticated,
    matchesOpenThread,
    syncPrompt,
    syncStatus,
    syncThreadId,
    syncTxid,
  ]);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      if (isLiveSupportStatus(statusRef.current)) {
        emitLiveText(text);
        return;
      }
      // « j'ai payé », « j'ai envoyé » ou un numéro collé ici ne changent pas le statut.
      await postBot({ message: text }, text);
    },
    [emitLiveText, postBot],
  );

  const sendSuggestion = useCallback(
    async (suggestion: ChatSuggestion) => {
      syncTxid(suggestion.txid);
      await postBot(
        { action: "select_tx", txid: suggestion.txid },
        suggestion.label,
      );
    },
    [postBot, syncTxid],
  );

  const sendPinned = useCallback(
    async (button: ChatPinned) => {
      await postBot({ action: "tx_error" }, button.label);
    },
    [postBot],
  );

  const sendPhoneFix = useCallback(
    async (value: string) => {
      const digits = receiverPhoneValue(value);
      const txid = activeTxidRef.current;
      if (!digits || !txid) {
        throw new Error("invalid_phone_fix");
      }
      await postBot({ action: "fix", txid, value: digits }, digits);
    },
    [postBot],
  );

  const uploadProof = useCallback(
    async (file: File) => {
      const input = promptRef.current;
      if (!isProofFileInput(input)) {
        throw new Error("no_proof_input");
      }
      const transactionId = transactionIdFromProofInput(input);
      const txid =
        activeTxidRef.current || input.txid || readPersistedTxid();
      if (txid) syncTxid(txid);
      if (!transactionId || !txid) {
        throw new Error("missing_tx");
      }

      setUploading(true);
      try {
        await unwrapAction(uploadFiles([file], transactionId, ""));
        await postBot({ action: "proof_done", txid });
      } finally {
        setUploading(false);
      }
    },
    [postBot, syncTxid],
  );

  const uploadLiveFile = useCallback(async (file: File, comment?: string) => {
    const id = threadIdRef.current;
    if (!id || !isLiveSupportStatus(statusRef.current)) {
      throw new Error("file_wrong_status");
    }
    setUploading(true);
    try {
      const data = await unwrapAction(
        uploadChatbotThreadFile(id, file, comment),
      );
      syncStatus(data.status);
      syncThreadId(data.threadId);
      setMessages((prev) => mergeSupportMessage(prev, data.message));
    } finally {
      setUploading(false);
    }
  }, [syncStatus, syncThreadId]);

  const clearSocketError = useCallback(() => setSocketError(null), []);

  const setClientTyping = useCallback((isTyping: boolean) => {
    const id = threadIdRef.current;
    const socket = socketRef.current;
    if (!id || !socket || !isLiveSupportStatus(statusRef.current)) return;

    if (isTyping) {
      socket.emit("support:typing", { threadId: id, isTyping: true });
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        socket.emit("support:typing", { threadId: id, isTyping: false });
      }, TYPING_IDLE_MS);
      return;
    }

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    socket.emit("support:typing", { threadId: id, isTyping: false });
  }, []);

  return {
    status,
    threadId,
    messages,
    choices,
    pinned,
    prompt,
    activeTxid,
    agentTyping,
    loadingThread,
    sending,
    uploading,
    loadThread,
    sendText,
    sendPinned,
    sendSuggestion,
    sendPhoneFix,
    uploadProof,
    uploadLiveFile,
    setClientTyping,
    socketError,
    clearSocketError,
    agentReadyMessage,
  };
}
