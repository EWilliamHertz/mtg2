import { v4 as uuidv4 } from 'uuid';

export class GameEngine {
  constructor(mode, players, isBO3 = false) {
    this.state = {
      id: uuidv4(),
      mode: mode, // '1v0' or '1v1'
      isBO3: isBO3,
      gameNumber: 1,
      matchWins: { 0: 0, 1: 0 },
      matchOver: false,
      phase: 'mulligan',
      turn: 1,
      activePlayer: 0,
      priorityPlayer: 0,
      
      players: players.map((p, index) => ({
        id: p.id,
        socketId: p.socketId,
        name: p.name,
        index,
        life: 20,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        landsPlayedThisTurn: 0,
        maxLandsPerTurn: 1,
        deck: p.deck || p.deckCards || [],
        sideboard: p.sideboard || [],
        library: [],
        hand: [],
        battlefield: [],
        graveyard: [],
        exile: [],
        mulliganCount: 0,
        hasKeptHand: false,
        sideboardReady: false
      })),
      virtualOpponent: mode === '1v0' ? { life: 20 } : null,
      stack: [],
      combatState: null,
      gameOver: false,
      winner: null,
      winReason: null,
      log: []
    };
  }

  createLibrary(deckCards) {
    let library = [];
    deckCards.forEach(dc => {
      // Each dc is already a single card instance (socketHandler expands by quantity)
      library.push({
        instanceId: uuidv4(),
        cardId: dc.card_id || dc.scryfall_id,
        name: dc.name,
        mana_cost: dc.mana_cost,
        cmc: dc.cmc,
        type_line: dc.type_line,
        oracle_text: dc.oracle_text,
        power: dc.power,
        toughness: dc.toughness,
        colors: dc.colors,
        color_identity: dc.color_identity,
        keywords: dc.keywords || [],
        rarity: dc.rarity,
        image_uri: dc.image_uri
      });
    });
    // Shuffle
    for (let i = library.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [library[i], library[j]] = [library[j], library[i]];
    }
    return library;
  }

  log(message) {
    this.state.log.push({ time: Date.now(), message });
  }

  initGame() {
    this.state.phase = 'mulligan';
    this.state.turn = 1;
    this.state.activePlayer = 0;
    this.state.priorityPlayer = 0;
    this.state.gameOver = false;
    this.state.winner = null;
    this.state.winReason = null;
    this.state.combatState = null;
    this.state.stack = [];
    
    if (this.state.mode === '1v0') {
      this.state.virtualOpponent = { life: 20 };
    }

    this.state.players.forEach(p => {
      p.life = 20;
      p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      p.landsPlayedThisTurn = 0;
      p.library = this.createLibrary(p.deck);
      p.hand = [];
      p.battlefield = [];
      p.graveyard = [];
      p.exile = [];
      p.mulliganCount = 0;
      p.hasKeptHand = false;
      p.sideboardReady = false;
      
      // Draw 7
      for (let i = 0; i < 7; i++) {
        p.hand.push(p.library.pop());
      }
    });
    this.log(`Game ${this.state.gameNumber} started.`);
  }

  getState(forPlayerId) {
    // Serialize with a replacer function to exclude non-serializable properties
    const stateCopy = JSON.parse(JSON.stringify(this.state, (key, value) => {
      // Exclude non-serializable properties
      if (key === 'disconnectTimeout' || key === 'socketId') {
        return undefined;
      }
      return value;
    }));
    
    // Hide info for opponent
    stateCopy.players.forEach(p => {
      if (p.id !== forPlayerId) {
        // Hide hand details
        p.hand = p.hand.map(() => ({ instanceId: 'hidden' }));
      }
    
          // Hide library details unless the player is currently searching
          if (p.id !== forPlayerId || !p.isSearchingLibrary) {
            p.library = p.library.map(() => ({ instanceId: 'hidden' }));
          }
        });
        return stateCopy;
  }

  getPlayerIndex(playerId) {
    return this.state.players.findIndex(p => p.id === playerId);
  }

  isGameOver() {
    return this.state.gameOver || this.state.players.some(p => p.life <= 0);
  }

  drawCards(playerIndex, count) {
    const player = this.state.players[playerIndex];
    for (let i = 0; i < count; i++) {
      if (player.library.length === 0) {
        this.endGame(this.getOpponentIndex(playerIndex), 'Opponent drew from empty library');
        return;
      }
      player.hand.push(player.library.pop());
    }
  }

  getOpponentIndex(playerIndex) {
    return playerIndex === 0 ? 1 : 0;
  }

  endGame(winnerIndex, reason) {
    if (this.state.gameOver || this.state.phase === 'sideboarding') return;
    
    if (this.state.isBO3) {
      if (winnerIndex !== null && winnerIndex !== undefined && winnerIndex !== -1) {
         this.state.matchWins[winnerIndex]++;
      }
      this.state.gameNumber++;
      
      const winnerName = winnerIndex === -1 ? 'Player 1' : (this.state.mode === '1v0' ? this.state.players[0].name : (winnerIndex !== null && winnerIndex !== undefined ? this.state.players[winnerIndex].name : 'Draw'));

      if (this.state.matchWins[winnerIndex] === 2) {
         this.state.gameOver = true;
         this.state.matchOver = true;
         this.state.winner = winnerName;
         this.state.winReason = `Match won 2-${this.state.matchWins[this.getOpponentIndex(winnerIndex)]}`;
         this.log(`Match over. ${this.state.winner} wins the match.`);
      } else {
         this.state.phase = 'sideboarding';
         this.state.players.forEach(p => p.sideboardReady = false);
         this.log(`Game over. ${winnerName} wins. Entering sideboarding for game ${this.state.gameNumber}.`);
      }
    } else {
      this.state.gameOver = true;
      this.state.winner = winnerIndex === -1 ? 'Player 1' : (this.state.mode === '1v0' ? this.state.players[0].name : (winnerIndex !== null && winnerIndex !== undefined ? this.state.players[winnerIndex].name : 'Draw'));
      this.state.winReason = reason;
      this.log(`Game over. ${this.state.winner} wins. Reason: ${reason}`);
    }
  }

  clearManaPool() {
    this.state.players.forEach(p => {
      p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    });
  }

  advancePhase() {
    const phases = ['untap', 'upkeep', 'draw', 'main1', 'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end', 'main2', 'end_step', 'cleanup'];
    let currentIdx = phases.indexOf(this.state.phase);
    let nextIdx = currentIdx + 1;

    this.clearManaPool();

    if (nextIdx >= phases.length) {
      // Next turn
      this.state.phase = 'untap';
      this.state.turn++;
      if (this.state.mode === '1v1') {
        this.state.activePlayer = this.getOpponentIndex(this.state.activePlayer);
        this.state.priorityPlayer = this.state.activePlayer;
      }
      this.log(`--- Turn ${this.state.turn} - ${this.state.players[this.state.activePlayer].name}'s Turn ---`);
      this.handleAutoPhase();
      return;
    }

    this.state.phase = phases[nextIdx];
    this.state.priorityPlayer = this.state.activePlayer;
    this.handleAutoPhase();
  }

  handleAutoPhase() {
    const pIdx = this.state.activePlayer;
    const player = this.state.players[pIdx];

    switch (this.state.phase) {
      case 'untap':
        this.log(`${player.name} Untap Step`);
        player.battlefield.forEach(card => {
          card.tapped = false;
          // Clear summoning sickness
          card.summoningSick = false;
        });
        player.landsPlayedThisTurn = 0;
        this.advancePhase();
        break;
      case 'upkeep':
        this.log(`${player.name} Upkeep Step`);
        this.advancePhase();
        break;
      case 'draw':
        this.log(`${player.name} Draw Step`);
        if (!(this.state.turn === 1 && pIdx === 0)) { // Skip first draw on turn 1
          this.drawCards(pIdx, 1);
        }
        this.advancePhase();
        break;
      case 'main1':
        this.log(`${player.name} Pre-combat Main Phase`);
        // Wait for player to manually advance
        break;
      case 'combat_begin':
        this.log(`${player.name} Beginning of Combat`);
        this.state.combatState = {
          attackers: [], // [{ instanceId, attackerIndex }]
          blockers: [] // [{ attackerInstanceId, blockerInstanceIds: [] }]
        };
        this.advancePhase();
        break;
      case 'combat_attackers':
        this.log(`${player.name} Declare Attackers Step`);
        // Wait for player to declare attackers
        break;
      case 'combat_blockers':
        this.log(`${player.name} Declare Blockers Step`);
        if (this.state.mode === '1v0') {
          // No blockers in 1v0 goldfish
          this.advancePhase();
        }
        // Wait for opponent to declare blockers in 1v1
        break;
      case 'combat_damage':
        this.log(`${player.name} Combat Damage Step`);
        this.resolveCombatDamage();
        this.advancePhase();
        break;
      case 'combat_end':
        this.log(`${player.name} End of Combat`);
        this.state.combatState = null;
        this.advancePhase();
        break;
      case 'main2':
        this.log(`${player.name} Post-combat Main Phase`);
        // Wait for player
        break;
      case 'end_step':
        this.log(`${player.name} End Step`);
        this.advancePhase();
        break;
      case 'cleanup':
        this.log(`${player.name} Cleanup Step`);
        // Discard down to 7 (simplified)
        // Clear damage
        this.state.players.forEach(p => {
          p.battlefield.forEach(c => c.damage = 0);
        });
        this.advancePhase();
        break;
    }
  }

  resolveCombatDamage() {
    if (!this.state.combatState) return;

    const attackerPlayer = this.state.players[this.state.activePlayer];
    const defenderPlayer = this.state.mode === '1v1' ? this.state.players[this.getOpponentIndex(this.state.activePlayer)] : null;

    // First Strike Damage
    this.applyDamageStep(true, attackerPlayer, defenderPlayer);
    this.checkDeaths();

    // Normal Damage
    this.applyDamageStep(false, attackerPlayer, defenderPlayer);
    this.checkDeaths();
  }

  applyDamageStep(isFirstStrikeStep, attackerPlayer, defenderPlayer) {
    const combat = this.state.combatState;
    if (!combat) return;

    combat.attackers.forEach(att => {
      const attackerCard = attackerPlayer.battlefield.find(c => c.instanceId === att.instanceId);
      if (!attackerCard) return;

      const hasFirstStrike = (attackerCard.keywords || []).includes('First Strike');
      const hasDoubleStrike = (attackerCard.keywords || []).includes('Double Strike');

      let dealsDamageThisStep = false;
      if (isFirstStrikeStep) {
        if (hasFirstStrike || hasDoubleStrike) dealsDamageThisStep = true;
      } else {
        if (!hasFirstStrike || hasDoubleStrike) dealsDamageThisStep = true;
      }

      if (!dealsDamageThisStep) return;

      let power = parseInt(attackerCard.power) || 0;
      if (power <= 0) return;

      const blockInfo = combat.blockers.find(b => b.attackerInstanceId === att.instanceId);
      
      if (!blockInfo || blockInfo.blockerInstanceIds.length === 0) {
        // Unblocked
        if (this.state.mode === '1v0') {
          this.state.virtualOpponent.life -= power;
          this.log(`${attackerCard.name} deals ${power} damage to Goldfish Opponent.`);
        } else {
          defenderPlayer.life -= power;
          this.log(`${attackerCard.name} deals ${power} damage to ${defenderPlayer.name}.`);
        }
        if ((attackerCard.keywords || []).includes('Lifelink')) {
          attackerPlayer.life += power;
          this.log(`${attackerCard.name}'s Lifelink gains ${attackerPlayer.name} ${power} life.`);
        }
      } else {
        // Blocked
        const blockers = blockInfo.blockerInstanceIds.map(id => defenderPlayer.battlefield.find(c => c.instanceId === id)).filter(Boolean);
        
        let remainingPower = power;
        const hasDeathtouch = (attackerCard.keywords || []).includes('Deathtouch');
        const hasTrample = (attackerCard.keywords || []).includes('Trample');
        
        blockers.forEach(blocker => {
          if (remainingPower <= 0) return;
          const blockerToughness = parseInt(blocker.toughness) || 0;
          let damageToDeal = hasDeathtouch ? 1 : Math.min(remainingPower, blockerToughness - (blocker.damage || 0));
          if (!hasTrample && blockers.length === 1) { // Deal full damage if only 1 blocker even without trample
             damageToDeal = remainingPower; 
          }
          blocker.damage = (blocker.damage || 0) + damageToDeal;
          remainingPower -= damageToDeal;
          this.log(`${attackerCard.name} deals ${damageToDeal} damage to ${blocker.name}.`);

          if ((attackerCard.keywords || []).includes('Lifelink')) {
            attackerPlayer.life += damageToDeal;
          }

          // Blocker deals damage back
          let blockerPower = parseInt(blocker.power) || 0;
          const blockerFirstStrike = (blocker.keywords || []).includes('First Strike');
          const blockerDoubleStrike = (blocker.keywords || []).includes('Double Strike');
          
          let blockerDealsDamage = false;
          if (isFirstStrikeStep && (blockerFirstStrike || blockerDoubleStrike)) blockerDealsDamage = true;
          if (!isFirstStrikeStep && (!blockerFirstStrike || blockerDoubleStrike)) blockerDealsDamage = true;

          if (blockerDealsDamage && blockerPower > 0) {
            attackerCard.damage = (attackerCard.damage || 0) + blockerPower;
            this.log(`${blocker.name} deals ${blockerPower} damage to ${attackerCard.name}.`);
            if ((blocker.keywords || []).includes('Lifelink')) {
              defenderPlayer.life += blockerPower;
            }
          }
        });

        if (hasTrample && remainingPower > 0) {
          if (this.state.mode === '1v0') {
            this.state.virtualOpponent.life -= remainingPower;
            this.log(`${attackerCard.name} tramples for ${remainingPower} damage to Goldfish Opponent.`);
          } else {
            defenderPlayer.life -= remainingPower;
            this.log(`${attackerCard.name} tramples for ${remainingPower} damage to ${defenderPlayer.name}.`);
          }
          if ((attackerCard.keywords || []).includes('Lifelink')) {
            attackerPlayer.life += remainingPower;
          }
        }
      }
    });
  }

  checkDeaths() {
    this.state.players.forEach(p => {
      p.battlefield = p.battlefield.filter(card => {
        if (!card.type_line.includes('Creature')) return true; // not a creature
        const toughness = parseInt(card.toughness) || 0;
        const damage = card.damage || 0;
        const hasDeathtouchDamage = card.deathtouchDamage || false; // simplified

        if (damage >= toughness || hasDeathtouchDamage) {
          this.log(`${card.name} dies.`);
          p.graveyard.push(card);
          // clear damage, states
          card.damage = 0;
          card.tapped = false;
          return false;
        }
        return true;
      });
    });

    this.checkWinConditions();
  }

  checkWinConditions() {
    if (this.state.mode === '1v0') {
      if (this.state.virtualOpponent.life <= 0) {
        this.endGame(0, 'Goldfish Opponent life reached 0');
      } else if (this.state.players[0].life <= 0) {
        this.endGame(-1, 'Player life reached 0');
      }
    } else {
      let alivePlayers = this.state.players.filter(p => p.life > 0);
      if (alivePlayers.length === 1) {
        this.endGame(alivePlayers[0].index, 'Opponent life reached 0');
      } else if (alivePlayers.length === 0) {
        this.endGame(null, 'Both players life reached 0');
      }
    }
  }

  handleAction(playerId, action) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) return { success: false, error: 'Player not found' };
    const player = this.state.players[playerIndex];

    try {
      if (action.type === 'concede') {
        this.endGame(this.getOpponentIndex(playerIndex), 'Opponent conceded');
        return { success: true };
      }

      if (this.state.phase === 'sideboarding') {
        if (action.type === 'submit-sideboard') {
          player.deck = action.newMainDeck || player.deck;
          player.sideboard = action.newSideboard || player.sideboard;
          player.sideboardReady = true;
          
          if (this.state.mode === '1v0' || this.state.players.every(p => p.sideboardReady)) {
            this.initGame(); // Starts the next game
          }
          return { success: true };
        }
        return { success: false, error: 'In sideboarding phase' };
      }

      if (this.state.gameOver) return { success: false, error: 'Game is over' };

      switch (action.type) {
        case 'mulligan-keep':
          if (this.state.phase !== 'mulligan') throw new Error('Not in mulligan phase');
          if (player.hasKeptHand) throw new Error('Already kept hand');
          
          if (player.mulliganCount > 0) {
             // Require bottoming cards
             if (!action.bottomCards || action.bottomCards.length !== player.mulliganCount) {
               throw new Error(`Must specify ${player.mulliganCount} cards to put on bottom of library`);
             }
             action.bottomCards.forEach(instanceId => {
               const idx = player.hand.findIndex(c => c.instanceId === instanceId);
               if (idx !== -1) {
                 const card = player.hand.splice(idx, 1)[0];
                 player.library.unshift(card); // put on bottom
               }
             });
          }
          player.hasKeptHand = true;
          this.log(`${player.name} keeps their hand.`);
          
          // Check if all players kept
          if (this.state.players.every(p => p.hasKeptHand)) {
            this.state.phase = 'untap';
            this.handleAutoPhase();
          }
          return { success: true };

        case 'mulligan-mulligan':
          if (this.state.phase !== 'mulligan') throw new Error('Not in mulligan phase');
          if (player.hasKeptHand) throw new Error('Already kept hand');
          
          // Shuffle hand into library
          player.library.push(...player.hand);
          player.hand = [];
          
          // Shuffle library
          for (let i = player.library.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [player.library[i], player.library[j]] = [player.library[j], player.library[i]];
          }
          
          player.mulliganCount++;
          this.drawCards(playerIndex, 7);
          this.log(`${player.name} takes a mulligan (count: ${player.mulliganCount}).`);
          return { success: true };

        case 'pass':
          // Simplified passing
          if (this.state.priorityPlayer !== playerIndex) throw new Error('You do not have priority');
          this.advancePhase();
          return { success: true };

        case 'play-card':
          if (this.state.phase === 'mulligan') throw new Error('Must complete mulligan first');
          if (this.state.priorityPlayer !== playerIndex) throw new Error('You do not have priority');
          
          console.log(`  play-card: looking for instanceId=${action.instanceId}, hand has: [${player.hand.map(c => c.instanceId).join(', ')}]`);
          const cardIdx = player.hand.findIndex(c => c.instanceId === action.instanceId);
          if (cardIdx === -1) throw new Error('Card not in hand');
          const card = player.hand[cardIdx];

          const isLand = card.type_line.includes('Land');
          if (isLand) {
            if (!['main1', 'main2'].includes(this.state.phase)) throw new Error('Lands can only be played in main phases');
            if (this.state.activePlayer !== playerIndex) throw new Error('Lands can only be played on your turn');
            if (player.landsPlayedThisTurn >= player.maxLandsPerTurn) throw new Error('Max lands played this turn');
            
            player.hand.splice(cardIdx, 1);
            card.tapped = false;
            player.battlefield.push(card);
            player.landsPlayedThisTurn++;
            this.log(`${player.name} plays ${card.name}.`);
          } else {
            // Check timing
            const isInstant = card.type_line.includes('Instant') || (card.keywords || []).includes('Flash');
            if (!isInstant) {
               if (!['main1', 'main2'].includes(this.state.phase)) throw new Error('Non-instants can only be played in main phases');
               if (this.state.activePlayer !== playerIndex) throw new Error('Non-instants can only be played on your turn');
            }

            // Check and deduct mana
            if (card.mana_cost) {
               this.payMana(player, card.mana_cost);
            }

            player.hand.splice(cardIdx, 1);
            if (card.type_line.includes('Instant') || card.type_line.includes('Sorcery')) {
               player.graveyard.push(card);
               this.log(`${player.name} casts ${card.name}.`);
               // Resolve immediately for now
            } else {
               card.tapped = false;
               card.summoningSick = card.type_line.includes('Creature') && !(card.keywords || []).includes('Haste');
               card.damage = 0;
               player.battlefield.push(card);
               this.log(`${player.name} casts ${card.name}.`);
            }
          }
          return { success: true };

        
        case 'tap-land':
          const land = player.battlefield.find(c => c.instanceId === action.instanceId);
          if (!land) throw new Error('Land not on battlefield');
          
          // New code
          // --- Fetch Land Intercept ---
          const fetchLands = {
            'Polluted Delta': ['Island', 'Swamp'],
            'Flooded Strand': ['Plains', 'Island'],
            'Bloodstained Mire': ['Swamp', 'Mountain'],
            'Wooded Foothills': ['Mountain', 'Forest'],
            'Windswept Heath': ['Forest', 'Plains'],
            'Marsh Flats': ['Plains', 'Swamp'],
            'Scalding Tarn': ['Island', 'Mountain'],
            'Verdant Catacombs': ['Swamp', 'Forest'],
            'Arid Mesa': ['Mountain', 'Plains'],
            'Misty Rainforest': ['Forest', 'Island']
          };




          if (fetchLands[land.name]) {
            if (player.life <= 1) throw new Error('Not enough life to activate');
            
            player.life -= 1;
            const landIdx = player.battlefield.findIndex(c => c.instanceId === action.instanceId);
            player.graveyard.push(player.battlefield.splice(landIdx, 1)[0]);
            
            player.isSearchingLibrary = true;
            player.searchCriteria = fetchLands[land.name]; // Save allowed fetch types to state
            this.log(`${player.name} activates ${land.name}, pays 1 life and sacrifices it to search their library.`);
            return { success: true };
          }

          if (land.tapped) throw new Error('Land is already tapped');
          land.tapped = true;
          
          // Determine mana added
          let colorAdded = action.color;
          if (!colorAdded) {
            if (land.type_line.includes('Plains')) colorAdded = 'W';
            else if (land.type_line.includes('Island')) colorAdded = 'U';
            else if (land.type_line.includes('Swamp')) colorAdded = 'B';
            else if (land.type_line.includes('Mountain')) colorAdded = 'R';
            else if (land.type_line.includes('Forest')) colorAdded = 'G';
            else colorAdded = 'C';
          }
          
          player.manaPool[colorAdded] = (player.manaPool[colorAdded] || 0) + 1;
          this.log(`${player.name} taps ${land.name} for ${colorAdded}.`);
          return { success: true };

        
        // New code
        case 'resolve-library-search':
          if (!player.isSearchingLibrary) throw new Error('Not currently searching library');
          
          if (action.targetInstanceId) {
            const cardIdx = player.library.findIndex(c => c.instanceId === action.targetInstanceId);
            if (cardIdx !== -1) {
              const card = player.library[cardIdx];
              
              // Validate that the chosen card matches the fetch criteria (e.g. Island or Swamp)
              if (player.searchCriteria) {
                const isValid = player.searchCriteria.some(type => card.type_line && card.type_line.includes(type));
                if (!isValid) {
                  throw new Error(`Invalid target. You must find a card with one of these types: ${player.searchCriteria.join(', ')}`);
                }
              }

              player.library.splice(cardIdx, 1);
              card.tapped = false; // Put onto battlefield
              player.battlefield.push(card);
              this.log(`${player.name} puts ${card.name} onto the battlefield.`);
            }
          } else {
            this.log(`${player.name} fails to find a card.`);
          }
          
          player.isSearchingLibrary = false;
          player.searchCriteria = null;
          // Shuffle library
          for (let i = player.library.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [player.library[i], player.library[j]] = [player.library[j], player.library[i]];
          }
          this.log(`${player.name} shuffles their library.`);
          return { success: true };

        case 'declare-attackers':
          if (this.state.phase !== 'combat_attackers') throw new Error('Not declare attackers phase');
          if (this.state.activePlayer !== playerIndex) throw new Error('Not your turn');

          action.attackers.forEach(attId => {
            const c = player.battlefield.find(card => card.instanceId === attId);
            if (!c) throw new Error(`Card ${attId} not found`);
            if (c.tapped) throw new Error(`${c.name} is tapped`);
            if (c.summoningSick) throw new Error(`${c.name} has summoning sickness`);
            if ((c.keywords || []).includes('Defender')) throw new Error(`${c.name} has Defender`);

            if (!(c.keywords || []).includes('Vigilance')) {
              c.tapped = true;
            }
            this.state.combatState.attackers.push({ instanceId: attId, attackerIndex: playerIndex });
          });
          
          this.log(`${player.name} declares ${action.attackers.length} attackers.`);
          this.advancePhase();
          return { success: true };

        case 'declare-blockers':
          if (this.state.phase !== 'combat_blockers') throw new Error('Not declare blockers phase');
          if (this.state.activePlayer === playerIndex) throw new Error('Active player cannot block');

          const tempBlockers = [];

          action.blockers.forEach(b => {
             const blocker = player.battlefield.find(card => card.instanceId === b.blockerInstanceId);
             if (!blocker) throw new Error(`Blocker ${b.blockerInstanceId} not found`);
             if (blocker.tapped) throw new Error(`${blocker.name} is tapped`);
             
             let blockInfo = tempBlockers.find(x => x.attackerInstanceId === b.attackerInstanceId);
             if (!blockInfo) {
                blockInfo = { attackerInstanceId: b.attackerInstanceId, blockerInstanceIds: [] };
                tempBlockers.push(blockInfo);
             }
             blockInfo.blockerInstanceIds.push(b.blockerInstanceId);

             // Handle Reach/Flying restrictions
             const attackerPlayerIdx = this.state.activePlayer;
             const attackerCard = this.state.players[attackerPlayerIdx].battlefield.find(c => c.instanceId === b.attackerInstanceId);
             if (attackerCard) {
                if ((attackerCard.keywords || []).includes('Flying')) {
                   if (!(blocker.keywords || []).includes('Flying') && !(blocker.keywords || []).includes('Reach')) {
                      throw new Error(`${blocker.name} cannot block flying ${attackerCard.name}`);
                   }
                }
             }
          });

          // Validate Menace
          const attackerPlayerIdx = this.state.activePlayer;
          tempBlockers.forEach(b => {
             const attackerCard = this.state.players[attackerPlayerIdx].battlefield.find(c => c.instanceId === b.attackerInstanceId);
             if (attackerCard && (attackerCard.keywords || []).includes('Menace')) {
                 if (b.blockerInstanceIds.length < 2) {
                     throw new Error(`${attackerCard.name} has Menace and must be blocked by 2 or more creatures`);
                 }
             }
          });

          this.state.combatState.blockers = tempBlockers;
          
          this.log(`${player.name} declares ${action.blockers.length} blockers.`);
          this.advancePhase();
          return { success: true };

        case 'next-phase':
        case 'pass-priority':
          // Block during mulligan - must keep hand first
          if (this.state.phase === 'mulligan') {
            return { success: false, error: 'Must complete mulligan first (Keep or Mulligan)' };
          }
          // In a single-player game or when it's your turn, advance to next phase
          if (this.state.activePlayer === playerIndex || this.state.mode === '1v0') {
            this.advancePhase();
            this.log(`${player.name} passes priority.`);
            return { success: true };
          }
          return { success: false, error: 'Not your turn' };

        default:
          return { success: false, error: 'Unknown action type' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  payMana(player, manaCostStr) {
    const regex = /\{([^}]+)\}/g;
    let match;
    const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };
    
    while ((match = regex.exec(manaCostStr)) !== null) {
      const sym = match[1];
      if (!isNaN(parseInt(sym))) {
        cost.generic += parseInt(sym);
      } else if (cost[sym] !== undefined) {
        cost[sym]++;
      }
    }

    // Check colored mana
    for (let c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      if (player.manaPool[c] < cost[c]) {
        throw new Error(`Not enough ${c} mana`);
      }
    }

    // Check total mana for generic
    let availableGeneric = 0;
    for (let c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      availableGeneric += (player.manaPool[c] - cost[c]);
    }
    
    if (availableGeneric < cost.generic) {
      throw new Error('Not enough total mana for generic cost');
    }

    // Deduct colored
    for (let c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      player.manaPool[c] -= cost[c];
    }
    
    // Deduct generic (greedy order)
    let remainingGeneric = cost.generic;
    for (let c of ['C', 'W', 'U', 'B', 'R', 'G']) { // Try colorless first
      if (remainingGeneric <= 0) break;
      const deduct = Math.min(player.manaPool[c], remainingGeneric);
      player.manaPool[c] -= deduct;
      remainingGeneric -= deduct;
    }
  }
}
