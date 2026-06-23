import pool from '../../../../lib/db.js';

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const result = await pool.query('SELECT * FROM cards WHERE scryfall_id = $1', [id]);
    if (result.rows.length === 0) {
      return Response.json({ error: 'Card not found' }, { status: 404 });
    }
    return Response.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
