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
    isFetchLand: false,
    fetchTypes: [],
    etbEffects: [],    // Stores effects that happen when a permanent lands
    spellEffects: []   // Stores effects that happen when an instant/sorcery resolves
  };

  // 1. Enters Tapped
  if (/enters the battlefield tapped/i.test(oracle)) {
    card.engineMetadata.entersTapped = true;
  }

  // 2. Generic ETB Parser
  // Looks for "enters the battlefield, [do something]." or "enters the battlefield. [Do something]"
  const etbRegex = /enters the battlefield[,.]\s*(.*?)(?:\.|$)/i;
  const etbMatch = oracle.match(etbRegex);
  if (etbMatch) {
    const effectText = etbMatch[1];
    
    // Parse Draw Card
    if (/draw a card/i.test(effectText)) {
      card.engineMetadata.etbEffects.push({ type: 'DRAW', amount: 1 });
    }
    
    // Parse Gain Life
    const lifeMatch = effectText.match(/gain (\d+) life/i);
    if (lifeMatch) {
      card.engineMetadata.etbEffects.push({ type: 'GAIN_LIFE', amount: parseInt(lifeMatch[1], 10) });
    }

    
    // Parse Surveil
    const surveilMatch = effectText.match(/surveil (\d+)/i);
    if (surveilMatch) {
      card.engineMetadata.etbEffects.push({ type: 'SURVEIL', amount: parseInt(surveilMatch[1], 10) });
    }

    // Parse Mill
    const millMatch = effectText.match(/mills? (\d+) cards?/i);
    if (millMatch) {
      card.engineMetadata.etbEffects.push({ type: 'MILL', amount: parseInt(millMatch[1], 10) });
    }

    // Parse Scry
    const scryMatch = effectText.match(/scry (\d+)/i);
    if (scryMatch) {
      card.engineMetadata.etbEffects.push({ type: 'SCRY', amount: parseInt(scryMatch[1], 10) });
    }
  }

  // 3. Instant & Sorcery Parser
  if (typeLine.includes('Instant') || typeLine.includes('Sorcery')) {
    
    // Parse Damage (e.g., "Lightning Bolt deals 3 damage to any target")
    const damageMatch = oracle.match(/deals (\d+) damage to (any target|target creature|target player)/i);
    if (damageMatch) {
      card.engineMetadata.spellEffects.push({ 
        type: 'DEAL_DAMAGE', 
        amount: parseInt(damageMatch[1], 10),
        targetType: damageMatch[2].toLowerCase()
      });
    }

    // Parse Draw Cards (e.g., "Draw two cards", "Draw a card")
    if (/draw a card/i.test(oracle)) {
      card.engineMetadata.spellEffects.push({ type: 'DRAW', amount: 1 });
    } else {
      // Very basic text-to-number mapping for MTG terminology
      const drawMatch = oracle.match(/Draw (two|three|four) cards/i);
      if (drawMatch) {
        const textToNum = { 'two': 2, 'three': 3, 'four': 4 };
        card.engineMetadata.spellEffects.push({ type: 'DRAW', amount: textToNum[drawMatch[1].toLowerCase()] });
      }
    }
    
    
    // Parse Destroy (e.g., "Destroy target creature")
    const destroyMatch = oracle.match(/Destroy target (creature|artifact|enchantment|land)/i);
    if (destroyMatch) {
      card.engineMetadata.spellEffects.push({
        type: 'DESTROY',
        targetType: destroyMatch[1].toLowerCase()
      });
    }

    // Parse Mill
    const millMatch = oracle.match(/mills? (\d+) cards?/i);
    if (millMatch) {
      card.engineMetadata.spellEffects.push({ type: 'MILL', amount: parseInt(millMatch[1], 10) });
    }

    // Parse Scry
    const scryMatch = oracle.match(/scry (\d+)/i);
    if (scryMatch) {
      card.engineMetadata.spellEffects.push({ type: 'SCRY', amount: parseInt(scryMatch[1], 10) });
    }
  }

  // 4. Mana Abilities
  if (oracle.includes('{T}: Add')) {
    if (oracle.includes('{W}')) card.engineMetadata.manaAbilities.push('W');
    if (oracle.includes('{U}')) card.engineMetadata.manaAbilities.push('U');
    if (oracle.includes('{B}')) card.engineMetadata.manaAbilities.push('B');
    if (oracle.includes('{R}')) card.engineMetadata.manaAbilities.push('R');
    if (oracle.includes('{G}')) card.engineMetadata.manaAbilities.push('G');
    if (oracle.includes('{C}')) card.engineMetadata.manaAbilities.push('C');
  }

  // Basic Land Fallback
  if (typeLine.includes('Basic Land')) {
    if (typeLine.includes('Plains')) card.engineMetadata.manaAbilities.push('W');
    if (typeLine.includes('Island')) card.engineMetadata.manaAbilities.push('U');
    if (typeLine.includes('Swamp')) card.engineMetadata.manaAbilities.push('B');
    if (typeLine.includes('Mountain')) card.engineMetadata.manaAbilities.push('R');
    if (typeLine.includes('Forest')) card.engineMetadata.manaAbilities.push('G');
  }
  card.engineMetadata.manaAbilities = [...new Set(card.engineMetadata.manaAbilities)];

  // 5. Fetch Lands
  const fetchMatch = oracle.match(/Search your library for an? (.*?) card/i);
  if (fetchMatch && oracle.includes('Pay 1 life') && oracle.includes('Sacrifice')) {
    card.engineMetadata.isFetchLand = true;
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