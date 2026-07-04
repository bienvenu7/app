import instance from '@/instance';

export const sendMessage = async (message: string) => {
  const { data } = await instance.post('chatbot/message', { message });
  return data;
};
