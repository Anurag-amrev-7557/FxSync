function generateUUID() {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getClientId() {
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    clientId = generateUUID();
    localStorage.setItem('clientId', clientId);
  }
  return clientId;
} 