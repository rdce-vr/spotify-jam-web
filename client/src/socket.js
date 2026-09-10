import { io } from 'socket.io-client';

// Highly resilient socket connection for mobile devices and fluctuating networks
export const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity, // Never give up reconnecting on mobile
  reconnectionDelay: 500,         // Attempt reconnect after 500ms
  reconnectionDelayMax: 3000,      // Max delay 3s
  timeout: 10000,
  transports: ['websocket', 'polling']
});
