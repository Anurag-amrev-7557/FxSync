import { useState, useEffect } from 'react';
import { saveMessages } from '../utils/persistence';

export default function useChatMessages(socket, currentSessionId, initialMessages = []) {
  const [messages, setMessages] = useState(initialMessages);

  // Mark a message as delivered by messageId
  const markDelivered = (messageId) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.messageId === messageId ? { ...msg, delivered: true } : msg))
    );
  };

  useEffect(() => {
    if (!socket) return;
    const handleChat = (msg) => {
      if (import.meta.env.MODE === 'development') {
        console.log('[useChatMessages] Received chat_message:', msg);
      }
      setMessages((prev) => {
        // Only add if not already present
        if (prev.some((m) => m.messageId === msg.messageId)) return prev;
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
    const handleMessageEdited = (msg) => {
      setMessages((prev) =>
        prev.map((m) => (m.messageId === msg.messageId ? { ...m, ...msg } : m))
      );
    };
    const handleMessageDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
    };
    // Real-time delivery/read status
    const handleMessageDelivered = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.messageId === messageId ? { ...msg, delivered: true } : msg))
      );
    };
    const handleMessageRead = ({ messageId, reader }) => {
      if (import.meta.env.MODE === 'development') {
        console.log('[CLIENT] message_read received:', { messageId, reader });
      }
      setMessages((prev) =>
        prev.map((msg) => (msg.messageId === messageId ? { ...msg, read: true } : msg))
      );
    };
    socket.on('chat_message', handleChat);
    socket.on('reaction', handleReaction);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_delivered', handleMessageDelivered);
    socket.on('message_read', handleMessageRead);
    return () => {
      socket.off('chat_message', handleChat);
      socket.off('reaction', handleReaction);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_delivered', handleMessageDelivered);
      socket.off('message_read', handleMessageRead);
    };
  }, [socket, currentSessionId]);

  return [messages, setMessages, markDelivered];
}
