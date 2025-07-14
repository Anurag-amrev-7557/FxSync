import { useState, useEffect, useRef } from 'react';
import { saveMessages } from '../utils/persistence';

// Simple debounce utility
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function useChatMessages(socket, currentSessionId, initialMessages = []) {
  const [messages, setMessages] = useState(initialMessages);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Debounced save function
  const debouncedSave = useRef(
    debounce((sessionId, msgs) => {
      if (sessionId) saveMessages(sessionId, msgs);
    }, 300)
  ).current;

  useEffect(() => {
    if (!socket) return;
    const handleChat = (msg) => {
      setMessages((prev) => {
        const newMessages = [...prev, msg];
        if (currentSessionId) {
          debouncedSave(currentSessionId, newMessages);
        }
        return newMessages;
      });
    };
    const handleReaction = (reaction) => {
      setMessages((prev) => {
        const newMessages = [...prev, reaction];
        if (currentSessionId) {
          debouncedSave(currentSessionId, newMessages);
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
  }, [socket, currentSessionId, debouncedSave]);

  return [messages, setMessages];
} 