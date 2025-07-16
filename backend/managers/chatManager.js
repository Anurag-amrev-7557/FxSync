export function formatChatMessage(sender, message, displayName) {
  return {
    sender,
    message,
    displayName, // include displayName
    timestamp: Date.now(),
    messageId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };
}

export function formatReaction(sender, reaction) {
  return {
    sender,
    reaction,
    timestamp: Date.now()
  };
} 