'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to external socket server (or localhost for dev)
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    socketRef.current = io(socketUrl, {
      path: '/ouyrie/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
    socketRef.current.on('connect', () => setIsConnected(true));
    socketRef.current.on('disconnect', () => setIsConnected(false));
    return () => socketRef.current?.disconnect();
  }, []);

  return { socket: socketRef.current, isConnected };
}
