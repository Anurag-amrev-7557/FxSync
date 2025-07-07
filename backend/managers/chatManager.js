export function formatChatMessage(sender, message) {
  return {
    sender,
    message,
    timestamp: Date.now()
  };
}

export function formatReaction(sender, reaction) {
  return {
    sender,
    reaction,
    timestamp: Date.now()
  };
} 