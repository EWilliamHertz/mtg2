import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');
socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('create-lobby', {
    name: "Alice's Solo Game",
    mode: '1v0',
    playerName: 'Alice',
    deckId: '205f22f8-b224-4eb0-aaa6-9e8dd4317583'
  });
  
  socket.on('lobby-created', ({ lobbyId }) => {
    console.log('Lobby created!', lobbyId);
    socket.emit('ready', { lobbyId });
  });

  socket.on('game-start', (data) => {
    console.log('Game started!!', data);
    process.exit(0);
  });
  
  socket.on('error', (err) => console.error('Error:', err));
});
