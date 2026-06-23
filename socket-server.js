/**
 * Standalone Socket.IO Server
 * This runs separately from the Next.js frontend
 * Deploy to Railway, Render, or similar
 */

import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './src/lib/socketHandler.js';

const port = process.env.SOCKET_PORT || 3001;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',');

const server = createServer();

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

registerSocketHandlers(io);

server.listen(port, () => {
  console.log(`✓ Socket.IO server running on port ${port}`);
  console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
});
