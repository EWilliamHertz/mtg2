/**
 * Standalone Socket.IO Server
 * This runs separately from the Next.js frontend
 * Deploy to Railway, Render, or similar
 */

import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Check for required env vars before importing handlers
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set');
  process.exit(1);
}

console.log('✓ Environment variables loaded');
console.log(`✓ DATABASE_URL: ${process.env.DATABASE_URL.substring(0, 50)}...`);

import { registerSocketHandlers } from './src/lib/socketHandler.js';

const port = process.env.PORT || process.env.SOCKET_PORT || 3001;
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

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port }));
  }
});

server.listen(port, () => {
  console.log(`✓ Socket.IO server running on port ${port}`);
  console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
});
