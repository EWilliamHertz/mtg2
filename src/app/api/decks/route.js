import pool from '../../../lib/db.js';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM decks ORDER BY updated_at DESC');
    return Response.json(result.rows);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, format } = body;
    
    if (!name || !format) {
      return Response.json({ error: 'Missing name or format' }, { status: 400 });
    }

    const result = await pool.query(
      'INSERT INTO decks (name, format, updated_at) VALUES ($1, $2, NOW()) RETURNING *',
      [name, format]
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
