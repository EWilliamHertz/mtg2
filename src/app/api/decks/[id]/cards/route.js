import pool from '../../../../../lib/db.js';

export async function POST(request, { params }) {
  const { id } = params; // deck_id
  
  try {
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
         ON CONFLICT (deck_id, card_id, is_sideboard) 
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
