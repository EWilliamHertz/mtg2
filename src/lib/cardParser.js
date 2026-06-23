// src/lib/cardParser.js

/**
 * Parses raw card data from NeonDB and attaches engine-readable properties.
 */
export function parseCardData(rawCard) {
  const card = { ...rawCard };
  const oracle = card.oracle_text || '';
  const typeLine = card.type_line || '';

  card.engineMetadata = {
    entersTapped: false,
    manaAbilities: [],
    surveilWhenETB: 0,
    isFetchLand: false,
    fetchTypes: []
  };

  // 1. Enters Tapped
  // Matches "enters the battlefield tapped"
  if (/enters the battlefield tapped/i.test(oracle)) {
    card.engineMetadata.entersTapped = true;
  }
  
  // 2. Surveil triggers (e.g., "Surveil 1")
  const surveilMatch = oracle.match(/Surveil (\d+)/i);
  if (surveilMatch) {
    card.engineMetadata.surveilWhenETB = parseInt(surveilMatch[1], 10);
  }

  // 3. Mana Abilities
  // Detects {T}: Add {W}, {U}, etc.
  if (oracle.includes('{T}: Add')) {
    if (oracle.includes('{W}')) card.engineMetadata.manaAbilities.push('W');
    if (oracle.includes('{U}')) card.engineMetadata.manaAbilities.push('U');
    if (oracle.includes('{B}')) card.engineMetadata.manaAbilities.push('B');
    if (oracle.includes('{R}')) card.engineMetadata.manaAbilities.push('R');
    if (oracle.includes('{G}')) card.engineMetadata.manaAbilities.push('G');
    if (oracle.includes('{C}')) card.engineMetadata.manaAbilities.push('C');
    if (/Add one mana of any color/i.test(oracle)) {
      card.engineMetadata.manaAbilities = ['W', 'U', 'B', 'R', 'G', 'C'];
    }
  }

  // Fallback for basic lands that might not explicitly have "{T}: Add" in their DB oracle_text
  if (typeLine.includes('Basic Land')) {
    if (typeLine.includes('Plains')) card.engineMetadata.manaAbilities.push('W');
    if (typeLine.includes('Island')) card.engineMetadata.manaAbilities.push('U');
    if (typeLine.includes('Swamp')) card.engineMetadata.manaAbilities.push('B');
    if (typeLine.includes('Mountain')) card.engineMetadata.manaAbilities.push('R');
    if (typeLine.includes('Forest')) card.engineMetadata.manaAbilities.push('G');
  }

  // Deduplicate mana abilities
  card.engineMetadata.manaAbilities = [...new Set(card.engineMetadata.manaAbilities)];

  // 4. Fetch Lands
  // Matches "Search your library for an Island or Swamp card"
  const fetchMatch = oracle.match(/Search your library for an? (.*?) card/i);
  if (fetchMatch && oracle.includes('Pay 1 life') && oracle.includes('Sacrifice')) {
    card.engineMetadata.isFetchLand = true;
    
    // Extract basic land types from the matched string
    const typesStr = fetchMatch[1];
    const allowedTypes = [];
    if (typesStr.includes('Plains')) allowedTypes.push('Plains');
    if (typesStr.includes('Island')) allowedTypes.push('Island');
    if (typesStr.includes('Swamp')) allowedTypes.push('Swamp');
    if (typesStr.includes('Mountain')) allowedTypes.push('Mountain');
    if (typesStr.includes('Forest')) allowedTypes.push('Forest');
    
    card.engineMetadata.fetchTypes = allowedTypes;
  }

  return card;
}