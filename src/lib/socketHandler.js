import { GameEngine } from './gameEngine.js';
import pool from './db.js';
import { v4 as uuidv4 } from 'uuid';

export const lobbies = new Map();
const activeGames = new Map();
const playerSockets = new Map(); // socketId -> {playerId, gameId}

function broadcastLobbies(io) {
  const lobbyList = Array.from(lobbies.values()).filter(l => l.status !== 'in-game');
  io.emit('lobby-list', lobbyList);
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Send current lobbies to newly connected client
    socket.emit('lobby-list', Array.from(lobbies.values()).filter(l => l.status !== 'in-game'));

    // create-lobby: { name, mode, playerName, deckId }
    socket.on('create-lobby', ({ name, mode, playerName, deckId }) => {
      const lobbyId = uuidv4();
      const playerId = uuidv4();
      
      const lobby = {
        id: lobbyId,
        name,
        mode,
        hostName: playerName,  // Track host name
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
      console.log(`✓ Lobby created: ${lobbyId} (${playerName})`);
      socket.emit('lobby-created', { lobbyId, playerId, lobby });
      broadcastLobbies(io);  // Broadcast updated list to all clients
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
      
      const maxPlayers = lobby.mode === '1v1' ? 2 : 1;
      if (lobby.players.length >= maxPlayers) {
        socket.emit('error', 'Lobby is full');
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
      console.log(`✓ Player ${playerName} joined lobby ${lobbyId}`);
      io.to(lobbyId).emit('lobby-update', lobby);
      broadcastLobbies(io);  // Broadcast updated list to all clients
    });

    // leave-lobby: { lobbyId }
    socket.on('leave-lobby', ({ lobbyId }) => {
      const lobby = lobbies.get(lobbyId);
      if (lobby) {
        const leftPlayer = lobby.players.find(p => p.socketId === socket.id);
        lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
        socket.leave(lobbyId);
        
        if (lobby.players.length === 0) {
          lobbies.delete(lobbyId);
          console.log(`✓ Lobby ${lobbyId} deleted (empty)`);
        } else {
          console.log(`✓ Player ${leftPlayer?.name} left lobby ${lobbyId}`);
          io.to(lobbyId).emit('lobby-update', lobby);
        }
        broadcastLobbies(io);  // Broadcast updated list to all clients
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
          broadcastLobbies(io);  // Remove from lobby list for other players
          
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
                const cardData = {
                  scryfall_id: row.scryfall_id,
                  card_id: row.card_id,
                  name: row.name,
                  mana_cost: row.mana_cost,
                  cmc: row.cmc,
                  type_line: row.type_line,
                  oracle_text: row.oracle_text,
                  power: row.power,
                  toughness: row.toughness,
                  colors: row.colors,
                  color_identity: row.color_identity,
                  keywords: row.keywords,
                  rarity: row.rarity,
                  image_uri: row.image_uri,
                  quantity: row.quantity
                };
                for (let i = 0; i < row.quantity; i++) {
                  if (row.is_sideboard) sideboard.push(cardData);
                  else mainDeck.push(cardData);
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
                const state = engine.getState(p.id);
                pSocket.emit('game-start', { gameId, playerId: p.id, state });
                pSocket.emit('game-update', state);
              }
            }
          } catch (error) {
            console.error('Failed to start game:', error);
            lobby.status = 'waiting';
            lobby.players.forEach(p => p.ready = false);
            io.to(lobbyId).emit('lobby-update', lobby);
            io.to(lobbyId).emit('error', 'Failed to start game: ' + error.message);
          }
        }
      }
    });

    // ========== FIX #1: ADD MISSING join-game HANDLER ==========
    // join-game: { gameId, playerId }
    socket.on('join-game', ({ gameId, playerId }) => {
      const engine = activeGames.get(gameId);
      if (engine) {
        const player = engine.state.players.find(p => p.id === playerId);
        if (player) {
          player.socketId = socket.id;
          playerSockets.set(socket.id, { playerId, gameId });
          socket.join(gameId);
          console.log(`✓ Player ${playerId} joined game ${gameId} on socket ${socket.id.substring(0, 8)}`);
          // Send both the initial game-start and current game state
          const state = engine.getState(playerId);
          socket.emit('game-start', { gameId, playerId, state });
          socket.emit('game-update', state);
        } else {
          console.warn(`❌ Player ${playerId} not found in game ${gameId}`);
          socket.emit('error', 'Player not found in game');
        }
      } else {
        console.warn(`❌ Game ${gameId} not found in activeGames`);
        socket.emit('error', 'Game not found');
      }
    });

    // ========== FIX #2: CORRECT game-action HANDLER ==========
    // game-action: { gameId, playerId, type, ...payload }
    socket.on('game-action', (data) => {
      const gameId = data.gameId;
      const playerId = data.playerId;
      const type = data.type;
      
      const info = playerSockets.get(socket.id);
      if (!info) {
        console.warn(`⚠️  Game action from unknown socket: ${socket.id} for ${type}`);
        socket.emit('error', 'Socket not registered. Rejoin game.');
        return;
      }
      
      const engine = activeGames.get(gameId);
      if (!engine) {
        console.warn(`⚠️  Game action for unknown game: ${gameId}`);
        socket.emit('error', 'Game not found');
        return;
      }

      try {
        const result = engine.handleAction(playerId, data);
        
        // Check if action was successful (result is { success: true/false, ... })
        if (result && result.success === true) {
          console.log(`✓ Action ${type} succeeded for player ${playerId}`);
          for (const p of engine.state.players) {
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
        } else {
          // Action failed
          const errorMsg = result?.error || `Action ${type} failed`;
          console.warn(`❌ Action failed: ${errorMsg}`);
          socket.emit('error', errorMsg);
        }
      } catch (error) {
        console.error(`💥 Error handling action ${type}:`, error.message);
        socket.emit('error', error.message);
      }
    });

    // rejoin-game: { gameId, playerId }
    socket.on('rejoin-game', ({ gameId, playerId }) => {
      const engine = activeGames.get(gameId);
      if (engine) {
        const player = engine.state.players.find(p => p.id === playerId);
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
          const player = engine.state.players.find(p => p.id === playerId);
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