import pool from '../../../../lib/db.js';

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const deckResult = await pool.query('SELECT * FROM decks WHERE id = $1', [id]);
    if (deckResult.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    
    const deck = deckResult.rows[0];

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
  try {
    const body = await request.json();
    const { name, format } = body;

    const result = await pool.query(
      'UPDATE decks SET name = COALESCE($1, name), format = COALESCE($2, format), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, format, id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }

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

  try {
    const result = await pool.query('DELETE FROM decks WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return Response.json({ error: 'Deck not found' }, { status: 404 });
    }
    return Response.json({ message: 'Deck deleted successfully' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
