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
  isLiveSupportStatus,
  isProofFileInput,
  localSupportMessage,
  mergeSupportMessage,
  parseSupportMessage,
  suggestionsOrDefault,
  transactionIdFromProofInput,
  DEFAULT_TX_ERROR_SUGGESTION,
  type ChatbotRequest,
  type ChatChoice,
  type ChatInput,
  type ChatSuggestion,
  type ChatbotReply,
  type SupportMessage,
  type ThreadStatus,
} from "@/lib/chatbot";

type SupportStatus = ThreadStatus | "NONE";

type SupportWaitingPayload = { threadId?: string };
type SupportTypingPayload = { threadId?: string; isTyping?: boolean };
type SupportHistoryPayload = { messages?: unknown[] };
type SupportErrorPayload = { message?: string };

const TYPING_IDLE_MS = 2000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

export function useClientSupport(isAuthenticated: boolean) {
  const [status, setStatus] = useState<SupportStatus>("NONE");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([
    DEFAULT_TX_ERROR_SUGGESTION,
  ]);
  const [choices, setChoices] = useState<ChatChoice[]>([]);
  const [prompt, setPrompt] = useState<ChatInput | undefined>(undefined);
  const [activeTxid, setActiveTxid] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const statusRef = useRef<SupportStatus>("NONE");
  const threadIdRef = useRef<string | null>(null);
  const promptRef = useRef<ChatInput | undefined>(undefined);
  const activeTxidRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | undefined>(undefined);

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
  }, []);

  const joinThread = useCallback((id: string) => {
    socketRef.current?.emit("support:join", { threadId: id });
  }, []);

  const applyReply = useCallback(
    (data: ChatbotReply) => {
      syncThreadId(data.threadId);
      setSuggestions(suggestionsOrDefault(data.suggestions));
      setChoices(data.choices ?? []);
      syncPrompt(data.input);

      if (data.waiting) {
        syncStatus("WAITING");
        joinThread(data.threadId);
      } else if (
        statusRef.current === "NONE" ||
        statusRef.current === "CLOSED"
      ) {
        syncStatus("BOT");
      }

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          localSupportMessage("BOT", data.reply, { threadId: data.threadId }),
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
    setMessages((prev) => [
      ...prev,
      localSupportMessage("CLIENT", text, { threadId: id ?? "" }),
    ]);
    if (socket && id) {
      socket.emit("support:message", { threadId: id, text });
      socket.emit("support:typing", { threadId: id, isTyping: false });
      return true;
    }
    return false;
  }, []);

  const loadThread = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingThread(true);
    try {
      const data = await unwrapAction(getChatbotThread());
      const nextStatus = data.thread?.status ?? "NONE";
      syncStatus(nextStatus === "CLOSED" ? "CLOSED" : nextStatus);
      syncThreadId(data.thread?.id ?? null);
      setMessages(data.messages);
      setSuggestions(suggestionsOrDefault(data.suggestions));
      setChoices([]);
      syncPrompt(undefined);
      setAgentTyping(false);

      if (data.thread && isLiveSupportStatus(data.thread.status)) {
        joinThread(data.thread.id);
      }
    } finally {
      setLoadingThread(false);
    }
  }, [isAuthenticated, joinThread, syncPrompt, syncStatus, syncThreadId]);

  useEffect(() => {
    if (!isAuthenticated) {
      syncStatus("NONE");
      syncThreadId(null);
      setMessages([]);
      setSuggestions([DEFAULT_TX_ERROR_SUGGESTION]);
      setChoices([]);
      syncPrompt(undefined);
      syncTxid(null);
      setAgentTyping(false);
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
      next.on("connect", () => {
        const id = threadIdRef.current;
        if (id && isLiveSupportStatus(statusRef.current)) {
          next.emit("support:join", { threadId: id });
        }
      });

      next.on("support:waiting", (data: SupportWaitingPayload) => {
        if (data.threadId) syncThreadId(data.threadId);
        syncStatus("WAITING");
        setChoices([]);
        syncPrompt(undefined);
        setAgentTyping(false);
        if (data.threadId) next.emit("support:join", { threadId: data.threadId });
      });

      next.on("support:accepted", (data: SupportWaitingPayload) => {
        if (data.threadId) syncThreadId(data.threadId);
        syncStatus("LIVE");
        setChoices([]);
        syncPrompt(undefined);
        if (data.threadId) next.emit("support:join", { threadId: data.threadId });
      });

      next.on("support:message", (raw: unknown) => {
        const parsed = parseSupportMessage(raw, threadIdRef.current ?? "");
        if (!parsed) return;
        setMessages((prev) => mergeSupportMessage(prev, parsed));
        setAgentTyping(false);
      });

      next.on("support:typing", (data: SupportTypingPayload) => {
        setAgentTyping(data?.isTyping === true);
      });

      next.on("support:closed", () => {
        syncStatus("CLOSED");
        syncThreadId(null);
        setChoices([]);
        syncPrompt(undefined);
        syncTxid(null);
        setAgentTyping(false);
      });

      next.on("support:history", (data: SupportHistoryPayload) => {
        const nextMessages = Array.isArray(data?.messages)
          ? data.messages
              .map((item) =>
                parseSupportMessage(item, threadIdRef.current ?? ""),
              )
              .filter((item): item is SupportMessage => !!item)
          : [];
        setMessages(nextMessages);
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
  }, [isAuthenticated, syncPrompt, syncStatus, syncThreadId, syncTxid]);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      const current = statusRef.current;
      if (isLiveSupportStatus(current)) {
        if (!emitLiveText(text)) {
          await postBot({ message: text }, text);
        }
        return;
      }

      await postBot({ message: text }, text);
    },
    [emitLiveText, postBot],
  );

  const sendSuggestion = useCallback(
    async (suggestion: ChatSuggestion) => {
      await postBot({ action: "tx_error" }, suggestion.label);
    },
    [postBot],
  );

  const sendChoice = useCallback(
    async (choice: ChatChoice) => {
      if (choice.txid) syncTxid(choice.txid);
      const body: ChatbotRequest = { action: choice.action };
      if (choice.txid) body.txid = choice.txid;
      if (choice.value) body.value = choice.value;
      await postBot(body, choice.label);
    },
    [postBot, syncTxid],
  );

  const sendPhoneFix = useCallback(
    async (value: string) => {
      const txid = activeTxidRef.current;
      if (txid) {
        await postBot({ action: "fix", txid, value }, value);
        return;
      }
      await postBot({ message: value }, value);
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
      const txid = activeTxidRef.current;
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
    [postBot],
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
    if (!id || !socket || statusRef.current !== "LIVE") return;

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
    suggestions,
    choices,
    prompt,
    activeTxid,
    agentTyping,
    loadingThread,
    sending,
    uploading,
    loadThread,
    sendText,
    sendSuggestion,
    sendChoice,
    sendPhoneFix,
    uploadProof,
    uploadLiveFile,
    setClientTyping,
    socketError,
    clearSocketError,
  };
}
