import pool from '../../../lib/db.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const colors = searchParams.get('colors');
  const type = searchParams.get('type');
  const cmc_min = searchParams.get('cmc_min');
  const cmc_max = searchParams.get('cmc_max');
  const rarity = searchParams.get('rarity');
  
  const page = parseInt(searchParams.get('page') || '1', 10);
  let limit = parseInt(searchParams.get('limit') || '20', 10);
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;

  let whereClauses = [];
  let params = [];
  let paramCount = 1;

  const exact = searchParams.get('exact') === 'true';

  if (q) {
    if (exact) {
      whereClauses.push(`name ILIKE $${paramCount}`);
      params.push(q);
    } else {
      whereClauses.push(`name ILIKE $${paramCount}`);
      params.push(`%${q}%`);
    }
    paramCount++;
  }
  if (colors) {
    whereClauses.push(`colors::text ILIKE $${paramCount}`);
    params.push(`%${colors}%`);
    paramCount++;
  }
  if (type) {
    whereClauses.push(`type_line ILIKE $${paramCount}`);
    params.push(`%${type}%`);
    paramCount++;
  }
  if (cmc_min !== null) {
    whereClauses.push(`cmc >= $${paramCount}`);
    params.push(cmc_min);
    paramCount++;
  }
  if (cmc_max !== null) {
    whereClauses.push(`cmc <= $${paramCount}`);
    params.push(cmc_max);
    paramCount++;
  }
  if (rarity) {
    whereClauses.push(`rarity = $${paramCount}`);
    params.push(rarity);
    paramCount++;
  }

  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const countQuery = `SELECT count(*) FROM cards ${whereString}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `SELECT * FROM cards ${whereString} ORDER BY name ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    const dataParams = [...params, limit, offset];
    const cardsResult = await pool.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      cards: cardsResult.rows,
      total,
      page,
      totalPages
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
