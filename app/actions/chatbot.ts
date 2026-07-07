import { instance } from "@/config/instance";

export interface IChatbotResponse {
  message?: string;
  reply?: string;
  response?: string;
  content?: string;
}

export const sendMessage = async (
  message: string,
): Promise<IChatbotResponse | string> => {
  const { data } = await instance.post("chatbot/message", { message });
  return data;
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
