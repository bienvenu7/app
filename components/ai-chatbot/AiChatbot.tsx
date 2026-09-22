"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  CHATBOT_MESSAGE_MAX_LENGTH,
  isLiveSupportStatus,
  isProofFileInput,
  isReceiverPhoneInput,
  type SupportAuthor,
  type SupportMessage,
} from "@/lib/chatbot";
import { useClientSupport } from "@/hooks/useClientSupport";
import styles from "./ai-chatbot.module.scss";
import { useT } from "@/lib/i18n";
import { Auth } from "@/providers/AuthContext";
import {
  isConflict,
  isForbiddenAuth,
  isRateLimited,
  isServiceUnavailable,
  isUnauthorized,
  isValidationError,
} from "@/lib/auth-errors";
import {
  PROOF_FILE_ACCEPT,
  validateProofFiles,
} from "@/lib/upload-proof";
import { compressImageFile } from "@/lib/compress-image";
import { sanitizeWhatsappInput, WHATSAPP_PATTERN } from "@/lib/phone-rules";

const FAB_SIZE_MOBILE = 44;
const FAB_SIZE_DESKTOP = 56;
const BP_DESKTOP = 921;
const DRAG_THRESHOLD = 8;
const POSITION_STORAGE_KEY = "afrue-ai-chat-fab-position";

function getFabSize() {
  if (typeof window === "undefined") return FAB_SIZE_MOBILE;
  return window.innerWidth >= BP_DESKTOP ? FAB_SIZE_DESKTOP : FAB_SIZE_MOBILE;
}

function getBottomOffset() {
  if (typeof window === "undefined") return 100;
  return window.innerWidth >= 921 ? 32 : 100;
}

function getDefaultPosition() {
  const margin = 18;
  const bottomOffset = getBottomOffset();
  const fabSize = getFabSize();
  return {
    x: window.innerWidth - fabSize - margin,
    y: window.innerHeight - fabSize - bottomOffset - margin,
  };
}

function clampPosition(x: number, y: number) {
  const margin = 8;
  const fabSize = getFabSize();
  const maxX = window.innerWidth - fabSize - margin;
  const maxY = window.innerHeight - fabSize - margin;
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

function loadStoredPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x: number; y: number };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return clampPosition(parsed.x, parsed.y);
  } catch {
    return null;
  }
}

function messageTone(author: SupportAuthor): "user" | "assistant" | "admin" {
  if (author === "CLIENT") return "user";
  if (author === "ADMIN") return "admin";
  return "assistant";
}

function MessageBubble({ message }: { message: SupportMessage }) {
  const t = useT();
  const tone = messageTone(message.author);
  const isImage = !!message.uri && !!message.mime?.startsWith("image/");
  const fileLabel = message.filename || message.uri;

  return (
    <div className={`${styles.message} ${styles[tone]}`}>
      <div className={styles.bubble}>
        {message.author === "ADMIN" && (
          <span className={styles.authorBadge}>{t("chatbot.agentBadge")}</span>
        )}
        {isImage && message.uri && (
          <a href={message.uri} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.uri}
              alt={message.filename ?? ""}
              className={styles.fileImage}
            />
          </a>
        )}
        {!isImage && message.uri && fileLabel && (
          <a
            href={message.uri}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fileLink}
          >
            {t("chatbot.downloadFile", { name: fileLabel })}
          </a>
        )}
        {message.text ? message.text : null}
      </div>
    </div>
  );
}

export function AiChatbot() {
  const t = useT();
  const {
    state: { isAuthenticated, isLoading: authLoading },
  } = Auth();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const support = useClientSupport(isAuthenticated);
  const {
    status,
    messages,
    suggestions,
    prompt,
    agentTyping,
    sending,
    uploading,
    loadThread,
    sendText,
    sendSuggestion,
    sendPhoneFix,
    uploadProof,
    uploadLiveFile,
    setClientTyping,
    socketError,
    clearSocketError,
  } = support;

  const busy = sending || uploading;
  const phonePrompt = isReceiverPhoneInput(prompt) && status !== "LIVE";
  const proofPrompt = isProofFileInput(prompt);
  const liveMode = isLiveSupportStatus(status);
  const showGuidedInput = !!prompt && status !== "LIVE";

  const fabRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const openedOnce = useRef(false);
  const loadThreadRef = useRef(loadThread);
  loadThreadRef.current = loadThread;
  const dragState = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  useEffect(() => {
    const stored = loadStoredPosition();
    setPosition(stored ?? getDefaultPosition());
  }, []);

  useEffect(() => {
    if (!position) return;
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => (prev ? clampPosition(prev.x, prev.y) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, agentTyping, isOpen, suggestions]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    if (!openedOnce.current) {
      openedOnce.current = true;
      return;
    }
    void loadThreadRef.current();
  }, [isOpen, isAuthenticated]);

  useEffect(() => {
    if (!socketError) return;
    toast.error(socketError);
    clearSocketError();
  }, [socketError, clearSocketError]);

  useEffect(() => {
    if (status === "CLOSED") setInput("");
  }, [status]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!position) return;
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    fabRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    drag.moved = true;
    setPosition(clampPosition(drag.originX + dx, drag.originY + dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (drag.pointerId !== e.pointerId) return;

    fabRef.current?.releasePointerCapture(e.pointerId);

    if (!drag.moved) {
      setIsOpen((open) => !open);
    }

    dragState.current.pointerId = -1;
  };

  const toastSendError = useCallback(
    (error: unknown) => {
      if (isRateLimited(error)) return t("chatbot.rateLimited");
      if (isUnauthorized(error) || isForbiddenAuth(error)) {
        return t("chatbot.authRequired");
      }
      if (isValidationError(error)) return t("chatbot.messageTooLong");
      if (isServiceUnavailable(error)) return t("chatbot.aiUnavailable");
      if (isConflict(error)) return t("chatbot.fileWrongStatus");
      return t("chatbot.sendError");
    },
    [t],
  );

  const handleSendMessage = useCallback(async () => {
    const trimmed = input.trim();
    const phoneValue = sanitizeWhatsappInput(trimmed);
    if (!trimmed || busy) return;

    if (trimmed.length > CHATBOT_MESSAGE_MAX_LENGTH) {
      toast.error(t("chatbot.messageTooLong"));
      return;
    }

    setInput("");
    try {
      if (phonePrompt && WHATSAPP_PATTERN.test(phoneValue)) {
        await sendPhoneFix(phoneValue);
      } else {
        await sendText(trimmed);
      }
    } catch (error) {
      toast.error(toastSendError(error));
    }
  }, [busy, input, phonePrompt, sendPhoneFix, sendText, t, toastSendError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSendMessage();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleInputChange = (value: string) => {
    setInput(
      phonePrompt
        ? sanitizeWhatsappInput(value)
        : value.slice(0, CHATBOT_MESSAGE_MAX_LENGTH),
    );
    if (status === "LIVE") setClientTyping(true);
  };

  const handleSuggestion = async (suggestion: (typeof suggestions)[number]) => {
    try {
      await sendSuggestion(suggestion);
    } catch (error) {
      toast.error(toastSendError(error));
    }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;

    const result = validateProofFiles(files, 0);
    if (!result.ok) {
      if (result.error === "invalid_type") {
        toast.error(t("validate.invalidFileType"));
      } else if (result.error === "file_too_large") {
        toast.error(t("validate.fileTooLarge"));
      } else {
        toast.error(t("validate.tooManyFiles", { max: 1 }));
      }
      return;
    }

    const file = result.files[0];
    if (!file) return;

    if (proofPrompt) {
      setProofFile(file);
      return;
    }

    void (async () => {
      try {
        const compressed = await compressImageFile(file);
        await uploadLiveFile(compressed, input.trim() || undefined);
        setInput("");
      } catch (error) {
        toast.error(
          isConflict(error) ? t("chatbot.fileWrongStatus") : t("chatbot.fileError"),
        );
      }
    })();
  };

  const handleProofUpload = async () => {
    if (!proofFile || busy) return;
    try {
      const compressed = await compressImageFile(proofFile);
      await uploadProof(compressed);
      setProofFile(null);
    } catch (error) {
      toast.error(toastSendError(error));
    }
  };

  const subtitle =
    status === "WAITING"
      ? t("chatbot.waitingSubtitle")
      : status === "LIVE"
        ? t("chatbot.agentOnline")
        : t("chatbot.online");

  const placeholder = phonePrompt
    ? prompt.placeholder || t("chatbot.placeholder")
    : t("chatbot.placeholder");

  if (authLoading || !isAuthenticated || !position) return null;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`${styles.fab} ${isOpen ? styles.open : ""}`}
        style={{ left: position.x, top: position.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={
          isOpen ? t("chatbot.closeAssistant") : t("chatbot.openAssistant")
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {isOpen ? <X /> : <Bot />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setIsOpen(false)}
              aria-hidden
            />
            <motion.section
              className={styles.panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-chat-title"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <header className={styles.header}>
                <div className={styles.headerInfo}>
                  <div className={styles.avatar}>
                    <Bot />
                  </div>
                  <div>
                    <h2 id="ai-chat-title" className={styles.title}>
                      {t("chatbot.title")}
                    </h2>
                    <p
                      className={`${styles.subtitle} ${
                        status === "WAITING" ? styles.waiting : ""
                      }`}
                    >
                      {subtitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setIsOpen(false)}
                  aria-label={t("chatbot.closeChat")}
                >
                  <X />
                </button>
              </header>

              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div className={`${styles.message} ${styles.assistant}`}>
                    <div className={styles.bubble}>
                      {status === "CLOSED"
                        ? t("chatbot.closedHint")
                        : t("chatbot.greeting")}
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {status === "CLOSED" && messages.length > 0 && (
                  <div className={`${styles.message} ${styles.assistant}`}>
                    <div className={styles.bubble}>{t("chatbot.closedHint")}</div>
                  </div>
                )}
                {(sending || agentTyping) && (
                  <div className={`${styles.message} ${styles.assistant}`}>
                    <div
                      className={styles.typing}
                      aria-label={
                        agentTyping ? t("chatbot.agentTyping") : t("chatbot.typing")
                      }
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {status === "WAITING" && (
                <p className={styles.banner}>{t("chatbot.waiting")}</p>
              )}

              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <p className={styles.proofHint}>{t("chatbot.errorChips")}</p>
                  <div className={styles.chips}>
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className={styles.suggestionBtn}
                        disabled={busy}
                        onClick={() => void handleSuggestion(suggestion)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showGuidedInput && proofPrompt && (
                <div className={styles.guided}>
                  <p className={styles.proofHint}>{t("chatbot.attachHint")}</p>
                  <div className={styles.proofRow}>
                    <button
                      type="button"
                      className={styles.suggestionBtn}
                      disabled={busy}
                      onClick={() => fileRef.current?.click()}
                    >
                      {t("chatbot.chooseFile")}
                    </button>
                    {proofFile && (
                      <>
                        <span className={styles.fileName}>{proofFile.name}</span>
                        <button
                          type="button"
                          className={styles.suggestionBtn}
                          disabled={busy}
                          onClick={() => void handleProofUpload()}
                        >
                          {t("chatbot.uploadProof")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <form className={styles.inputArea} onSubmit={handleSubmit}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={PROOF_FILE_ACCEPT}
                  hidden
                  onChange={pickFile}
                />
                {liveMode && (
                  <button
                    type="button"
                    className={styles.attach}
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    aria-label={t("chatbot.attachAria")}
                  >
                    <Paperclip />
                  </button>
                )}
                <textarea
                  className={styles.input}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={placeholder}
                  rows={1}
                  inputMode={phonePrompt ? "numeric" : "text"}
                  maxLength={
                    phonePrompt ? 15 : CHATBOT_MESSAGE_MAX_LENGTH
                  }
                  aria-label={t("chatbot.messageAria")}
                />
                <button
                  type="submit"
                  className={styles.send}
                  disabled={!input.trim() || busy}
                  aria-label={t("chatbot.sendAria")}
                >
                  <Send />
                </button>
              </form>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
