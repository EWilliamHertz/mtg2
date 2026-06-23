import { GameEngine } from './gameEngine.js';
import pool from './db.js';
import { v4 as uuidv4 } from 'uuid';

export const lobbies = new Map();
const activeGames = new Map();
const playerSockets = new Map(); // socketId -> {playerId, gameId}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // create-lobby: { name, mode, playerName, deckId }
    socket.on('create-lobby', ({ name, mode, playerName, deckId }) => {
      const lobbyId = uuidv4();
      const playerId = uuidv4();
      
      const lobby = {
        id: lobbyId,
        name,
        mode,
        players: [{
          id: playerId,
          name: playerName,
          deckId,
          socketId: socket.id,
          ready: false
        }],
        status: 'waiting'
      };
      
      lobbies.set(lobbyId, lobby);
      socket.join(lobbyId);
      socket.emit('lobby-created', { lobbyId, playerId });
      io.to(lobbyId).emit('lobby-update', lobby);
    });

    // join-lobby: { lobbyId, playerName, deckId }
    socket.on('join-lobby', ({ lobbyId, playerName, deckId }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit('error', 'Lobby not found');
        return;
      }
      if (lobby.status !== 'waiting') {
        socket.emit('error', 'Lobby is no longer waiting');
        return;
      }
      
      const playerId = uuidv4();
      const player = {
        id: playerId,
        name: playerName,
        deckId,
        socketId: socket.id,
        ready: false
      };
      
      lobby.players.push(player);
      socket.join(lobbyId);
      io.to(lobbyId).emit('lobby-update', lobby);
    });

    // leave-lobby: { lobbyId }
    socket.on('leave-lobby', ({ lobbyId }) => {
      const lobby = lobbies.get(lobbyId);
      if (lobby) {
        lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
        socket.leave(lobbyId);
        
        if (lobby.players.length === 0) {
          lobbies.delete(lobbyId);
        } else {
          io.to(lobbyId).emit('lobby-update', lobby);
        }
      }
    });

    // ready: { lobbyId }
    socket.on('ready', async ({ lobbyId }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.socketId === socket.id);
      if (player) {
        player.ready = true;
        io.to(lobbyId).emit('lobby-update', lobby);

        const allReady = lobby.players.every(p => p.ready);
        const requiredPlayers = lobby.mode === '1v0' ? 1 : 2;
        if (allReady && lobby.players.length >= requiredPlayers) {
          lobby.status = 'in-game';
          io.to(lobbyId).emit('lobby-update', lobby);
          
          try {
            for (const p of lobby.players) {
              const res = await pool.query(
                `SELECT c.*, dc.quantity, dc.is_sideboard 
                 FROM deck_cards dc 
                 JOIN cards c ON dc.card_id = c.scryfall_id 
                 WHERE dc.deck_id = $1`,
                [p.deckId]
              );
              
              const mainDeck = [];
              const sideboard = [];
              for (const row of res.rows) {
                for (let i = 0; i < row.quantity; i++) {
                  if (row.is_sideboard) sideboard.push(row);
                  else mainDeck.push(row);
                }
              }
              p.deck = mainDeck;
              p.sideboard = sideboard;
            }

            const engine = new GameEngine(lobby.mode, lobby.players, true); // true = isBO3
            engine.initGame();
            const gameId = uuidv4();
            activeGames.set(gameId, engine);
            lobby.gameId = gameId;

            for (const p of lobby.players) {
              playerSockets.set(p.socketId, { playerId: p.id, gameId });
              const pSocket = io.sockets.sockets.get(p.socketId);
              if (pSocket) {
                pSocket.join(gameId);
                pSocket.emit('game-start', { gameId, playerId: p.id });
                pSocket.emit('game-update', engine.getState(p.id));
              }
            }
          } catch (error) {
            console.error('Failed to start game:', error);
            lobby.status = 'waiting';
            lobby.players.forEach(p => p.ready = false);
            io.to(lobbyId).emit('lobby-update', lobby);
          }
        }
      }
    });

    // ========== FIX #1: ADD MISSING join-game HANDLER ==========
    // join-game: { gameId, playerId }
    socket.on('join-game', ({ gameId, playerId }) => {
      const engine = activeGames.get(gameId);
      if (engine) {
        const player = engine.players.find(p => p.id === playerId);
        if (player) {
          player.socketId = socket.id;
          playerSockets.set(socket.id, { playerId, gameId });
          socket.join(gameId);
          // Send both the initial game-start and current game state
          socket.emit('game-start', { gameId, playerId });
          socket.emit('game-update', engine.getState(playerId));
        } else {
          socket.emit('error', 'Player not found in game');
        }
      } else {
        socket.emit('error', 'Game not found');
      }
    });

    // ========== FIX #2: CORRECT game-action HANDLER ==========
    // game-action: { gameId, playerId, type, ...payload }
    socket.on('game-action', ({ gameId, playerId, type, ...payload }) => {
      const info = playerSockets.get(socket.id);
      if (!info) return;
      
      const engine = activeGames.get(gameId);
      if (engine) {
        try {
          const success = engine.handleAction(playerId, { type, ...payload });
          if (success) {
            for (const p of engine.players) {
              const pSocket = io.sockets.sockets.get(p.socketId);
              if (pSocket) {
                pSocket.emit('game-update', engine.getState(p.id));
              }
            }
            if (engine.isGameOver()) {
              io.to(gameId).emit('game-over');
              activeGames.delete(gameId);
              for (const [id, lobby] of lobbies.entries()) {
                if (lobby.gameId === gameId) {
                  lobbies.delete(id);
                  break;
                }
              }
            }
          }
        } catch (error) {
          socket.emit('error', error.message);
        }
      }
    });

    // rejoin-game: { gameId, playerId }
    socket.on('rejoin-game', ({ gameId, playerId }) => {
      const engine = activeGames.get(gameId);
      if (engine) {
        const player = engine.players.find(p => p.id === playerId);
        if (player) {
          player.socketId = socket.id;
          player.disconnected = false;
          if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
            player.disconnectTimeout = null;
          }
          playerSockets.set(socket.id, { playerId, gameId });
          socket.join(gameId);
          socket.emit('game-update', engine.getState(playerId));
        }
      } else {
        socket.emit('error', 'Game not found');
      }
    });

    // chat-message: { gameId, message }
    socket.on('chat-message', ({ gameId, message }) => {
      io.to(gameId).emit('chat-message', { gameId, message, sender: socket.id });
    });

    // disconnect
    socket.on('disconnect', () => {
      const info = playerSockets.get(socket.id);
      if (info) {
        const { playerId, gameId } = info;
        const engine = activeGames.get(gameId);
        if (engine) {
          const player = engine.players.find(p => p.id === playerId);
          if (player) {
            player.disconnected = true;
            player.disconnectTimeout = setTimeout(() => {
              if (activeGames.has(gameId)) {
                engine.handleAction(playerId, { type: 'forfeit' });
                io.to(gameId).emit('game-over', { reason: 'player_disconnected' });
                activeGames.delete(gameId);
              }
            }, 5 * 60 * 1000);
          }
        }
        playerSockets.delete(socket.id);
      }
      
      for (const [lobbyId, lobby] of lobbies.entries()) {
        lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
        if (lobby.players.length === 0 && lobby.status === 'waiting') {
          lobbies.delete(lobbyId);
        } else if (lobby.status === 'waiting') {
          io.to(lobbyId).emit('lobby-update', lobby);
        }
      }
    });
  });
}
