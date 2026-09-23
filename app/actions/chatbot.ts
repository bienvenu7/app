"use server";

import { instance, baseURL, refreshAccessToken } from "@/config/instance";
import {
  getAccessExpiresAt,
  getAccessToken,
  shouldRefreshAccess,
} from "@/config/server-cookies";
import { AuthHttpError, withAuthError } from "@/lib/auth-errors";
import { apiPathSegment } from "@/lib/api-path";
import { requireAccessToken } from "@/lib/require-auth";
import {
  CHATBOT_MESSAGE_MAX_LENGTH,
  parseChatbotReply,
  parseClientThread,
  parseThreadFileResponse,
  type ChatbotReply,
  type ChatbotRequest,
  type ClientThreadResponse,
  type SupportSocketAuth,
  type ThreadFileResponse,
} from "@/lib/chatbot";
import {
  isAllowedProofMime,
  MAX_PROOF_FILE_BYTES,
} from "@/lib/upload-proof";

function isLoopbackOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin);
}

function originFromUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    return new URL(trimmed.replace(/\/v3$/i, "")).origin;
  } catch {
    return null;
  }
}

/**
 * URL vue par le navigateur. Jamais localhost en production :
 * le téléphone / app.afrue.com ne peut pas joindre le VPS via 127.0.0.1.
 */
function socketOrigin(): string {
  const fromEnv = originFromUrl(process.env.NEXT_PUBLIC_API_URL);
  if (
    fromEnv &&
    (!isLoopbackOrigin(fromEnv) || process.env.NODE_ENV !== "production")
  ) {
    return fromEnv;
  }

  const fromBase = originFromUrl(baseURL);
  if (
    fromBase &&
    (!isLoopbackOrigin(fromBase) || process.env.NODE_ENV !== "production")
  ) {
    return fromBase;
  }

  return process.env.NODE_ENV === "production"
    ? "https://api.afrue.com"
    : "http://localhost:7001";
}

export const getChatbotThread = async (): Promise<ClientThreadResponse> => {
  return withAuthError(async () => {
    await requireAccessToken();
    const { data } = await instance.get("chatbot/thread");
    return parseClientThread(data);
  }) as Promise<ClientThreadResponse>;
};

export const sendChatbotMessage = async (
  body: ChatbotRequest,
): Promise<ChatbotReply> => {
  return withAuthError(async () => {
    const message = body.message?.trim();
    const action = body.action;
    if (!message && !action) {
      throw new AuthHttpError(400, "validation", "empty_message");
    }
    if (message && message.length > CHATBOT_MESSAGE_MAX_LENGTH) {
      throw new AuthHttpError(400, "validation", "message_too_long");
    }

    const payload: ChatbotRequest = {};
    if (message) payload.message = message;
    if (action) payload.action = action;
    if (body.txid?.trim()) payload.txid = body.txid.trim();
    if (body.value?.trim()) payload.value = body.value.trim();

    const { data } = await instance.post("chatbot/message", payload);
    const parsed = parseChatbotReply(data);
    if (!parsed) {
      throw new AuthHttpError(502, "service_unavailable");
    }
    return parsed;
  }) as Promise<ChatbotReply>;
};

/** @deprecated use sendChatbotMessage — conservé pour useSendMessage */
export const sendMessage = async (message: string): Promise<ChatbotReply> => {
  return sendChatbotMessage({ message });
};

export const uploadChatbotThreadFile = async (
  threadId: string,
  file: File,
  comment?: string,
): Promise<ThreadFileResponse> => {
  return withAuthError(async () => {
    await requireAccessToken();
    if (!isAllowedProofMime(file.type) || file.size > MAX_PROOF_FILE_BYTES) {
      throw new AuthHttpError(400, "validation", "invalid_file");
    }

    const formData = new FormData();
    formData.append("file", file);
    if (comment?.trim()) formData.append("comment", comment.trim());

    const { data } = await instance.post(
      `chatbot/thread/${apiPathSegment(threadId)}/file`,
      formData,
    );
    const parsed = parseThreadFileResponse(data);
    if (!parsed) {
      throw new AuthHttpError(502, "service_unavailable");
    }
    return parsed;
  }) as Promise<ThreadFileResponse>;
};

export const getSupportSocketAuth = async (): Promise<SupportSocketAuth> => {
  return withAuthError(async () => {
    let token = await getAccessToken();
    if (!token || (await shouldRefreshAccess())) {
      token = await refreshAccessToken();
    }
    if (!token) {
      throw new AuthHttpError(401, "unauthorized");
    }
    const expiresAt = await getAccessExpiresAt();
    return {
      token,
      url: socketOrigin(),
      expiresAt: expiresAt ?? Date.now() + 900_000,
    };
  }) as Promise<SupportSocketAuth>;
};
