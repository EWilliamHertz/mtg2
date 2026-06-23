import pool from '../../../../lib/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password || username.length < 3 || password.length < 6) {
      return Response.json({ error: 'Invalid username or password' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    
    let res;
    try {
      res = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [username, hash]
      );
    } catch (dbError) {
      if (dbError.code === '23505') { // unique violation
        return Response.json({ error: 'Username already taken' }, { status: 409 });
      }
      throw dbError;
    }

    const user = res.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    const response = Response.json({ success: true, username: user.username });
    response.headers.set('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`);
    
    return response;
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
