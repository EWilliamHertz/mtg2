import pool from '../../../lib/db.js';
import { getUserFromRequest } from '../../../lib/auth.js';

export async function GET(request) {
  try {
    const user = getUserFromRequest(request);
    
    if (!user) {
      // Return empty list if not authenticated
      return Response.json([]);
    }

    const result = await pool.query(
      'SELECT * FROM decks WHERE user_id = $1 ORDER BY updated_at DESC',
      [user.id]
    );
    return Response.json(result.rows);
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

    const result = await pool.query(
      'INSERT INTO decks (user_id, name, format, updated_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [user.id, name, format]
    );

    const deckId = result.rows[0].id;
    const cards = body.cards || {};
    
    // Insert cards
    for (const [key, entry] of Object.entries(cards)) {
      await pool.query(
        'INSERT INTO deck_cards (deck_id, card_id, quantity, is_sideboard) VALUES ($1, $2, $3, $4)',
        [deckId, entry.cardId || key, entry.quantity, entry.is_sideboard || false]
      );
    }

    return Response.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
