import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');
socket.on('connect', () => {
  socket.emit('create-lobby', { name: 'Test', mode: '1v0', playerName: 'Alice', deckId: '123' });
});
socket.on('lobby-update', (lobby) => {
  if (lobby.name === 'Test') {
    socket.emit('ready', { lobbyId: lobby.id });
  }
});
socket.on('game-start', (data) => {
  console.log('Game started!', data);
  socket.emit('game-action', { gameId: data.gameId, playerId: data.playerId, type: 'pass-priority' });
});
socket.on('error', console.error);
