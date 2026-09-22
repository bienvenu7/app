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

function socketOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv.replace(/\/v3$/i, "");
  try {
    return new URL(baseURL).origin;
  } catch {
    return "http://localhost:7001";
  }
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
