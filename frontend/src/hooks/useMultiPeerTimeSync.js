import usePeerTimeSync from './usePeerTimeSync';

// Max number of peers to support for stable hook order
const MAX_PEERS = 5;

export default function useMultiPeerTimeSync(socket, clientId, peerIds) {
  // Always call hooks in the same order
  const paddedPeerIds = [...peerIds.slice(0, MAX_PEERS)];
  while (paddedPeerIds.length < MAX_PEERS) paddedPeerIds.push(null);

  return paddedPeerIds.map(peerId =>
    peerId ? usePeerTimeSync(socket, clientId, peerId) : null
  );
} 