import usePeerTimeSync from './usePeerTimeSync';

// Max number of peers to support for stable hook order
const MAX_PEERS = 5;

export default function useMultiPeerTimeSync(socket, clientId, peerIds) {
  return [
    usePeerTimeSync(socket, clientId, peerIds[0] || null),
    usePeerTimeSync(socket, clientId, peerIds[1] || null),
    usePeerTimeSync(socket, clientId, peerIds[2] || null),
    usePeerTimeSync(socket, clientId, peerIds[3] || null),
    usePeerTimeSync(socket, clientId, peerIds[4] || null),
  ];
} 