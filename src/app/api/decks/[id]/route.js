import pool from '../../../../lib/db.js';
import { getUserFromRequest } from '../../../../lib/auth.js';

export async function GET(request, { params }) {
  const { id } = params;
  const user = getUserFromRequest(request);

  try {
    const deckResult = await pool.query('SELECT * FROM decks WHERE id = $1', [id]);
    if (deckResult.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    const deck = deckResult.rows[0];
    
    // Check ownership if user is logged in
    if (user && deck.user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const cardsResult = await pool.query(
      `SELECT c.*, dc.quantity, dc.is_sideboard 
       FROM deck_cards dc 
       JOIN cards c ON dc.card_id = c.scryfall_id 
       WHERE dc.deck_id = $1`,
      [id]
    );

    return Response.json({
      deck,
      cards: cardsResult.rows
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
    // Verify ownership
    const deckResult = await pool.query('SELECT user_id FROM decks WHERE id = $1', [id]);
    if (deckResult.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    if (deckResult.rows[0].user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, format } = body;

    const result = await pool.query(
      'UPDATE decks SET name = COALESCE($1, name), format = COALESCE($2, format), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, format, id]
    );

    if (body.cards) {
      await pool.query('DELETE FROM deck_cards WHERE deck_id = $1', [id]);
      for (const [key, entry] of Object.entries(body.cards)) {
        await pool.query(
          'INSERT INTO deck_cards (deck_id, card_id, quantity, is_sideboard) VALUES ($1, $2, $3, $4)',
          [id, entry.cardId || key, entry.quantity, entry.is_sideboard || false]
        );
      }
    }

    return Response.json(result.rows[0]);
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
    // Verify ownership
    const deckResult = await pool.query('SELECT user_id FROM decks WHERE id = $1', [id]);
    if (deckResult.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    if (deckResult.rows[0].user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await pool.query('DELETE FROM decks WHERE id = $1 RETURNING *', [id]);
    return Response.json({ message: 'Deck deleted successfully' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
