CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards (
    scryfall_id TEXT PRIMARY KEY,
    oracle_id TEXT,
    name TEXT NOT NULL,
    mana_cost TEXT,
    cmc REAL,
    type_line TEXT,
    oracle_text TEXT,
    power TEXT,
    toughness TEXT,
    colors TEXT[],
    color_identity TEXT[],
    keywords TEXT[],
    rarity TEXT,
    set_code TEXT,
    image_uri TEXT,
    layout TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(lower(name));
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type_line);
CREATE INDEX IF NOT EXISTS idx_cards_cmc ON cards(cmc);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON cards USING gin(name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    format TEXT DEFAULT 'casual',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
    card_id TEXT REFERENCES cards(scryfall_id),
    quantity INT DEFAULT 1 CHECK(quantity > 0),
    PRIMARY KEY(deck_id, card_id)
);
