import React, { useState, useRef, useEffect } from 'react';

const EMOJIS = ['🎵', '👏', '🔥', '😂', '😍', '👍'];

export default function ChatBox({ socket, sessionId, clientId, messages = [], onSend, clients = [] }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Helper to get display name from clientId
  const getDisplayName = (id) => {
    if (id === clientId) return 'You';
    const found = clients.find(c => c.clientId === id);
    return found ? found.displayName || found.clientId || id : id;
  };

  const sendMessage = (msg) => {
    if (!msg.trim() || !socket) return;
    setSending(true);
    socket.emit('chat_message', { sessionId, message: msg, sender: clientId });
    setInput('');
    setTimeout(() => setSending(false), 300);
    onSend && onSend({ sender: clientId, message: msg, timestamp: Date.now() });
  };

  const sendEmoji = (emoji) => {
    if (!socket) return;
    socket.emit('reaction', { sessionId, reaction: emoji, sender: clientId });
    onSend && onSend({ sender: clientId, reaction: emoji, timestamp: Date.now() });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="max-w-xl mx-auto mt-4 p-4 bg-white rounded shadow flex flex-col h-72">
      <div className="flex-1 overflow-y-auto mb-2">
        <ul className="space-y-1">
          {messages.map((msg, i) => (
            <li key={i} className="text-sm">
              {msg.reaction ? (
                <span>
                  <span className="font-semibold text-blue-600">{getDisplayName(msg.sender)}</span> <span>{msg.reaction}</span>
                </span>
              ) : (
                <span>
                  <span className="font-semibold text-blue-600">{getDisplayName(msg.sender)}:</span> {msg.message}
                </span>
              )}
            </li>
          ))}
          <div ref={messagesEndRef} />
        </ul>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
        <input
          className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={sending}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          disabled={sending || !input.trim()}
        >
          Send
        </button>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="text-xl px-1 hover:bg-gray-100 rounded"
            onClick={() => sendEmoji(emoji)}
            disabled={sending}
          >
            {emoji}
          </button>
        ))}
      </form>
    </div>
  );
} 