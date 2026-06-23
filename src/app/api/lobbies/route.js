import { lobbies } from '../../../lib/socketHandler.js';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const lobbiesArray = Array.from(lobbies.values());
  return Response.json(lobbiesArray);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, mode } = body;

    if (!name || !mode) {
      return Response.json({ error: 'Missing name or mode' }, { status: 400 });
    }

    const lobbyId = uuidv4();
    const newLobby = {
      id: lobbyId,
      name,
      mode,
      players: [],
      status: 'waiting'
    };

    lobbies.set(lobbyId, newLobby);

    return Response.json(newLobby);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
