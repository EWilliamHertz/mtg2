import pool from '../../../lib/db.js';

export async function GET() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM cards');
    return Response.json({ cardCount: parseInt(res.rows[0].count, 10) });
  } catch (error) {
    return Response.json({ cardCount: 0 });
  }
}
