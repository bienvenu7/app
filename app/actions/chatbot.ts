"use server";

import { instance } from "@/config/instance";
import { AuthHttpError, withAuthError } from "@/lib/auth-errors";
import {
  CHATBOT_MESSAGE_MAX_LENGTH,
  type IChatbotResponse,
} from "@/lib/chatbot";

export const sendMessage = async (
  message: string,
): Promise<IChatbotResponse> => {
  return withAuthError(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new AuthHttpError(400, "validation", "empty_message");
    }
    if (trimmed.length > CHATBOT_MESSAGE_MAX_LENGTH) {
      throw new AuthHttpError(400, "validation", "message_too_long");
    }

    const { data } = await instance.post("chatbot/message", {
      message: trimmed,
    });
    return data as IChatbotResponse;
  }) as Promise<IChatbotResponse>;
};
