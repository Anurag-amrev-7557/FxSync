import usePeerTimeSync from './usePeerTimeSync';

// Dynamic peer count, but stable order for React hooks
export default function useMultiPeerTimeSync(socket, clientId, peerIds, maxPeers = 5) {
  // Always call the same number of hooks in the same order
  const paddedPeerIds = Array.from({ length: maxPeers }, (_, i) => peerIds[i] || null);
  return paddedPeerIds.map(peerId => usePeerTimeSync(socket, clientId, peerId));
} 