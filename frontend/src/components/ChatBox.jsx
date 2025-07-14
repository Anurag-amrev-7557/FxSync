import React, { useState, useRef, useEffect } from 'react';
import { useStaggeredAnimation } from '../hooks/useSmoothAppearance';
import { InlineLoadingSpinner } from './LoadingSpinner';
import { useToast } from './ToastProvider';

const EMOJIS = ['🎵', '👏', '🔥', '😂', '😍', '👍', '❤️', '🎉'];

const ChatBox = React.memo(function ChatBox({ socket, sessionId, clientId, messages = [], clients = [], mobile = false, isChatTabActive = false }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Smooth animation for new messages
  const messageAnimations = useStaggeredAnimation(messages, 30, 'animate-slide-in-right');
  const { showToast } = useToast();

  // Trigger animation for mobile chat input
  useEffect(() => {
    if (mobile) {
      // Small delay to ensure the component is mounted
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mobile]);

  // Trigger animation when chat tab becomes active
  useEffect(() => {
    if (mobile && isChatTabActive) {
      setShouldAnimate(false);
      const timer = setTimeout(() => {
        setShouldAnimate(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobile, isChatTabActive]);

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
    if (!msg.trim() || !socket) {
      return;
    }
    setSending(true);
    socket.emit('chat_message', { sessionId, message: msg, sender: clientId }, (response) => {});
    setInput('');
    setTimeout(() => setSending(false), 300);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Add error handling and logging for debugging
  useEffect(() => {
    if (!socket) {
      return;
    }
    // Listen for chat message responses
    const handleChatResponse = (data) => {};
    const handleError = (error) => {
      showToast('Chat error occurred', { type: 'error' });
    };
    const handleConnect = () => {};
    const handleDisconnect = () => {};
    socket.on('chat_response', handleChatResponse);
    socket.on('error', handleError);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('chat_response', handleChatResponse);
      socket.off('error', handleError);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, sessionId, clientId]);

  // --- MOBILE LAYOUT ---
  if (mobile) {
    return (
      <div className="h-full flex flex-col relative">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium text-sm">Chat</h3>
              <p className="text-neutral-400 text-xs">{clients.length} participant{clients.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32"> {/* Add bottom padding for floating input */}
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <p className="text-neutral-400 text-sm mb-1">No messages yet</p>
              <p className="text-neutral-500 text-xs">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={`${msg.sender}-${msg.timestamp}-${i}`} className={`flex transition-all duration-300 ${msg.sender === clientId ? 'justify-end' : 'justify-start'} ${messageAnimations[i]?.animationClass || ''}`}>
                <div className={`max-w-xs lg:max-w-md ${msg.sender === clientId ? 'order-2' : 'order-1'}`}>
                  {msg.reaction ? (
                    <div className={`flex items-center gap-2 ${msg.sender === clientId ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-xs text-neutral-500">
                        {getDisplayName(msg.sender)}
                      </span>
                      <div className="bg-neutral-800 rounded-lg px-3 py-2 text-lg">
                        {msg.reaction}
                      </div>
                    </div>
                  ) : (
                    <div className={`${msg.sender === clientId ? 'bg-primary text-white' : 'bg-neutral-800 text-white'} rounded-lg px-3 py-2`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium opacity-80">
                          {getDisplayName(msg.sender)}
                        </span>
                        <span className="text-xs opacity-60">
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                        </span>
                      </div>
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Chat Input */}
        <div className="fixed left-0 right-0 bottom-20 z-30 flex justify-center pointer-events-none">
          <div className="w-[95vw] max-w-sm pointer-events-auto">
            <div className={`bg-neutral-900/90 backdrop-blur-lg rounded-full shadow-2xl p-3 border border-neutral-800 ${shouldAnimate ? 'animate-slide-up-from-bottom' : 'opacity-0 translate-y-full'}`}>
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Message Input */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-full px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/50 focus:border-white/50 transition-all duration-200"
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={!socket ? "Connecting..." : "Type a message..."}
                    disabled={sending || !socket}
                    aria-label="Chat message input"
                    role="textbox"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-white hover:bg-primary/90 text-black rounded-full text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    disabled={sending || !input.trim() || !socket}
                    aria-label="Send chat message"
                    role="button"
                  >
                    {sending ? (
                      <>
                        <InlineLoadingSpinner size="sm" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                        </svg>
                        Send
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- DESKTOP LAYOUT (default) ---
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">Chat</h3>
            <p className="text-neutral-400 text-xs">{clients.length} participant{clients.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-neutral-800 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <p className="text-neutral-400 text-sm mb-1">No messages yet</p>
            <p className="text-neutral-500 text-xs">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={`${msg.sender}-${msg.timestamp}-${i}`} className={`flex transition-all duration-300 ${msg.sender === clientId ? 'justify-end' : 'justify-start'} ${messageAnimations[i]?.animationClass || ''}`}>
              <div className={`max-w-xs lg:max-w-md ${msg.sender === clientId ? 'order-2' : 'order-1'}`}>
                {msg.reaction ? (
                  <div className={`flex items-center gap-2 ${msg.sender === clientId ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-neutral-500">
                      {getDisplayName(msg.sender)}
                    </span>
                    <div className="bg-neutral-800 rounded-lg px-3 py-2 text-lg">
                      {msg.reaction}
                    </div>
                  </div>
                ) : (
                  <div className={`${msg.sender === clientId ? 'bg-primary text-white' : 'bg-neutral-800 text-white'} rounded-lg px-3 py-2`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium opacity-80">
                        {getDisplayName(msg.sender)}
                      </span>
                      <span className="text-xs opacity-60">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                      </span>
                    </div>
                    <p className="text-sm">{msg.message}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-neutral-800">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Message Input */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-white transition-all duration-200"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={!socket ? "Connecting..." : "Type a message..."}
              disabled={sending || !socket}
              aria-label="Chat message input"
              role="textbox"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={sending || !input.trim() || !socket}
              aria-label="Send chat message"
              role="button"
            >
              {sending ? (
                <>
                  <InlineLoadingSpinner size="sm" />
                  Sending...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                  </svg>
                  Send
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default ChatBox;