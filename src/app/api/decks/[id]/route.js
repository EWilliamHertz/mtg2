import prisma from '../../../../lib/db.js';
import { getUserFromRequest } from '../../../../lib/auth.js';

export async function GET(request, { params }) {
  const { id } = params;
  const user = getUserFromRequest(request);

  try {
    const deck = await prisma.deck.findUnique({
      where: { id }
    });
    if (!deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    // Check ownership if user is logged in
    if (user && deck.ownerId !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const cardsArray = [];
    const parsedCards = typeof deck.cards === 'string' ? JSON.parse(deck.cards) : (deck.cards || []);

    for (const entry of parsedCards) {
      const cardRef = await prisma.cardReference.findUnique({
        where: { apiId: entry.cardId }
      });
      if (cardRef) {
        cardsArray.push({
          ...cardRef.apiPayload,
          scryfall_id: cardRef.apiPayload.id,
          quantity: entry.quantity,
          is_sideboard: entry.is_sideboard
        });
      }
    }

    return Response.json({
      deck,
      cards: cardsArray
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = params;
  const user = getUserFromRequest(request);
  
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    if (deck.ownerId !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, format } = body;

    const cards = body.cards ? Object.values(body.cards).map((entry) => ({
      cardId: entry.cardId || entry.id,
      quantity: entry.quantity,
      is_sideboard: entry.is_sideboard || false
    })) : undefined;

    const updatedDeck = await prisma.deck.update({
      where: { id },
      data: {
        name: name || undefined,
        cards: cards !== undefined ? cards : undefined
      }
    });

    return Response.json(updatedDeck);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = params;
  const user = getUserFromRequest(request);
  
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    if (deck.ownerId !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.deck.delete({ where: { id } });
    return Response.json({ message: 'Deck deleted successfully' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
