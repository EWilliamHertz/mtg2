import pool from '../../../../../lib/db.js';
import { getUserFromRequest } from '../../../../../lib/auth.js';

export async function POST(request, { params }) {
  const { id } = params; // deck_id
  const user = getUserFromRequest(request);
  
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  try {
    // Verify deck ownership
    const deckResult = await pool.query('SELECT user_id FROM decks WHERE id = $1', [id]);
    if (deckResult.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    if (deckResult.rows[0].user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { cardId, quantity, is_sideboard = false } = body;

    if (!cardId || quantity === undefined) {
      return Response.json({ error: 'Missing cardId or quantity' }, { status: 400 });
    }

    if (quantity === 0) {
      await pool.query('DELETE FROM deck_cards WHERE deck_id = $1 AND card_id = $2 AND is_sideboard = $3', [id, cardId, is_sideboard]);
    } else {
      await pool.query(
        `INSERT INTO deck_cards (deck_id, card_id, quantity, is_sideboard) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (deck_id, card_id) 
         DO UPDATE SET quantity = EXCLUDED.quantity`,
        [id, cardId, quantity, is_sideboard]
      );
    }
    
    await pool.query('UPDATE decks SET updated_at = NOW() WHERE id = $1', [id]);

    return Response.json({ message: 'Deck updated successfully' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
