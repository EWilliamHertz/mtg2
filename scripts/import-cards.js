import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('Fetching bulk data info from Scryfall...');
    const headers = { 'User-Agent': 'MTGOnline/1.0', 'Accept': 'application/json' };
    const bulkDataResponse = await fetch('https://api.scryfall.com/bulk-data', { headers });
    const bulkData = await bulkDataResponse.json();

    const oracleCardsEntry = bulkData.data.find(d => d.type === 'oracle_cards');
    if (!oracleCardsEntry) {
      throw new Error('Could not find oracle_cards bulk data entry.');
    }

    console.log(`Downloading full JSON from ${oracleCardsEntry.download_uri}... (this might take a minute)`);
    const dataResponse = await fetch(oracleCardsEntry.download_uri, { headers });
    const cards = await dataResponse.json();
    console.log(`Downloaded ${cards.length} cards.`);

    let count = 0;
    let skipped = 0;
    const batchSize = 500;
    let batch = [];

    for (const card of cards) {
      let image_uri = card.image_uris?.normal;
      if (!image_uri && card.card_faces && card.card_faces.length > 0) {
        image_uri = card.card_faces[0]?.image_uris?.normal;
      }

      if (!image_uri) {
        skipped++;
        continue;
      }

      batch.push({
        scryfall_id: card.id,
        oracle_id: card.oracle_id,
        name: card.name,
        mana_cost: card.mana_cost || '',
        cmc: card.cmc || 0,
        type_line: card.type_line || '',
        oracle_text: card.oracle_text || '',
        power: card.power || '',
        toughness: card.toughness || '',
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        keywords: card.keywords || [],
        rarity: card.rarity || '',
        set_code: card.set || '',
        image_uri,
        layout: card.layout || ''
      });

      if (batch.length >= batchSize) {
        await insertBatch(batch);
        count += batch.length;
        if (count % 1000 === 0) {
          console.log(`Imported ${count} cards...`);
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      await insertBatch(batch);
      count += batch.length;
    }

    console.log(`Import complete! Inserted/Updated: ${count}, Skipped (no image): ${skipped}`);
  } catch (error) {
    console.error('Error importing cards:', error);
  } finally {
    await pool.end();
  }
}

async function insertBatch(batch) {
  if (batch.length === 0) return;

  const values = [];
  const queryPlaceholders = [];
  let paramIndex = 1;

  for (const card of batch) {
    queryPlaceholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
    values.push(
      card.scryfall_id,
      card.oracle_id,
      card.name,
      card.mana_cost,
      card.cmc,
      card.type_line,
      card.oracle_text,
      card.power,
      card.toughness,
      card.colors,
      card.color_identity,
      card.keywords,
      card.rarity,
      card.set_code,
      card.image_uri,
      card.layout
    );
  }

  const query = `
    INSERT INTO cards (scryfall_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, power, toughness, colors, color_identity, keywords, rarity, set_code, image_uri, layout)
    VALUES ${queryPlaceholders.join(', ')}
    ON CONFLICT (scryfall_id) DO UPDATE SET
      oracle_id = EXCLUDED.oracle_id,
      name = EXCLUDED.name,
      mana_cost = EXCLUDED.mana_cost,
      cmc = EXCLUDED.cmc,
      type_line = EXCLUDED.type_line,
      oracle_text = EXCLUDED.oracle_text,
      power = EXCLUDED.power,
      toughness = EXCLUDED.toughness,
      colors = EXCLUDED.colors,
      color_identity = EXCLUDED.color_identity,
      keywords = EXCLUDED.keywords,
      rarity = EXCLUDED.rarity,
      set_code = EXCLUDED.set_code,
      image_uri = EXCLUDED.image_uri,
      layout = EXCLUDED.layout
  `;

  await pool.query(query, values);
}

main();
