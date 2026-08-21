export const CHATBOT_MESSAGE_MAX_LENGTH = 2000;

export type IChatbotResponse = { reply: string };

export function getChatbotReply(data: IChatbotResponse | string): string {
  if (typeof data === "string") return data;
  return data.reply ?? "Je n'ai pas pu traiter la réponse.";
}
