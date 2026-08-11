import { instance } from "@/config/instance";
import { getAccessToken } from "@/config/cookies";
import { AuthHttpError, toAuthHttpError } from "@/lib/auth-errors";

export const CHATBOT_MESSAGE_MAX_LENGTH = 2000;

export interface IChatbotResponse {
  message?: string;
  reply?: string;
  response?: string;
  content?: string;
}

export const sendMessage = async (
  message: string,
): Promise<IChatbotResponse | string> => {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new AuthHttpError(400, "validation", "empty_message");
  }
  if (trimmed.length > CHATBOT_MESSAGE_MAX_LENGTH) {
    throw new AuthHttpError(400, "validation", "message_too_long");
  }

  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new AuthHttpError(401, "unauthorized");
  }

  try {
    const { data } = await instance.post(
      "chatbot/message",
      { message: trimmed },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return data;
  } catch (error: unknown) {
    const mapped = toAuthHttpError(error);
    if (mapped) throw mapped;
    throw error;
  }
};

export function getChatbotReply(data: IChatbotResponse | string): string {
  if (typeof data === "string") return data;

  return (
    data.reply ??
    data.response ??
    data.content ??
    data.message ??
    "Je n'ai pas pu traiter la réponse."
  );
}
