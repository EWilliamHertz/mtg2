import { GameEngine } from './src/lib/gameEngine.js';
const engine = new GameEngine('1v0', [{ id: '1', name: 'p1', deck: [], sideboard: [] }], true);
console.log(engine.state);
