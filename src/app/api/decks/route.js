import prisma from '../../../lib/db.js';
import { getUserFromRequest } from '../../../lib/auth.js';

export async function GET(request) {
  try {
    const user = getUserFromRequest(request);
    
    if (!user) {
      return Response.json([]);
    }

    const decks = await prisma.deck.findMany({
      where: { ownerId: user.id, game: 'MTG' },
    });
    return Response.json(decks);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = getUserFromRequest(request);
    
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, format } = body;
    
    if (!name || !format) {
      return Response.json({ error: 'Missing name or format' }, { status: 400 });
    }

    const cards = body.cards ? Object.values(body.cards).map((entry) => ({
      cardId: entry.cardId || entry.id, // Depending on frontend mapping
      quantity: entry.quantity,
      is_sideboard: entry.is_sideboard || false
    })) : [];

    const newDeck = await prisma.deck.create({
      data: {
        name,
        game: 'MTG',
        ownerId: user.id,
        cards: cards
      }
    });

    return Response.json(newDeck);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
