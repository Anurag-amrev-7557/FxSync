export function formatChatMessage(sender, message, displayName) {
  return {
    sender,
    message,
    displayName, // include displayName
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