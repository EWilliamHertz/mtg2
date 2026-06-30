// src/lib/cardParser.js
// ============================================================
// Declarative rules engine – card parser
// Phases 1-4: targeting, stack, Ponder/Brainstorm,
//             alternate costs, upkeep triggers, activated abilities
// ============================================================

// ── helpers ──────────────────────────────────────────────────
function parseNumber(word) {
  const map = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
                six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const n = parseInt(word, 10);
  if (!isNaN(n)) return n;
  return map[word?.toLowerCase()] ?? 1;
}

// Determine which target types are valid given a phrase
function resolveTargetTypes(phrase) {
  phrase = phrase.toLowerCase();
  if (/any target/.test(phrase))
    return ['creature', 'player', 'planeswalker'];
  if (/target player/.test(phrase))
    return ['player'];
  if (/target opponent/.test(phrase))
    return ['player'];
  if (/target creature or player/.test(phrase))
    return ['creature', 'player'];
  if (/target creature or planeswalker/.test(phrase))
    return ['creature', 'planeswalker'];
  if (/target artifact/.test(phrase))
    return ['artifact'];
  if (/target enchantment/.test(phrase))
    return ['enchantment'];
  if (/target land/.test(phrase))
    return ['land'];
  if (/target permanent/.test(phrase))
    return ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'];
  if (/target creature/.test(phrase))
    return ['creature'];
  return ['creature', 'player', 'planeswalker']; // safe fallback
}

// ── main export ───────────────────────────────────────────────
export function parseCardData(rawCard) {
  const card = { ...rawCard };
  const oracle = card.oracle_text || '';
  const typeLine = card.type_line || '';
  const name = card.name || '';

  card.engineMetadata = {
    // ---- basics ----
    entersTapped: false,
    manaAbilities: [],
    isFetchLand: false,
    fetchTypes: [],
    // ---- effects ----
    etbEffects: [],
    spellEffects: [],
    // ---- targeting ----
    requiresTarget: false,
    validTargets: [],
    // ---- alternate costs ----
    alternateCosts: [],
    // ---- upkeep triggers ----
    upkeepTriggers: [],
    // ---- activated abilities (non-mana) ----
    activatedAbilities: [],
    // ---- end-step triggers (delayed) ----
    endStepTriggers: [],
  };

  const meta = card.engineMetadata;

  // ── 1. Enters Tapped ────────────────────────────────────────
  if (/enters( the battlefield)? tapped/i.test(oracle)) {
    meta.entersTapped = true;
  }

  // ── 2. ETB Effects ──────────────────────────────────────────
  // Matches "enters the battlefield, <effect>." or "enters the battlefield. <Effect>"
  const etbRegex = /enters the battlefield[,.]\s*(.*?)(?:\.|$)/gi;
  let etbMatch;
  while ((etbMatch = etbRegex.exec(oracle)) !== null) {
    const effectText = etbMatch[1];

    if (/draw a card/i.test(effectText))
      meta.etbEffects.push({ type: 'DRAW', amount: 1 });

    const drawManyMatch = effectText.match(/draw (two|three|four|\d+) cards?/i);
    if (drawManyMatch)
      meta.etbEffects.push({ type: 'DRAW', amount: parseNumber(drawManyMatch[1]) });

    const lifeMatch = effectText.match(/gain (\d+|a|one|two|three) life/i);
    if (lifeMatch)
      meta.etbEffects.push({ type: 'GAIN_LIFE', amount: parseNumber(lifeMatch[1]) });

    const surveilMatch = effectText.match(/surveil (\d+)/i);
    if (surveilMatch)
      meta.etbEffects.push({ type: 'SURVEIL', amount: parseInt(surveilMatch[1], 10) });
    const millMatch = effectText.match(/mills? (\d+) cards?/i);
    if (millMatch)
      meta.etbEffects.push({ type: 'MILL', amount: parseInt(millMatch[1], 10) });

    const scryMatch = effectText.match(/scry (\d+)/i);
    if (scryMatch)
      meta.etbEffects.push({ type: 'SCRY', amount: parseInt(scryMatch[1], 10) });

    const createTokenMatch = effectText.match(/create (?:a|an|one|two|three|\d+) (\d+\/\d+) (\w+)(?:\s+\w+)? creature token/i);
    if (createTokenMatch) {
      const [pw, tgh] = createTokenMatch[1].split('/');
      meta.etbEffects.push({
        type: 'CREATE_TOKEN',
        power: pw, toughness: tgh, subtype: createTokenMatch[2]
      });
    }
  }

  // Special case: Surveil Lands ("enters the battlefield tapped. When it does, surveil X")
  const surveilLandMatch = oracle.match(/enters the battlefield tapped\.\s*When it does,\s*surveil (\d+)/i);
  if (surveilLandMatch) {
    meta.etbEffects.push({ type: 'SURVEIL', amount: parseInt(surveilLandMatch[1], 10) });
  }

  // ── 3. Instant & Sorcery Spell Effects ──────────────────────
  if (typeLine.includes('Instant') || typeLine.includes('Sorcery')) {

    // ---- Named card overrides (highest priority) ----

    // PONDER – "Look at the top three cards of your library, then put them back in any order. You may shuffle. Draw a card."
    if (/ponder/i.test(name) || /look at the top three cards of your library.*then put them back in any order/i.test(oracle)) {
      const canShuffle = /you may shuffle/i.test(oracle);
      meta.spellEffects.push({ type: 'LOOK_AND_REARRANGE', amount: 3, canShuffle, thenDraw: 1 });
    }
    // BRAINSTORM – "Draw three cards, then put two cards from your hand on top of your library."
    else if (/brainstorm/i.test(name) || /draw three cards.*put two cards from your hand on top/i.test(oracle)) {
      meta.spellEffects.push({ type: 'DRAW_AND_TOPDECK', draw: 3, putBack: 2 });
    }
    // PREORDAIN – "Scry 2, then draw a card."
    else if (/preordain/i.test(name) || /scry 2.*draw a card/i.test(oracle)) {
      meta.spellEffects.push({ type: 'SCRY', amount: 2 });
      meta.spellEffects.push({ type: 'DRAW', amount: 1 });
    }
    // GITAXIAN PROBE – "Draw a card." (phyrexian mana, no target)
    else {
      // ---- Generic damage ----
      const damageMatch = oracle.match(
        /deals? (\d+|a|one|two|three) damage to (any target|target creature or player|target creature or planeswalker|target player|target opponent|target creature)/i
      );
      if (damageMatch) {
        const amount = parseNumber(damageMatch[1]);
        const targets = resolveTargetTypes(damageMatch[2]);
        meta.spellEffects.push({ type: 'DEAL_DAMAGE', amount, targetType: damageMatch[2].toLowerCase() });
        meta.requiresTarget = true;
        meta.validTargets = targets;
      }

      // ---- Draw a card ----
      if (/draw a card/i.test(oracle))
        meta.spellEffects.push({ type: 'DRAW', amount: 1 });
      else {
        const drawMatch = oracle.match(/draw (two|three|four|\d+) cards?/i);
        if (drawMatch)
          meta.spellEffects.push({ type: 'DRAW', amount: parseNumber(drawMatch[1]) });
      }

      // ---- Destroy target ----
      const destroyMatch = oracle.match(/[Dd]estroy target (creature|artifact|enchantment|land|permanent)/i);
      if (destroyMatch) {
        meta.spellEffects.push({ type: 'DESTROY', targetType: destroyMatch[1].toLowerCase() });
        meta.requiresTarget = true;
        meta.validTargets = resolveTargetTypes('target ' + destroyMatch[1]);
      }

      // ---- Counter target spell ----
      if (/[Cc]ounter target spell/i.test(oracle)) {
        meta.spellEffects.push({ type: 'COUNTER_SPELL' });
        meta.requiresTarget = true;
        meta.validTargets = ['spell'];
      }

      // ---- Mill ----
      const millMatch = oracle.match(/mills? (\d+|a|one|two|three) cards?/i);
      if (millMatch)
        meta.spellEffects.push({ type: 'MILL', amount: parseNumber(millMatch[1]) });

      // ---- Scry ----
      const scryMatch = oracle.match(/[Ss]cry (\d+)/);
      if (scryMatch)
        meta.spellEffects.push({ type: 'SCRY', amount: parseInt(scryMatch[1], 10) });

      // ---- Gain life ----
      const gainLifeMatch = oracle.match(/[Yy]ou gain (\d+) life/);
      if (gainLifeMatch)
        meta.spellEffects.push({ type: 'GAIN_LIFE', amount: parseInt(gainLifeMatch[1], 10) });

      // ---- Exile target ----
      const exileMatch = oracle.match(/[Ee]xile target (creature|permanent|artifact|enchantment)/i);
      if (exileMatch) {
        meta.spellEffects.push({ type: 'EXILE', targetType: exileMatch[1].toLowerCase() });
        meta.requiresTarget = true;
        meta.validTargets = resolveTargetTypes('target ' + exileMatch[1]);
      }

      // ---- Show and Tell – each player puts a permanent onto battlefield ----
      if (/each player may put an? (?:artifact, creature, enchantment,? or land|permanent) card from their hand onto the battlefield/i.test(oracle)) {
        meta.spellEffects.push({ type: 'SHOW_AND_TELL' });
      }
    }
  }

  // ── 4. Mana Abilities ───────────────────────────────────────
  const manaAbilityRegex = /\{T\}:\s*Add ((?:\{[WUBRG1-9C]\}(?:,\s*)?)+)/gi;
  let manaMatch;
  while ((manaMatch = manaAbilityRegex.exec(oracle)) !== null) {
    const manaStr = manaMatch[1];
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      if (manaStr.includes(`{${color}}`)) meta.manaAbilities.push(color);
    }
  }
  // Dual lands that produce "one of two colors" via choice
  if (/{T}: Add \{[WUBRG]\} or \{[WUBRG]\}/i.test(oracle)) {
    const colorTokens = oracle.match(/\{T\}: Add \{([WUBRG])\} or \{([WUBRG])\}/i);
    if (colorTokens) {
      meta.manaAbilities.push(colorTokens[1]);
      meta.manaAbilities.push(colorTokens[2]);
    }
  }
  // Ancient Tomb / other colorless producers
  if (/{T}: Add \{C\}\{C\}/i.test(oracle)) {
    meta.manaAbilities.push('C');
    meta.manaProducedAmount = 2;
  }

  // Basic Land Fallback
  if (typeLine.includes('Basic Land') || typeLine.includes('Basic Snow Land')) {
    if (typeLine.includes('Plains'))   meta.manaAbilities.push('W');
    if (typeLine.includes('Island'))   meta.manaAbilities.push('U');
    if (typeLine.includes('Swamp'))    meta.manaAbilities.push('B');
    if (typeLine.includes('Mountain')) meta.manaAbilities.push('R');
    if (typeLine.includes('Forest'))   meta.manaAbilities.push('G');
  }
  meta.manaAbilities = [...new Set(meta.manaAbilities)];

  // ── 5. Fetch Lands ──────────────────────────────────────────
  const fetchMatch = oracle.match(/Search your library for an? (.*?) card/i);
  if (fetchMatch && /Pay 1 life/i.test(oracle) && /Sacrifice/i.test(oracle)) {
    meta.isFetchLand = true;
    const typesStr = fetchMatch[1];
    const allowedTypes = [];
    if (typesStr.includes('Plains'))   allowedTypes.push('Plains');
    if (typesStr.includes('Island'))   allowedTypes.push('Island');
    if (typesStr.includes('Swamp'))    allowedTypes.push('Swamp');
    if (typesStr.includes('Mountain')) allowedTypes.push('Mountain');
    if (typesStr.includes('Forest'))   allowedTypes.push('Forest');
    meta.fetchTypes = allowedTypes;
  }

  // ── 6. Alternate Costs ──────────────────────────────────────
  // Force of Will
  if (/you may pay \d+ life and exile a blue card from your hand rather than pay this spell'?s mana cost/i.test(oracle)) {
    meta.alternateCosts.push({
      id: 'force_of_will_alt',
      description: 'Pay 1 life and exile a blue card from your hand',
      conditions: [
        { type: 'PAY_LIFE', amount: 1 },
        { type: 'EXILE_FROM_HAND', colorRequired: 'U' }
      ]
    });
  }

  // Daze
  if (/you may return an island you control to its owner'?s hand rather than pay this spell'?s mana cost/i.test(oracle)) {
    meta.alternateCosts.push({
      id: 'daze_alt',
      description: 'Return an Island you control to your hand',
      conditions: [
        { type: 'RETURN_LAND_TO_HAND', subtypeRequired: 'Island' }
      ]
    });
  }

  // Generic "rather than pay this spell's mana cost" pattern
  const genericAltCostMatch = oracle.match(
    /you may (.+?) rather than pay this spell'?s mana cost/i
  );
  if (genericAltCostMatch && meta.alternateCosts.length === 0) {
    meta.alternateCosts.push({
      id: 'generic_alt',
      description: genericAltCostMatch[1],
      conditions: [{ type: 'UNKNOWN', raw: genericAltCostMatch[1] }]
    });
  }

  // ── 7. Upkeep Triggers ──────────────────────────────────────

  // Delver of Secrets – "At the beginning of your upkeep, look at the top card of your library.
  //   You may reveal it. If an instant or sorcery card is revealed this way, transform Delver of Secrets."
  if (/delver of secrets/i.test(name) ||
      /at the beginning of your upkeep.*look at the top card.*instant or sorcery.*transform/i.test(oracle)) {
    meta.upkeepTriggers.push({ type: 'DELVER_FLIP' });
  }

  // Generic upkeep triggers (draw, lose life, etc.)
  if (/at the beginning of your upkeep.*draw a card/i.test(oracle))
    meta.upkeepTriggers.push({ type: 'DRAW', amount: 1 });

  const upkeepLifeLoss = oracle.match(/at the beginning of your upkeep.*lose (\d+) life/i);
  if (upkeepLifeLoss)
    meta.upkeepTriggers.push({ type: 'LOSE_LIFE', amount: parseInt(upkeepLifeLoss[1], 10) });

  // ── 8. Activated Abilities (non-mana) ───────────────────────

  // Sneak Attack – "{R}: You may put a creature card from your hand onto the battlefield.
  //   That creature gains haste. Sacrifice the creature at the beginning of the next end step."
  if (/sneak attack/i.test(name) ||
      /\{R\}:.*put a creature card from your hand onto the battlefield.*gains? haste.*sacrifice.*beginning of the next end step/is.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'sneak_attack',
      costType: 'MANA',
      cost: '{R}',
      effect: {
        type: 'PUT_CREATURE_FROM_HAND',
        gainKeyword: 'Haste',
        endStepTrigger: { type: 'SACRIFICE' }
      }
    });
  }

  // Aether Vial – "{T}: You may put a creature card with mana value equal to the number of charge
  //   counters on Aether Vial from your hand onto the battlefield."
  if (/aether vial/i.test(name) ||
      /put a creature card with (?:mana value|converted mana cost) equal to the number of charge counters/i.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'aether_vial_put',
      costType: 'TAP',
      effect: { type: 'VIAL_PUT_CREATURE' }
    });
    // Upkeep counter addition
    meta.upkeepTriggers.push({ type: 'ADD_CHARGE_COUNTER' });
  }

  // Generic "{T}: Sacrifice this artifact: ..." for Sensei's Divining Top etc.
  const tapSacMatch = oracle.match(/\{T\}:\s*(.+?)(?:\.|$)/i);
  if (tapSacMatch && !meta.activatedAbilities.length && !meta.manaAbilities.length) {
    // Don't double-parse mana or already-parsed
    const abText = tapSacMatch[1];
    if (/draw a card/i.test(abText)) {
      meta.activatedAbilities.push({
        id: 'tap_draw',
        costType: 'TAP',
        effect: { type: 'DRAW', amount: 1 }
      });
    }
  }

  // Griselbrand
  if (/Pay 7 life: Draw 7 cards/i.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'griselbrand_draw',
      costType: 'PAY_LIFE',
      costAmount: 7,
      effect: { type: 'DRAW', amount: 7 },
      description: 'Pay 7 life: Draw 7 cards.'
    });
  }

  // Wasteland / Strip Mine
  if (/\{T\},\s*Sacrifice.+?:\s*Destroy target (?:nonbasic )?land/i.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'wasteland_destroy',
      costType: 'TAP_AND_SACRIFICE',
      effect: { type: 'DESTROY', targetType: 'land' },
      requiresTarget: true,
      validTargets: ['land'],
      description: 'Tap, Sacrifice: Destroy target land.'
    });
  }

  // Lotus Petal
  if (/\{T\},\s*Sacrifice.+?:\s*Add one mana of any color/i.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'lotus_petal_mana',
      costType: 'TAP_AND_SACRIFICE',
      effect: { type: 'ADD_MANA', amount: 1, color: 'ANY' },
      description: 'Tap, Sacrifice: Add one mana of any color.'
    });
  }

  // Lion's Eye Diamond
  if (/Sacrifice.+?Discard your hand.+?Add three mana of any one color/i.test(oracle)) {
    meta.activatedAbilities.push({
      id: 'led_mana',
      costType: 'SACRIFICE_AND_DISCARD',
      effect: { type: 'ADD_MANA', amount: 3, color: 'ANY' },
      description: 'Sacrifice, Discard hand: Add 3 mana of any color.'
    });
  }

  // Emrakul
  if (/When .+? is put into a graveyard from anywhere, its owner shuffles their graveyard into their library/i.test(oracle)) {
    meta.engineMetadata = meta; // just to be safe
    meta.graveyardTriggers = meta.graveyardTriggers || [];
    meta.graveyardTriggers.push({ type: 'SHUFFLE_GRAVEYARD_INTO_LIBRARY' });
  }

  // Dragon's Rage Channeler
  if (/Whenever you cast a noncreature spell, surveil 1/i.test(oracle)) {
    meta.castTriggers = meta.castTriggers || [];
    meta.castTriggers.push({
      type: 'SURVEIL',
      amount: 1,
      condition: 'NONCREATURE'
    });
  }

  // Murktide Regent (Delve is handled by an alt cost or special cast rule, let's just do ETB counters)
  if (/enters the battlefield with a \+1\/\+1 counter on it for each instant and sorcery card exiled with it/i.test(oracle)) {
    meta.etbEffects.push({ type: 'MURKTIDE_COUNTERS' });
  }

  // ── 10. Additional Mechanics (Equip, Planeswalkers, Flashback, etc.) ──

  // Equip
  const equipMatch = oracle.match(/Equip (\{.+?\})/i);
  if (equipMatch) {
    meta.activatedAbilities.push({
      id: 'equip',
      costType: 'MANA',
      cost: equipMatch[1],
      effect: { type: 'EQUIP' },
      requiresTarget: true,
      validTargets: ['creature'],
      description: `Equip ${equipMatch[1]}`
    });
  }

  // Planeswalker Loyalty Abilities
  // Matches e.g., "[+1]:", "[-2]:", "[0]:"
  const loyaltyRegex = /\[([+-]?\d+|[X])\]:\s*(.*?)(?:\n|$)/gi;
  let loyaltyMatch;
  while ((loyaltyMatch = loyaltyRegex.exec(oracle)) !== null) {
    const cost = loyaltyMatch[1];
    const effectText = loyaltyMatch[2];
    meta.activatedAbilities.push({
      id: `loyalty_${cost}`,
      costType: 'LOYALTY',
      costAmount: cost === 'X' ? 'X' : parseInt(cost, 10),
      effect: { type: 'PLANESWALKER_ABILITY', rawText: effectText },
      description: `[${cost}]: ${effectText}`
    });
  }

  // Flashback
  const flashbackMatch = oracle.match(/Flashback (\{.+?\})/i);
  if (flashbackMatch) {
    meta.alternateCosts.push({
      id: 'flashback',
      description: `Flashback ${flashbackMatch[1]}`,
      conditions: [
        { type: 'FLASHBACK', cost: flashbackMatch[1] }
      ]
    });
  }

  // Storm
  if (/\bStorm\b/i.test(oracle) || /When you cast this spell, copy it for each spell cast before it/i.test(oracle)) {
    meta.spellEffects.push({ type: 'STORM' });
  }

  // Ward
  const wardMatch = oracle.match(/Ward (\{.+?\}|pay \d+ life|discard a card)/i);
  if (wardMatch) {
    meta.ward = wardMatch[1];
  }

  // Death Triggers
  if (/Whenever a creature dies/i.test(oracle)) {
    meta.deathTriggers = meta.deathTriggers || [];
    meta.deathTriggers.push({ type: 'GENERIC_CREATURE_DEATH', rawText: oracle });
  }
  if (/When .+? dies, /i.test(oracle)) {
    meta.deathTriggers = meta.deathTriggers || [];
    meta.deathTriggers.push({ type: 'SELF_DEATH', rawText: oracle });
  }

  return card;
}