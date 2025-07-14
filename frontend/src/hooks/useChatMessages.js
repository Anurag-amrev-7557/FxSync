import { useState, useEffect } from 'react';
import { saveMessages } from '../utils/persistence';

export default function useChatMessages(socket, currentSessionId, initialMessages = []) {
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    if (!socket) return;
    const handleChat = (msg) => {
      setMessages((prev) => {
        const newMessages = [...prev, msg];
        if (currentSessionId) {
          saveMessages(currentSessionId, newMessages);
        }
        return newMessages;
      });
    };
    const handleReaction = (reaction) => {
      setMessages((prev) => {
        const newMessages = [...prev, reaction];
        if (currentSessionId) {
          saveMessages(currentSessionId, newMessages);
        }
        return newMessages;
      });
    };
    socket.on('chat_message', handleChat);
    socket.on('reaction', handleReaction);
    return () => {
      socket.off('chat_message', handleChat);
      socket.off('reaction', handleReaction);
    };
  }, [socket, currentSessionId]);

  return [messages, setMessages];
} 