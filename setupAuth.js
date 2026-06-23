import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  const hash = await bcrypt.hash('Yb07tw44!', 10);
  await pool.query(`
    INSERT INTO users (username, password_hash)
    VALUES ('EWACH', $1)
    ON CONFLICT (username) DO NOTHING;
  `, [hash]);

  console.log('Users table created and EWACH added.');
  process.exit(0);
}
run();
