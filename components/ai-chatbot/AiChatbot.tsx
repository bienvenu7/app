"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, X } from "lucide-react";
import { toast } from "sonner";
import { getChatbotReply } from "@/app/actions/chatbot";
import { useSendMessage } from "@/hooks/useFile";
import styles from "./ai-chatbot.module.scss";

const FAB_SIZE_MOBILE = 44;
const FAB_SIZE_DESKTOP = 56;
const BP_DESKTOP = 921;
const DRAG_THRESHOLD = 8;
const POSITION_STORAGE_KEY = "afrue-ai-chat-fab-position";

function getFabSize() {
  if (typeof window === "undefined") return FAB_SIZE_MOBILE;
  return window.innerWidth >= BP_DESKTOP ? FAB_SIZE_DESKTOP : FAB_SIZE_MOBILE;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Bonjour ! Je suis l'assistant AFRU-E. Posez-moi vos questions sur les transferts, les frais ou votre compte.",
};

const ERROR_REPLY =
  "Désolé, une erreur s'est produite. Veuillez réessayer dans un instant.";

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

export function AiChatbot() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const { mutateAsync, isPending } = useSendMessage("chatbot");

  const fabRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
  }, [messages, isPending, isOpen]);

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

  const handleSendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const data = await mutateAsync(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: getChatbotReply(data),
        },
      ]);
    } catch {
      toast.error("Impossible d'envoyer le message. Réessayez.");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: ERROR_REPLY,
        },
      ]);
    }
  }, [input, isPending, mutateAsync]);

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

  if (!position) return null;

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
        aria-label={isOpen ? "Fermer l'assistant" : "Ouvrir l'assistant"}
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
                      Assistant AFRU-E
                    </h2>
                    <p className={styles.subtitle}>En ligne</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setIsOpen(false)}
                  aria-label="Fermer le chat"
                >
                  <X />
                </button>
              </header>

              <div className={styles.messages}>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`${styles.message} ${styles[message.role]}`}
                  >
                    <div className={styles.bubble}>{message.content}</div>
                  </div>
                ))}
                {isPending && (
                  <div className={`${styles.message} ${styles.assistant}`}>
                    <div className={styles.typing} aria-label="L'assistant écrit">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className={styles.inputArea} onSubmit={handleSubmit}>
                <textarea
                  className={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Écrivez votre message…"
                  rows={1}
                  aria-label="Message à l'assistant"
                />
                <button
                  type="submit"
                  className={styles.send}
                  disabled={!input.trim() || isPending}
                  aria-label="Envoyer"
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
