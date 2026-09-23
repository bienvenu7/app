export const CHATBOT_MESSAGE_MAX_LENGTH = 2000;

export type ThreadStatus = "BOT" | "WAITING" | "LIVE" | "CLOSED";
export type SupportAuthor = "CLIENT" | "BOT" | "ADMIN";
export type ChatbotAction = "select_tx" | "fix" | "proof_done" | "handoff";

/**
 * Une transaction du jour (brouillons exclus, 20 maximum).
 * `label` est déjà explicite : l'afficher tel quel, sans le découper.
 */
export type ChatSuggestion = {
  id: string;
  label: string;
  action: "select_tx";
  txid: string;
};

export type ChatInput =
  | { type: "text"; name: "receiverPhone"; placeholder: string }
  | { type: "file"; transactionId: string; endpoint: string };

export type ChatbotRequest = {
  message?: string;
  action?: ChatbotAction;
  txid?: string;
  value?: string;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  author: SupportAuthor;
  text: string;
  createdAt: string;
  filename?: string;
  uri?: string;
  mime?: string;
};

export type ChatbotReply = {
  reply: string;
  threadId: string;
  suggestions: ChatSuggestion[];
  waiting?: boolean;
  live?: boolean;
  status?: ThreadStatus;
  echo?: SupportMessage;
  choices?: ChatSuggestion[];
  input?: ChatInput;
};

export type ClientThreadResponse = {
  thread: {
    id: string;
    status: ThreadStatus;
    createdAt: string;
    updatedAt: string;
  } | null;
  messages: SupportMessage[];
  suggestions: ChatSuggestion[];
  input?: ChatInput;
};

export type ThreadFileResponse = {
  threadId: string;
  status: ThreadStatus;
  message: SupportMessage;
};

export type SupportSocketAuth = {
  token: string;
  url: string;
  expiresAt: number;
};

const ACTIVE_TXID_KEY = "afrue-support-active-txid";

const THREAD_STATUSES: readonly ThreadStatus[] = [
  "BOT",
  "WAITING",
  "LIVE",
  "CLOSED",
];
const AUTHORS: readonly SupportAuthor[] = ["CLIENT", "BOT", "ADMIN"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getChatbotReply(data: ChatbotReply | string): string {
  if (typeof data === "string") return sanitizeBotReply(data);
  return sanitizeBotReply(typeof data.reply === "string" ? data.reply : "");
}

const INTERNAL_COMPLAIN =
  /\(?\b(ERREUR_CAPTURE|MAUVAIS_NUMERO|MONTANT_INCORRECT|SEUIL_ATTEINT)\b\)?/gi;
const UPLOAD_PATH = /\/v3\/file\/upload\/[^\s)\].,;]*/gi;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Jamais de lien d'upload, UUID ou code complain — garder les espaces du reply. */
export function sanitizeBotReply(text: string): string {
  return text
    .replace(UPLOAD_PATH, " ")
    .replace(INTERNAL_COMPLAIN, " ")
    .replace(UUID_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Boutons de cette réponse uniquement.
 * `choices` s'il est présent — y compris `[]`, pour retirer les boutons.
 * Sinon `suggestions` (même liste). Ne jamais recycler une liste précédente.
 */
export function buttonsFromReply(data: {
  choices?: ChatSuggestion[];
  suggestions?: ChatSuggestion[];
}): ChatSuggestion[] {
  if (data.choices !== undefined) return data.choices;
  return data.suggestions ?? [];
}

const RECEIVER_PHONE = /^\d{9,15}$/;

/** Chiffres seuls, indicatif, 9 à 15, sans `+`. Sinon le champ ne part pas en `fix`. */
export function receiverPhoneValue(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return RECEIVER_PHONE.test(digits) ? digits : null;
}

export function isLiveSupportStatus(
  status: ThreadStatus | "NONE" | null | undefined,
): boolean {
  return status === "WAITING" || status === "LIVE";
}

export function persistActiveTxid(txid: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (txid) sessionStorage.setItem(ACTIVE_TXID_KEY, txid);
    else sessionStorage.removeItem(ACTIVE_TXID_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedTxid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(ACTIVE_TXID_KEY);
  } catch {
    return null;
  }
}

export function isReceiverPhoneInput(
  input: ChatInput | undefined,
): input is Extract<ChatInput, { type: "text" }> {
  return input?.type === "text" && input.name === "receiverPhone";
}

export function isProofFileInput(
  input: ChatInput | undefined,
): input is Extract<ChatInput, { type: "file" }> {
  return input?.type === "file";
}

/** UUID de la TX pour `POST /v3/file/upload/:id` — jamais un endpoint arbitraire. */
export function transactionIdFromProofInput(
  input: Extract<ChatInput, { type: "file" }>,
): string | null {
  const direct = input.transactionId?.trim();
  if (direct) return direct;
  const match = input.endpoint.match(/\/file\/upload\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parseSupportMessage(
  value: unknown,
  fallbackThreadId = "",
): SupportMessage | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const id = asString(rec.id);
  const author = asString(rec.author);
  if (!id || !author || !AUTHORS.includes(author as SupportAuthor)) return null;

  const message: SupportMessage = {
    id,
    threadId: asString(rec.threadId) ?? fallbackThreadId,
    author: author as SupportAuthor,
    text: typeof rec.text === "string" ? rec.text : "",
    createdAt:
      asString(rec.createdAt) ?? new Date().toISOString(),
  };
  if (asString(rec.filename)) message.filename = rec.filename as string;
  if (asString(rec.uri)) message.uri = rec.uri as string;
  if (asString(rec.mime)) message.mime = rec.mime as string;
  return message;
}

function parseSuggestion(value: unknown): ChatSuggestion | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const id = asString(rec.id);
  const label = asString(rec.label);
  if (!id || !label) return null;
  const fromId = id.startsWith("select_tx:") ? id.slice("select_tx:".length) : "";
  const txid = asString(rec.txid) ?? (fromId || undefined);
  if (!txid) return null;
  return { id, label, action: "select_tx", txid };
}

function parseChatInput(value: unknown): ChatInput | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (rec.type === "text" && rec.name === "receiverPhone") {
    return {
      type: "text",
      name: "receiverPhone",
      placeholder: asString(rec.placeholder) ?? "",
    };
  }
  if (rec.type === "file") {
    const transactionId = asString(rec.transactionId) ?? "";
    const endpoint = asString(rec.endpoint) ?? "";
    if (!transactionId && !endpoint) return undefined;
    return { type: "file", transactionId, endpoint };
  }
  return undefined;
}

export function parseChatbotReply(value: unknown): ChatbotReply | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const threadId = asString(rec.threadId);
  if (!threadId) return null;

  const suggestions = Array.isArray(rec.suggestions)
    ? rec.suggestions
        .map(parseSuggestion)
        .filter((item): item is ChatSuggestion => !!item)
    : [];

  const reply: ChatbotReply = {
    reply: typeof rec.reply === "string" ? rec.reply : "",
    threadId,
    suggestions,
  };
  if (rec.waiting === true) reply.waiting = true;
  if (rec.live === true) reply.live = true;

  const status = asString(rec.status);
  if (status && THREAD_STATUSES.includes(status as ThreadStatus)) {
    reply.status = status as ThreadStatus;
  }

  const echo = parseSupportMessage(rec.echo, threadId);
  if (echo) reply.echo = echo;

  if (Array.isArray(rec.choices)) {
    reply.choices = rec.choices
      .map(parseSuggestion)
      .filter((item): item is ChatSuggestion => !!item);
  }

  const input = parseChatInput(rec.input);
  if (input) reply.input = input;
  return reply;
}

export function parseClientThread(value: unknown): ClientThreadResponse {
  const rec = asRecord(value);
  const empty: ClientThreadResponse = {
    thread: null,
    messages: [],
    suggestions: [],
  };
  if (!rec) return empty;

  let thread: ClientThreadResponse["thread"] = null;
  const threadRec = asRecord(rec.thread);
  if (threadRec) {
    const id = asString(threadRec.id);
    const status = asString(threadRec.status);
    if (id && status && THREAD_STATUSES.includes(status as ThreadStatus)) {
      thread = {
        id,
        status: status as ThreadStatus,
        createdAt: asString(threadRec.createdAt) ?? "",
        updatedAt: asString(threadRec.updatedAt) ?? "",
      };
    }
  }

  const messages = Array.isArray(rec.messages)
    ? rec.messages
        .map((item) => parseSupportMessage(item, thread?.id ?? ""))
        .filter((item): item is SupportMessage => !!item)
    : [];

  const suggestions = Array.isArray(rec.suggestions)
    ? rec.suggestions
        .map(parseSuggestion)
        .filter((item): item is ChatSuggestion => !!item)
    : [];

  const input = parseChatInput(rec.input);
  return {
    thread,
    messages,
    suggestions,
    ...(input ? { input } : {}),
  };
}

export function parseThreadFileResponse(
  value: unknown,
): ThreadFileResponse | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const threadId = asString(rec.threadId);
  const status = asString(rec.status);
  const message = parseSupportMessage(rec.message, threadId ?? "");
  if (
    !threadId ||
    !status ||
    !THREAD_STATUSES.includes(status as ThreadStatus) ||
    !message
  ) {
    return null;
  }
  return { threadId, status: status as ThreadStatus, message };
}

export function mergeSupportMessage(
  list: SupportMessage[],
  incoming: SupportMessage,
): SupportMessage[] {
  if (list.some((item) => item.id === incoming.id)) return list;
  const withoutOptimistic = list.filter(
    (item) =>
      !(
        item.id.startsWith("local-") &&
        item.author === incoming.author &&
        item.text === incoming.text &&
        item.uri === incoming.uri
      ),
  );
  return [...withoutOptimistic, incoming];
}

export function localSupportMessage(
  author: SupportAuthor,
  text: string,
  extras?: Partial<Pick<SupportMessage, "threadId" | "filename" | "uri" | "mime">>,
): SupportMessage {
  return {
    id: `local-${author}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: extras?.threadId ?? "",
    author,
    text,
    createdAt: new Date().toISOString(),
    ...(extras?.filename ? { filename: extras.filename } : {}),
    ...(extras?.uri ? { uri: extras.uri } : {}),
    ...(extras?.mime ? { mime: extras.mime } : {}),
  };
}
