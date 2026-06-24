
import { v4 as uuidv4 } from 'uuid';
import { parseCardData } from './cardParser.js';

// ============================================================
// GameEngine – Phases 1-4 implementation
// Targeting + Stack, Ponder/Brainstorm, Alternate Costs,
// Upkeep Triggers, Activated Abilities, Delayed End-Step Triggers
// ============================================================

export class GameEngine {
  constructor(mode, players, isBO3 = false) {
    this.state = {
      id: uuidv4(),
      mode,
      isBO3,
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
        sideboardReady: false,
        // Phase-2 modal states
        isRearrangingLibrary: false,
        ponderCards: [],
        isBrainstorming: false,
        brainstormData: null,
        // Phase-4 trigger states
        isRevealingTopCard: false,
        revealedCard: null,
      })),

      virtualOpponent: mode === '1v0' ? { life: 20 } : null,
      stack: [],            // ← Phase 1: the spell stack
      delayedTriggers: [],  // ← Phase 4: end-step sacrifices etc.
      combatState: null,
      gameOver: false,
      winner: null,
      winReason: null,
      log: [],
    };
  }

  // ── Library construction ────────────────────────────────────
  createLibrary(deckCards) {
    const library = [];
    deckCards.forEach(dc => {
      const parsedDc = parseCardData(dc);
      library.push({
        instanceId: uuidv4(),
        cardId: parsedDc.card_id || parsedDc.scryfall_id,
        name: parsedDc.name,
        mana_cost: parsedDc.mana_cost,
        cmc: parsedDc.cmc,
        type_line: parsedDc.type_line,
        oracle_text: parsedDc.oracle_text,
        power: parsedDc.power,
        toughness: parsedDc.toughness,
        colors: parsedDc.colors,
        color_identity: parsedDc.color_identity,
        keywords: parsedDc.keywords || [],
        rarity: parsedDc.rarity,
        image_uri: parsedDc.image_uri,
        engineMetadata: parsedDc.engineMetadata,
      });
    });
    this._shuffle(library);
    return library;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  addLog(message) {
    this.state.log.push({ time: Date.now(), message });
  }

  // ── Game init ───────────────────────────────────────────────
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
    this.state.delayedTriggers = [];
    if (this.state.mode === '1v0') this.state.virtualOpponent = { life: 20 };

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
      p.isRearrangingLibrary = false;
      p.ponderCards = [];
      p.isBrainstorming = false;
      p.brainstormData = null;
      p.isRevealingTopCard = false;
      p.revealedCard = null;
      p.isScrying = false;
      p.scryCard = null;
      p.isSurveiling = false;
      p.surveilCard = null;
      p.isSearchingLibrary = false;
      p.searchCriteria = null;
      p.isShowAndTelling = false;

      for (let i = 0; i < 7; i++) p.hand.push(p.library.pop());
    });
    this.addLog(`Game ${this.state.gameNumber} started.`);
  }

  // ── State serialisation ─────────────────────────────────────
  getState(forPlayerId) {
    const stateCopy = JSON.parse(JSON.stringify(this.state, (key, value) => {
      if (key === 'disconnectTimeout' || key === 'socketId') return undefined;
      return value;
    }));

    stateCopy.players.forEach(p => {
      if (p.id !== forPlayerId) {
        p.hand = p.hand.map(() => ({ instanceId: 'hidden' }));
      }
      if (p.id !== forPlayerId || !p.isSearchingLibrary) {
        p.library = p.library.map(() => ({ instanceId: 'hidden' }));
      }
    });
    return stateCopy;
  }

  // ── Helpers ─────────────────────────────────────────────────
  getPlayerIndex(playerId) {
    return this.state.players.findIndex(p => p.id === playerId);
  }

  getOpponentIndex(playerIndex) {
    return playerIndex === 0 ? 1 : 0;
  }

  isGameOver() {
    return this.state.gameOver;
  }

  drawCards(playerIndex, count) {
    const player = this.state.players[playerIndex];
    for (let i = 0; i < count; i++) {
      if (player.library.length === 0) {
        this.endGame(this.getOpponentIndex(playerIndex), 'Drew from empty library');
        return;
      }
      player.hand.push(player.library.pop());
    }
  }

  endGame(winnerIndex, reason) {
    if (this.state.gameOver || this.state.phase === 'sideboarding') return;

    if (this.state.isBO3) {
      if (winnerIndex !== null && winnerIndex !== undefined && winnerIndex !== -1) {
        this.state.matchWins[winnerIndex]++;
      }
      this.state.gameNumber++;

      const winnerName = this._winnerName(winnerIndex);
      if (this.state.matchWins[winnerIndex] === 2) {
        this.state.gameOver = true;
        this.state.matchOver = true;
        this.state.winner = winnerName;
        this.state.winReason = `Match won 2-${this.state.matchWins[this.getOpponentIndex(winnerIndex)]}`;
        this.addLog(`Match over. ${this.state.winner} wins the match.`);
      } else {
        this.state.phase = 'sideboarding';
        this.state.players.forEach(p => p.sideboardReady = false);
        this.addLog(`Game over. ${winnerName} wins. Sideboarding for game ${this.state.gameNumber}.`);
      }
    } else {
      this.state.gameOver = true;
      this.state.winner = this._winnerName(winnerIndex);
      this.state.winReason = reason;
      this.addLog(`Game over. ${this.state.winner} wins. Reason: ${reason}`);
    }
  }

  _winnerName(winnerIndex) {
    if (winnerIndex === -1) return 'Player 1';
    if (winnerIndex === null || winnerIndex === undefined) return 'Draw';
    if (this.state.mode === '1v0') return this.state.players[0].name;
    return this.state.players[winnerIndex]?.name ?? 'Unknown';
  }

  clearManaPool() {
    this.state.players.forEach(p => {
      p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    });
  }

  // ── Phase engine ────────────────────────────────────────────
  advancePhase() {
    const phases = [
      'untap', 'upkeep', 'draw',
      'main1',
      'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end',
      'main2',
      'end_step', 'cleanup'
    ];
    const currentIdx = phases.indexOf(this.state.phase);
    const nextIdx = currentIdx + 1;

    this.clearManaPool();

    if (nextIdx >= phases.length) {
      this.state.phase = 'untap';
      this.state.turn++;
      if (this.state.mode === '1v1') {
        this.state.activePlayer = this.getOpponentIndex(this.state.activePlayer);
        this.state.priorityPlayer = this.state.activePlayer;
      }
      this.addLog(`--- Turn ${this.state.turn} – ${this.state.players[this.state.activePlayer].name}'s Turn ---`);
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
        this.addLog(`${player.name} – Untap`);
        player.battlefield.forEach(c => {
          c.tapped = false;
          c.summoningSick = false;
        });
        player.landsPlayedThisTurn = 0;
        this.advancePhase();
        break;

      case 'upkeep':
        this.addLog(`${player.name} – Upkeep`);
        this._processUpkeepTriggers(pIdx);
        // Only auto-advance if no blocking UI state was set
        if (!player.isRevealingTopCard) this.advancePhase();
        break;

      case 'draw':
        this.addLog(`${player.name} – Draw`);
        if (!(this.state.turn === 1 && pIdx === 0)) this.drawCards(pIdx, 1);
        this.advancePhase();
        break;

      case 'main1':
      case 'main2':
        this.addLog(`${player.name} – ${this.state.phase === 'main1' ? 'Pre-combat' : 'Post-combat'} Main`);
        break; // wait for player

      case 'combat_begin':
        this.addLog(`${player.name} – Beginning of Combat`);
        this.state.combatState = { attackers: [], blockers: [] };
        this.advancePhase();
        break;

      case 'combat_attackers':
        this.addLog(`${player.name} – Declare Attackers`);
        break;

      case 'combat_blockers':
        this.addLog(`${player.name} – Declare Blockers`);
        if (this.state.mode === '1v0') this.advancePhase();
        break;

      case 'combat_damage':
        this.addLog(`${player.name} – Combat Damage`);
        this.resolveCombatDamage();
        this.advancePhase();
        break;

      case 'combat_end':
        this.addLog(`${player.name} – End of Combat`);
        this.state.combatState = null;
        this.advancePhase();
        break;

      case 'end_step':
        this.addLog(`${player.name} – End Step`);
        this._processEndStepTriggers(pIdx);
        this.advancePhase();
        break;

      case 'cleanup':
        this.addLog(`${player.name} – Cleanup`);
        this.state.players.forEach(p => p.battlefield.forEach(c => c.damage = 0));
        this.advancePhase();
        break;
    }
  }

  // ── Phase 4: Upkeep Trigger Processing ──────────────────────
  _processUpkeepTriggers(pIdx) {
    const player = this.state.players[pIdx];

    player.battlefield.forEach(card => {
      const triggers = card.engineMetadata?.upkeepTriggers || [];
      triggers.forEach(trigger => {
        switch (trigger.type) {
          case 'DELVER_FLIP': {
            // Reveal top card of library to both players
            if (player.library.length > 0) {
              const topCard = player.library[player.library.length - 1];
              player.isRevealingTopCard = true;
              player.revealedCard = { ...topCard, sourceInstanceId: card.instanceId };
              this.addLog(`${player.name}'s Delver of Secrets trigger: revealing top card – ${topCard.name}.`);

              // If it's an Instant or Sorcery, transform Delver
              if (topCard.type_line?.includes('Instant') || topCard.type_line?.includes('Sorcery')) {
                this._transformDelver(card, pIdx);
                this.addLog(`${topCard.name} is an Instant/Sorcery! Delver transforms into Insectile Aberration.`);
              }
            }
            break;
          }
          case 'ADD_CHARGE_COUNTER': {
            card.counters = card.counters || {};
            card.counters.charge = (card.counters.charge || 0) + 1;
            this.addLog(`${player.name} adds a charge counter to ${card.name} (now ${card.counters.charge}).`);
            break;
          }
          case 'DRAW': {
            this.drawCards(pIdx, trigger.amount || 1);
            this.addLog(`${player.name} draws ${trigger.amount} card(s) from ${card.name}'s upkeep trigger.`);
            break;
          }
          case 'LOSE_LIFE': {
            player.life -= trigger.amount;
            this.addLog(`${player.name} loses ${trigger.amount} life from ${card.name}'s upkeep trigger.`);
            this.checkWinConditions();
            break;
          }
        }
      });
    });
  }

  _transformDelver(card, pIdx) {
    // Flip to Insectile Aberration (3/2 Flying)
    card.transformed = true;
    card.name = 'Insectile Aberration';
    card.power = '3';
    card.toughness = '2';
    card.keywords = [...(card.keywords || []), 'Flying'];
    card.type_line = 'Creature – Human Insect';
    // Keep original image reference so UI can show the back face
    card._originalName = 'Delver of Secrets';
  }

  // ── Phase 4: End-Step Trigger Processing (delayed sacrifices) ─
  _processEndStepTriggers(pIdx) {
    const remaining = [];
    for (const trigger of this.state.delayedTriggers) {
      if (trigger.onPhase === 'end_step') {
        if (trigger.type === 'SACRIFICE' && trigger.ownerIndex === pIdx) {
          const owner = this.state.players[pIdx];
          const bfIdx = owner.battlefield.findIndex(c => c.instanceId === trigger.instanceId);
          if (bfIdx !== -1) {
            const [sacrificed] = owner.battlefield.splice(bfIdx, 1);
            owner.graveyard.push(sacrificed);
            this.addLog(`${sacrificed.name} is sacrificed at end of turn (Sneak Attack trigger).`);
          }
        }
      } else {
        remaining.push(trigger);
      }
    }
    this.state.delayedTriggers = remaining;
  }

  // ── Combat ───────────────────────────────────────────────────
  resolveCombatDamage() {
    if (!this.state.combatState) return;
    const attackerPlayer = this.state.players[this.state.activePlayer];
    const defenderPlayer = this.state.mode === '1v1'
      ? this.state.players[this.getOpponentIndex(this.state.activePlayer)]
      : null;

    this.applyDamageStep(true, attackerPlayer, defenderPlayer);
    this.checkDeaths();
    this.applyDamageStep(false, attackerPlayer, defenderPlayer);
    this.checkDeaths();
  }

  applyDamageStep(isFirstStrikeStep, attackerPlayer, defenderPlayer) {
    const combat = this.state.combatState;
    if (!combat) return;

    combat.attackers.forEach(att => {
      const attackerCard = attackerPlayer.battlefield.find(c => c.instanceId === att.instanceId);
      if (!attackerCard) return;

      const hasFirstStrike  = (attackerCard.keywords || []).includes('First Strike');
      const hasDoubleStrike = (attackerCard.keywords || []).includes('Double Strike');
      let dealsDamage = false;
      if (isFirstStrikeStep && (hasFirstStrike || hasDoubleStrike)) dealsDamage = true;
      if (!isFirstStrikeStep && (!hasFirstStrike || hasDoubleStrike))    dealsDamage = true;
      if (!dealsDamage) return;

      const power = parseInt(attackerCard.power) || 0;
      if (power <= 0) return;

      const blockInfo = combat.blockers.find(b => b.attackerInstanceId === att.instanceId);

      if (!blockInfo || blockInfo.blockerInstanceIds.length === 0) {
        // Unblocked
        if (this.state.mode === '1v0') {
          this.state.virtualOpponent.life -= power;
          this.addLog(`${attackerCard.name} deals ${power} to Goldfish.`);
        } else {
          defenderPlayer.life -= power;
          this.addLog(`${attackerCard.name} deals ${power} to ${defenderPlayer.name}.`);
        }
        if ((attackerCard.keywords || []).includes('Lifelink')) attackerPlayer.life += power;
      } else {
        // Blocked
        const blockers = blockInfo.blockerInstanceIds
          .map(id => defenderPlayer.battlefield.find(c => c.instanceId === id))
          .filter(Boolean);

        let remaining = power;
        const hasDeathtouch = (attackerCard.keywords || []).includes('Deathtouch');
        const hasTrample    = (attackerCard.keywords || []).includes('Trample');

        blockers.forEach(blocker => {
          if (remaining <= 0) return;
          const blockerTgh = parseInt(blocker.toughness) || 0;
          let dmg = hasDeathtouch ? 1 : Math.min(remaining, blockerTgh - (blocker.damage || 0));
          if (!hasTrample && blockers.length === 1) dmg = remaining;
          blocker.damage = (blocker.damage || 0) + dmg;
          remaining -= dmg;
          this.addLog(`${attackerCard.name} deals ${dmg} to ${blocker.name}.`);
          if ((attackerCard.keywords || []).includes('Lifelink')) attackerPlayer.life += dmg;

          // Blocker deals back
          const bPower = parseInt(blocker.power) || 0;
          const bFS = (blocker.keywords || []).includes('First Strike');
          const bDS = (blocker.keywords || []).includes('Double Strike');
          let blockerDeals = false;
          if (isFirstStrikeStep && (bFS || bDS)) blockerDeals = true;
          if (!isFirstStrikeStep && (!bFS || bDS)) blockerDeals = true;
          if (blockerDeals && bPower > 0) {
            attackerCard.damage = (attackerCard.damage || 0) + bPower;
            this.addLog(`${blocker.name} deals ${bPower} to ${attackerCard.name}.`);
            if ((blocker.keywords || []).includes('Lifelink') && defenderPlayer) defenderPlayer.life += bPower;
          }
        });

        if (hasTrample && remaining > 0) {
          if (this.state.mode === '1v0') {
            this.state.virtualOpponent.life -= remaining;
          } else {
            defenderPlayer.life -= remaining;
            this.addLog(`${attackerCard.name} tramples for ${remaining} to ${defenderPlayer.name}.`);
          }
          if ((attackerCard.keywords || []).includes('Lifelink')) attackerPlayer.life += remaining;
        }
      }
    });
  }

  checkDeaths() {
    this.state.players.forEach(p => {
      p.battlefield = p.battlefield.filter(card => {
        if (!card.type_line?.includes('Creature')) return true;
        const tgh = parseInt(card.toughness) || 0;
        if ((card.damage || 0) >= tgh) {
          this.addLog(`${card.name} dies.`);
          p.graveyard.push({ ...card, damage: 0, tapped: false });
          return false;
        }
        return true;
      });
    });
    this.checkWinConditions();
  }

  checkWinConditions() {
    if (this.state.mode === '1v0') {
      if (this.state.virtualOpponent.life <= 0)
        this.endGame(0, 'Goldfish reached 0 life');
      else if (this.state.players[0].life <= 0)
        this.endGame(-1, 'Player life reached 0');
    } else {
      const alive = this.state.players.filter(p => p.life > 0);
      if (alive.length === 1)  this.endGame(alive[0].index, 'Opponent life reached 0');
      else if (alive.length === 0) this.endGame(null, 'Both players at 0 life');
    }
  }

  // ── Phase 1: Resolve Effects (targeted) ─────────────────────
  resolveEffects(playerIndex, effects, sourceName, targets = []) {
    const player = this.state.players[playerIndex];

    effects.forEach(effect => {
      switch (effect.type) {

        case 'DRAW':
          this.drawCards(playerIndex, effect.amount);
          this.addLog(`${player.name} draws ${effect.amount} from ${sourceName}.`);
          break;

        case 'GAIN_LIFE':
          player.life += effect.amount;
          this.addLog(`${player.name} gains ${effect.amount} life from ${sourceName}.`);
          break;

        case 'LOSE_LIFE':
          player.life -= effect.amount;
          this.addLog(`${player.name} loses ${effect.amount} life from ${sourceName}.`);
          this.checkWinConditions();
          break;

        case 'SURVEIL':
          if (player.library.length > 0) {
            player.isSurveiling = true;
            player.surveilCard = player.library[player.library.length - 1];
            this.addLog(`${player.name} surveils ${effect.amount} from ${sourceName}.`);
          }
          break;

        case 'MILL': {
          const milled = player.library.splice(player.library.length - effect.amount, effect.amount);
          player.graveyard.push(...milled);
          this.addLog(`${player.name} mills ${effect.amount} from ${sourceName}.`);
          break;
        }

        case 'SCRY':
          if (player.library.length > 0) {
            player.isScrying = true;
            player.scryCard = player.library[player.library.length - 1];
            this.addLog(`${player.name} scries ${effect.amount} from ${sourceName}.`);
          }
          break;

        // Phase 2 – Ponder
        case 'LOOK_AND_REARRANGE': {
          const amt = effect.amount || 3;
          const cards = [];
          for (let i = 0; i < amt && player.library.length > 0; i++) {
            cards.push(player.library.pop());
          }
          player.ponderCards = cards;
          player.isRearrangingLibrary = true;
          player.ponderCanShuffle = effect.canShuffle || false;
          player.ponderThenDraw = effect.thenDraw || 0;
          this.addLog(`${player.name} looks at the top ${amt} cards of their library (${sourceName}).`);
          break;
        }

        // Phase 2 – Brainstorm
        case 'DRAW_AND_TOPDECK': {
          this.drawCards(playerIndex, effect.draw || 3);
          player.isBrainstorming = true;
          player.brainstormData = { putBack: effect.putBack || 2 };
          this.addLog(`${player.name} draws ${effect.draw} (${sourceName}), must put back ${effect.putBack}.`);
          break;
        }

        case 'DEAL_DAMAGE': {
          const amount = effect.amount;
          if (targets.length > 0) {
            targets.forEach(targetRef => {
              this._applyDamageToTarget(targetRef, amount, sourceName, playerIndex);
            });
          } else if (this.state.mode === '1v0') {
            this.state.virtualOpponent.life -= amount;
            this.addLog(`${sourceName} deals ${amount} to Goldfish.`);
          } else {
            const opp = this.state.players[this.getOpponentIndex(playerIndex)];
            opp.life -= amount;
            this.addLog(`${sourceName} deals ${amount} to ${opp.name}.`);
          }
          this.checkWinConditions();
          break;
        }

        case 'DESTROY': {
          if (targets.length > 0) {
            targets.forEach(targetRef => {
              this._destroyTarget(targetRef, sourceName);
            });
          }
          break;
        }

        case 'EXILE': {
          if (targets.length > 0) {
            targets.forEach(targetRef => {
              this._exileTarget(targetRef, sourceName, playerIndex);
            });
          }
          break;
        }

        case 'COUNTER_SPELL': {
          if (targets.length > 0) {
            const stackTarget = this.state.stack.find(s => s.instanceId === targets[0]);
            if (stackTarget) {
              this.state.stack = this.state.stack.filter(s => s.instanceId !== targets[0]);
              // Put it in graveyard
              const ownerPlayer = this.state.players[stackTarget.ownerIndex];
              if (ownerPlayer) ownerPlayer.graveyard.push(stackTarget.card);
              this.addLog(`${sourceName} counters ${stackTarget.card?.name || 'a spell'}.`);
            }
          }
          break;
        }

        case 'SHOW_AND_TELL': {
          // Set both players into "choose a permanent to put onto battlefield" mode
          this.state.players.forEach(p => {
            p.isShowAndTelling = true;
          });
          this.addLog(`Show and Tell: each player may put a permanent from their hand onto the battlefield.`);
          break;
        }

        case 'PUT_CREATURE_FROM_HAND': {
          // Handled via activate-ability action
          break;
        }

        case 'MURKTIDE_COUNTERS': {
          const bfCards = player.battlefield.filter(c => c.name === sourceName);
          if (bfCards.length > 0) {
            const card = bfCards[bfCards.length - 1];
            card.counters = card.counters || {};
            // Fake delve for now
            card.counters['+1/+1'] = (card.counters['+1/+1'] || 0) + 3;
            this.addLog(`${card.name} enters with 3 +1/+1 counters (Delve simulation).`);
          }
          break;
        }

        default:
          this.addLog(`[Unimplemented effect: ${effect.type}]`);
      }
    });
  }

  // ── Target application helpers ───────────────────────────────
  _destroyTarget(targetRef, sourceName) {
    for (const p of this.state.players) {
      const idx = p.battlefield.findIndex(c => c.instanceId === targetRef);
      if (idx !== -1) {
        const card = p.battlefield.splice(idx, 1)[0];
        p.graveyard.push(card);
        this.addLog(`${sourceName} destroys ${card.name}.`);
        return true;
      }
    }
    return false;
  }

  _applyDamageToTarget(targetRef, amount, sourceName, playerIndex) {
    // targetRef can be a player id or creature instanceId
    if (this.state.mode === '1v0' && targetRef === 'goldfish') {
      this.state.virtualOpponent.life -= amount;
      this.addLog(`${sourceName} deals ${amount} to Goldfish.`);
      return;
    }
    const targetPlayer = this.state.players.find(p => p.id === targetRef);
    if (targetPlayer) {
      targetPlayer.life -= amount;
      this.addLog(`${sourceName} deals ${amount} to ${targetPlayer.name}.`);
      return;
    }
    // Search battlefields for creature
    for (const p of this.state.players) {
      const card = p.battlefield.find(c => c.instanceId === targetRef);
      if (card) {
        card.damage = (card.damage || 0) + amount;
        this.addLog(`${sourceName} deals ${amount} to ${card.name}.`);
        this.checkDeaths();
        return;
      }
    }
  }

  _destroyTarget(targetRef, sourceName) {
    for (const p of this.state.players) {
      const idx = p.battlefield.findIndex(c => c.instanceId === targetRef);
      if (idx !== -1) {
        const [card] = p.battlefield.splice(idx, 1);
        p.graveyard.push(card);
        this.addLog(`${sourceName} destroys ${card.name}.`);
        return;
      }
    }
  }

  _exileTarget(targetRef, sourceName, _playerIndex) {
    for (const p of this.state.players) {
      // Check battlefield
      const bfIdx = p.battlefield.findIndex(c => c.instanceId === targetRef);
      if (bfIdx !== -1) {
        const [card] = p.battlefield.splice(bfIdx, 1);
        p.exile.push(card);
        this.addLog(`${sourceName} exiles ${card.name}.`);
        return;
      }
      // Check hand
      const hIdx = p.hand.findIndex(c => c.instanceId === targetRef);
      if (hIdx !== -1) {
        const [card] = p.hand.splice(hIdx, 1);
        p.exile.push(card);
        this.addLog(`${sourceName} exiles ${card.name} from hand.`);
        return;
      }
    }
  }

  // ── Phase 3: Alternate Cost Validation ──────────────────────
  _validateAndDeductAlternateCost(player, playerIndex, altCostDetails, card) {
    const alternateCosts = card.engineMetadata?.alternateCosts || [];
    if (alternateCosts.length === 0) throw new Error('This card has no alternate costs');

    const altCost = alternateCosts.find(a => a.id === altCostDetails.altCostId);
    if (!altCost) throw new Error(`Unknown alternate cost id: ${altCostDetails.altCostId}`);

    for (const cond of altCost.conditions) {
      switch (cond.type) {
        case 'PAY_LIFE': {
          if (player.life <= cond.amount) throw new Error(`Not enough life to pay alternate cost (need >${cond.amount})`);
          player.life -= cond.amount;
          this.addLog(`${player.name} pays ${cond.amount} life for alternate cost.`);
          break;
        }
        case 'EXILE_FROM_HAND': {
          // altCostDetails.exileCardInstanceId must be provided
          const { exileCardInstanceId } = altCostDetails;
          if (!exileCardInstanceId) throw new Error('Must specify a card to exile from hand');
          const hIdx = player.hand.findIndex(c => c.instanceId === exileCardInstanceId);
          if (hIdx === -1) throw new Error('Card to exile not found in hand');
          const exCard = player.hand[hIdx];
          if (cond.colorRequired) {
            const colors = exCard.colors || exCard.color_identity || [];
            const colorArr = Array.isArray(colors) ? colors : [];
            if (!colorArr.includes(cond.colorRequired)) {
              throw new Error(`Exiled card must be ${cond.colorRequired} colored`);
            }
          }
          player.hand.splice(hIdx, 1);
          player.exile.push(exCard);
          this.addLog(`${player.name} exiles ${exCard.name} from hand for alternate cost.`);
          break;
        }
        case 'RETURN_LAND_TO_HAND': {
          // altCostDetails.returnLandInstanceId must be provided
          const { returnLandInstanceId } = altCostDetails;
          if (!returnLandInstanceId) throw new Error('Must specify an Island to return');
          const bfIdx = player.battlefield.findIndex(c => c.instanceId === returnLandInstanceId);
          if (bfIdx === -1) throw new Error('Land not found on your battlefield');
          const land = player.battlefield[bfIdx];
          if (cond.subtypeRequired && !land.type_line?.includes(cond.subtypeRequired)) {
            throw new Error(`Returned land must be a ${cond.subtypeRequired}`);
          }
          player.battlefield.splice(bfIdx, 1);
          player.hand.push(land);
          this.addLog(`${player.name} returns ${land.name} to hand for alternate cost.`);
          break;
        }
        case 'UNKNOWN':
          this.addLog(`[Alternate cost condition not fully implemented: ${cond.raw}]`);
          break;
      }
    }
  }

  // ── Main Action Dispatcher ───────────────────────────────────
  handleAction(playerId, action) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) return { success: false, error: 'Player not found' };
    const player = this.state.players[playerIndex];

    try {
      // ---- Always-available actions ----
      if (action.type === 'concede') {
        this.endGame(this.getOpponentIndex(playerIndex), 'Opponent conceded');
        return { success: true };
      }

      if (this.state.phase === 'sideboarding') {
        if (action.type === 'submit-sideboard') {
          player.deck     = action.newMainDeck || player.deck;
          player.sideboard = action.newSideboard || player.sideboard;
          player.sideboardReady = true;
          if (this.state.mode === '1v0' || this.state.players.every(p => p.sideboardReady)) {
            this.initGame();
          }
          return { success: true };
        }
        return { success: false, error: 'In sideboarding phase' };
      }

      if (this.state.gameOver) return { success: false, error: 'Game is over' };

      switch (action.type) {

        // ── Mulligan ──────────────────────────────────────────
        case 'mulligan-keep': {
          if (this.state.phase !== 'mulligan') throw new Error('Not in mulligan phase');
          if (player.hasKeptHand) throw new Error('Already kept hand');

          if (player.mulliganCount > 0) {
            if (!action.bottomCards || action.bottomCards.length !== player.mulliganCount) {
              throw new Error(`Must specify ${player.mulliganCount} cards to bottom`);
            }
            action.bottomCards.forEach(iid => {
              const idx = player.hand.findIndex(c => c.instanceId === iid);
              if (idx !== -1) player.library.unshift(player.hand.splice(idx, 1)[0]);
            });
          }
          player.hasKeptHand = true;
          this.addLog(`${player.name} keeps their hand.`);
          if (this.state.players.every(p => p.hasKeptHand)) {
            this.state.phase = 'untap';
            this.handleAutoPhase();
          }
          return { success: true };
        }

        case 'mulligan-mulligan': {
          if (this.state.phase !== 'mulligan') throw new Error('Not in mulligan phase');
          if (player.hasKeptHand) throw new Error('Already kept hand');
          player.library.push(...player.hand);
          player.hand = [];
          this._shuffle(player.library);
          player.mulliganCount++;
          this.drawCards(playerIndex, 7);
          this.addLog(`${player.name} mulligans (count: ${player.mulliganCount}).`);
          return { success: true };
        }

        // ── Phase 1: Play Card → push to Stack ──────────────
        case 'play-card': {
          if (this.state.phase === 'mulligan') throw new Error('Must complete mulligan first');
          if (this.state.priorityPlayer !== playerIndex) throw new Error('You do not have priority');

          const cardIdx = player.hand.findIndex(c => c.instanceId === action.instanceId);
          if (cardIdx === -1) throw new Error('Card not in hand');
          const card = player.hand[cardIdx];

          const isLand = card.type_line?.includes('Land');

          if (isLand) {
            if (!['main1', 'main2'].includes(this.state.phase))
              throw new Error('Lands can only be played in main phases');
            if (this.state.activePlayer !== playerIndex)
              throw new Error('Lands can only be played on your turn');
            if (player.landsPlayedThisTurn >= player.maxLandsPerTurn)
              throw new Error('Max lands played this turn');

            player.hand.splice(cardIdx, 1);
            player.landsPlayedThisTurn++;
            card.tapped = card.engineMetadata?.entersTapped || false;
            card.damage = 0;
            player.battlefield.push(card);

            // ETB Surveil
            if (card.engineMetadata?.etbEffects?.some(e => e.type === 'SURVEIL')) {
              if (player.library.length > 0) {
                player.isSurveiling = true;
                player.surveilCard = player.library[player.library.length - 1];
              }
            }
            this.addLog(`${player.name} plays ${card.name}${card.tapped ? ' (tapped)' : ''}.`);
          } else {
            // Non-land: timing check
            const isInstant = card.type_line?.includes('Instant') || (card.keywords || []).includes('Flash');
            if (!isInstant) {
              if (!['main1', 'main2'].includes(this.state.phase))
                throw new Error('Non-instants can only be played in main phases');
              if (this.state.activePlayer !== playerIndex)
                throw new Error('Non-instants can only be played on your turn');
            }

            // Target validation (Phase 1)
            if (card.engineMetadata?.requiresTarget) {
              if (!action.targets || action.targets.length === 0) {
                throw new Error('This spell requires a target. Provide targets[] in your action.');
              }
            }

            // Cost: Alternate or Normal
            if (action.alternateCostDetails) {
              this._validateAndDeductAlternateCost(player, playerIndex, action.alternateCostDetails, card);
            } else if (card.mana_cost) {
              this.payMana(player, card.mana_cost);
            }

            player.hand.splice(cardIdx, 1);

            const isPermSpell = !card.type_line?.includes('Instant') && !card.type_line?.includes('Sorcery');

            // Push onto the stack (Phase 1)
            const stackEntry = {
              instanceId: card.instanceId,
              card,
              ownerIndex: playerIndex,
              targets: action.targets || [],
              isPermSpell,
            };
            this.state.stack.push(stackEntry);
            this.addLog(`${player.name} casts ${card.name}. (on stack)`);

            // Process cast triggers
            const isNonCreature = !card.type_line?.includes('Creature');
            player.battlefield.forEach(bfCard => {
              const castTriggers = bfCard.engineMetadata?.castTriggers || [];
              castTriggers.forEach(t => {
                if (t.type === 'SURVEIL' && t.condition === 'NONCREATURE' && isNonCreature) {
                  if (player.library.length > 0) {
                    player.isSurveiling = true;
                    player.surveilCard = player.library[player.library.length - 1];
                    this.addLog(`${bfCard.name} triggers Surveil ${t.amount}.`);
                  }
                }
              });
            });
          }
          return { success: true };
        }

        // ── Phase 1: Resolve Top of Stack ────────────────────
        case 'resolve-top-of-stack': {
          if (this.state.stack.length === 0) throw new Error('Stack is empty');
          // Priority check: only active player or if opponent is passing
          const top = this.state.stack.pop();
          const ownerPlayer = this.state.players[top.ownerIndex];
          const card = top.card;

          if (top.isPermSpell) {
            // Permanent → goes to battlefield
            card.tapped = card.engineMetadata?.entersTapped || false;
            card.summoningSick = card.type_line?.includes('Creature') && !(card.keywords || []).includes('Haste');
            card.damage = 0;
            ownerPlayer.battlefield.push(card);
            this.addLog(`${card.name} resolves and enters the battlefield.`);
            // ETB effects
            if (card.engineMetadata?.etbEffects?.length > 0) {
              this.resolveEffects(top.ownerIndex, card.engineMetadata.etbEffects, card.name, top.targets);
            }
          } else {
            // Instant / Sorcery → goes to graveyard
            ownerPlayer.graveyard.push(card);
            this.addLog(`${card.name} resolves.`);
            if (card.engineMetadata?.spellEffects?.length > 0) {
              this.resolveEffects(top.ownerIndex, card.engineMetadata.spellEffects, card.name, top.targets);
            }
          }
          return { success: true };
        }

        // ── Phase 2: Resolve Ponder ─────────────────────────
        case 'resolve-rearrange': {
          if (!player.isRearrangingLibrary) throw new Error('Not currently rearranging library');
          // action.newOrder = array of instanceIds in desired order (top = last element)
          const { newOrder, shuffle } = action;

          if (shuffle && player.ponderCanShuffle) {
            // Shuffle back the ponder cards into library
            const ponderCards = player.ponderCards;
            player.library.push(...ponderCards);
            this._shuffle(player.library);
            this.addLog(`${player.name} shuffles their library after Ponder.`);
          } else {
            // Put back in specified order (newOrder[0] goes deepest, last goes on top)
            const ordered = newOrder
              .map(iid => player.ponderCards.find(c => c.instanceId === iid))
              .filter(Boolean);
            // Push so ordered[last] is at top (pop position)
            player.library.push(...ordered);
            this.addLog(`${player.name} arranges the top cards of their library.`);
          }

          player.isRearrangingLibrary = false;
          player.ponderCards = [];
          player.ponderCanShuffle = false;

          if (player.ponderThenDraw > 0) {
            this.drawCards(playerIndex, player.ponderThenDraw);
            this.addLog(`${player.name} draws ${player.ponderThenDraw} card(s).`);
            player.ponderThenDraw = 0;
          }
          return { success: true };
        }

        // ── Phase 2: Resolve Brainstorm ──────────────────────
        case 'resolve-brainstorm': {
          if (!player.isBrainstorming) throw new Error('Not currently brainstorming');
          const { topdeckCards } = action; // array of instanceIds to put back on top
          const putBack = player.brainstormData?.putBack ?? 2;
          if (!topdeckCards || topdeckCards.length !== putBack) {
            throw new Error(`Must select exactly ${putBack} cards to put on top`);
          }
          // Place in reverse so first item in array ends up deepest of the two
          [...topdeckCards].reverse().forEach(iid => {
            const idx = player.hand.findIndex(c => c.instanceId === iid);
            if (idx === -1) throw new Error(`Card ${iid} not in hand`);
            const [card] = player.hand.splice(idx, 1);
            player.library.push(card); // push = top (since library.pop() = draw)
          });
          this.addLog(`${player.name} puts ${putBack} cards on top of their library (Brainstorm).`);
          player.isBrainstorming = false;
          player.brainstormData = null;
          return { success: true };
        }

        // ── Phase 4: Resolve Delver Reveal ───────────────────
        case 'resolve-reveal': {
          if (!player.isRevealingTopCard) throw new Error('Not currently revealing');
          player.isRevealingTopCard = false;
          player.revealedCard = null;
          // Advance phase if we were paused on upkeep
          if (this.state.phase === 'upkeep') this.advancePhase();
          return { success: true };
        }

        // ── Phase 4: Activate Ability ────────────────────────
        case 'activate-ability': {
          // action.instanceId = permanent on battlefield
          // action.abilityId  = id from engineMetadata.activatedAbilities
          // action.targets    = optional targets
          const bfCard = player.battlefield.find(c => c.instanceId === action.instanceId);
          if (!bfCard) throw new Error('Card not found on battlefield');

          const ability = (bfCard.engineMetadata?.activatedAbilities || [])
            .find(a => a.id === action.abilityId);
          if (!ability) throw new Error(`Ability ${action.abilityId} not found`);

          // Pay cost
          if (ability.costType === 'TAP') {
            if (bfCard.tapped) throw new Error('Card is already tapped');
            bfCard.tapped = true;
          } else if (ability.costType === 'TAP_AND_SACRIFICE') {
            if (bfCard.tapped) throw new Error('Card is already tapped');
            const bfIdx = player.battlefield.findIndex(c => c.instanceId === action.instanceId);
            player.battlefield.splice(bfIdx, 1);
            player.graveyard.push(bfCard);
          } else if (ability.costType === 'PAY_LIFE') {
            if (player.life <= ability.costAmount) throw new Error(`Not enough life (need >${ability.costAmount})`);
            player.life -= ability.costAmount;
            this.addLog(`${player.name} pays ${ability.costAmount} life.`);
          } else if (ability.costType === 'MANA') {
            this.payMana(player, ability.cost);
          }

          // Execute effect
          const eff = ability.effect;

          if (eff.type === 'PUT_CREATURE_FROM_HAND') {
            // Sneak Attack – pick a creature from hand
            const { creatureInstanceId } = action;
            if (!creatureInstanceId) throw new Error('Must specify creatureInstanceId to put onto battlefield');
            const hIdx = player.hand.findIndex(c => c.instanceId === creatureInstanceId);
            if (hIdx === -1) throw new Error('Creature not in hand');
            const creature = player.hand.splice(hIdx, 1)[0];
            if (!creature.type_line?.includes('Creature')) throw new Error('Must target a creature card');

            // Add Haste
            creature.keywords = [...(creature.keywords || []), eff.gainKeyword || 'Haste'];
            creature.summoningSick = false;
            creature.tapped = false;
            creature.damage = 0;
            player.battlefield.push(creature);
            this.addLog(`${player.name} sneaks ${creature.name} onto the battlefield with Haste (Sneak Attack).`);

            // Register delayed sacrifice trigger
            if (eff.endStepTrigger) {
              this.state.delayedTriggers.push({
                type: eff.endStepTrigger.type,
                instanceId: creature.instanceId,
                ownerIndex: playerIndex,
                onPhase: 'end_step',
              });
              this.addLog(`${creature.name} will be sacrificed at the next end step.`);
            }

          } else if (eff.type === 'VIAL_PUT_CREATURE') {
            // Aether Vial – put a creature with CMC = charge counters
            const charges = bfCard.counters?.charge || 0;
            const { creatureInstanceId } = action;
            if (!creatureInstanceId) throw new Error('Must specify creatureInstanceId');
            const hIdx = player.hand.findIndex(c => c.instanceId === creatureInstanceId);
            if (hIdx === -1) throw new Error('Creature not in hand');
            const creature = player.hand[hIdx];
            if (!creature.type_line?.includes('Creature')) throw new Error('Must target a creature');
            if (parseInt(creature.cmc) !== charges) {
              throw new Error(`Creature CMC (${creature.cmc}) must equal charge counters (${charges})`);
            }
            player.hand.splice(hIdx, 1);
            creature.summoningSick = false;
            creature.tapped = false;
            creature.damage = 0;
            player.battlefield.push(creature);
            this.addLog(`${player.name} puts ${creature.name} onto the battlefield via Aether Vial (${charges} counters).`);

          } else if (eff.type === 'DRAW') {
            this.drawCards(playerIndex, eff.amount || 1);
            this.addLog(`${player.name} draws ${eff.amount} from ${bfCard.name}.`);
          } else if (eff.type === 'ADD_MANA') {
            const color = eff.color === 'ANY' ? (action.color || 'C') : eff.color;
            player.manaPool[color] = (player.manaPool[color] || 0) + eff.amount;
            this.addLog(`${player.name} adds ${eff.amount}${color} from ${bfCard.name}.`);
          } else if (eff.type === 'DESTROY') {
            if (!action.targets || action.targets.length === 0) throw new Error('No target specified');
            this._destroyTarget(action.targets[0], bfCard.name);
          }

          return { success: true };
        }

        // ── Show and Tell resolution ──────────────────────────
        case 'resolve-show-and-tell': {
          // action.permanentInstanceId = card to put from hand; null = pass
          if (!player.isShowAndTelling) throw new Error('Not in Show and Tell');
          if (action.permanentInstanceId) {
            const hIdx = player.hand.findIndex(c => c.instanceId === action.permanentInstanceId);
            if (hIdx === -1) throw new Error('Card not in hand');
            const perm = player.hand.splice(hIdx, 1)[0];
            perm.tapped = perm.engineMetadata?.entersTapped || false;
            perm.summoningSick = perm.type_line?.includes('Creature') && !(perm.keywords || []).includes('Haste');
            perm.damage = 0;
            player.battlefield.push(perm);
            this.addLog(`${player.name} puts ${perm.name} onto the battlefield (Show and Tell).`);
            // ETB effects
            if (perm.engineMetadata?.etbEffects?.length > 0) {
              this.resolveEffects(playerIndex, perm.engineMetadata.etbEffects, perm.name, []);
            }
          }
          player.isShowAndTelling = false;
          return { success: true };
        }

        // ── Land tap ─────────────────────────────────────────
        case 'tap-land': {
          const land = player.battlefield.find(c => c.instanceId === action.instanceId);
          if (!land) throw new Error('Land not on battlefield');

          if (land.engineMetadata?.isFetchLand) {
            if (player.life <= 1) throw new Error('Not enough life to activate fetch');
            player.life -= 1;
            const lIdx = player.battlefield.findIndex(c => c.instanceId === action.instanceId);
            player.graveyard.push(player.battlefield.splice(lIdx, 1)[0]);
            player.isSearchingLibrary = true;
            player.searchCriteria = land.engineMetadata.fetchTypes;
            this.addLog(`${player.name} activates ${land.name}, pays 1 life.`);
            return { success: true };
          }

          if (land.tapped) throw new Error('Land is already tapped');
          land.tapped = true;

          let colorAdded = action.color;
          if (!colorAdded && land.engineMetadata?.manaAbilities?.length > 0) {
            colorAdded = land.engineMetadata.manaAbilities[0];
          } else if (!colorAdded) {
            colorAdded = 'C';
          }
          if (land.engineMetadata?.manaAbilities && land.engineMetadata.manaAbilities.length > 0 &&
              !land.engineMetadata.manaAbilities.includes(colorAdded)) {
            throw new Error(`This land cannot produce ${colorAdded} mana`);
          }

          const amount = land.engineMetadata?.manaProducedAmount || 1;
          player.manaPool[colorAdded] = (player.manaPool[colorAdded] || 0) + amount;
          this.addLog(`${player.name} taps ${land.name} for ${amount}${colorAdded}.`);
          return { success: true };
        }

        // ── Library search ───────────────────────────────────
        case 'resolve-library-search': {
          if (!player.isSearchingLibrary) throw new Error('Not searching library');
          if (action.targetInstanceId) {
            const cIdx = player.library.findIndex(c => c.instanceId === action.targetInstanceId);
            if (cIdx === -1) throw new Error('Card not in library');
            const found = player.library[cIdx];
            if (player.searchCriteria) {
              const valid = player.searchCriteria.some(t => found.type_line?.includes(t));
              if (!valid) throw new Error(`Must find: ${player.searchCriteria.join(' or ')}`);
            }
            player.library.splice(cIdx, 1);
            found.tapped = false;
            player.battlefield.push(found);
            this.addLog(`${player.name} fetches ${found.name}.`);
          } else {
            this.addLog(`${player.name} fails to find.`);
          }
          player.isSearchingLibrary = false;
          player.searchCriteria = null;
          this._shuffle(player.library);
          this.addLog(`${player.name} shuffles.`);
          return { success: true };
        }

        // ── Surveil ──────────────────────────────────────────
        case 'resolve-surveil': {
          if (!player.isSurveiling) throw new Error('Not surveiling');
          const topCard = player.library.pop();
          if (action.keepOnTop) {
            player.library.push(topCard);
            this.addLog(`${player.name} keeps card on top.`);
          } else {
            player.graveyard.push(topCard);
            this.addLog(`${player.name} puts card in graveyard.`);
          }
          player.isSurveiling = false;
          player.surveilCard = null;
          return { success: true };
        }

        // ── Scry ─────────────────────────────────────────────
        case 'resolve-scry': {
          if (!player.isScrying) throw new Error('Not scrying');
          const topCard = player.library.pop();
          if (action.keepOnTop) {
            player.library.push(topCard);
            this.addLog(`${player.name} keeps card on top (Scry).`);
          } else {
            player.library.unshift(topCard);
            this.addLog(`${player.name} puts card on bottom (Scry).`);
          }
          player.isScrying = false;
          player.scryCard = null;
          return { success: true };
        }

        // ── Combat ───────────────────────────────────────────
        case 'declare-attackers': {
          if (this.state.phase !== 'combat_attackers') throw new Error('Not attacker phase');
          if (this.state.activePlayer !== playerIndex) throw new Error('Not your turn');
          action.attackers.forEach(attId => {
            const c = player.battlefield.find(card => card.instanceId === attId);
            if (!c) throw new Error(`${attId} not found`);
            if (c.tapped) throw new Error(`${c.name} is tapped`);
            if (c.summoningSick) throw new Error(`${c.name} has summoning sickness`);
            if ((c.keywords || []).includes('Defender')) throw new Error(`${c.name} has Defender`);
            if (!(c.keywords || []).includes('Vigilance')) c.tapped = true;
            this.state.combatState.attackers.push({ instanceId: attId, attackerIndex: playerIndex });
          });
          this.addLog(`${player.name} declares ${action.attackers.length} attacker(s).`);
          this.advancePhase();
          return { success: true };
        }

        case 'declare-blockers': {
          if (this.state.phase !== 'combat_blockers') throw new Error('Not blocker phase');
          if (this.state.activePlayer === playerIndex) throw new Error('Active player cannot block');

          const tempBlockers = [];
          action.blockers.forEach(b => {
            const blocker = player.battlefield.find(c => c.instanceId === b.blockerInstanceId);
            if (!blocker) throw new Error(`${b.blockerInstanceId} not found`);
            if (blocker.tapped) throw new Error(`${blocker.name} is tapped`);

            let blockInfo = tempBlockers.find(x => x.attackerInstanceId === b.attackerInstanceId);
            if (!blockInfo) {
              blockInfo = { attackerInstanceId: b.attackerInstanceId, blockerInstanceIds: [] };
              tempBlockers.push(blockInfo);
            }
            blockInfo.blockerInstanceIds.push(b.blockerInstanceId);

            const attackerCard = this.state.players[this.state.activePlayer].battlefield.find(c => c.instanceId === b.attackerInstanceId);
            if (attackerCard && (attackerCard.keywords || []).includes('Flying')) {
              if (!(blocker.keywords || []).includes('Flying') && !(blocker.keywords || []).includes('Reach')) {
                throw new Error(`${blocker.name} cannot block flying ${attackerCard.name}`);
              }
            }
          });

          tempBlockers.forEach(b => {
            const attacker = this.state.players[this.state.activePlayer].battlefield.find(c => c.instanceId === b.attackerInstanceId);
            if (attacker && (attacker.keywords || []).includes('Menace') && b.blockerInstanceIds.length < 2) {
              throw new Error(`${attacker.name} has Menace – must be blocked by 2+ creatures`);
            }
          });

          this.state.combatState.blockers = tempBlockers;
          this.addLog(`${player.name} declares blockers.`);
          this.advancePhase();
          return { success: true };
        }

        case 'discard': {
          const dIdx = player.hand.findIndex(c => c.instanceId === action.cardInstanceId);
          if (dIdx === -1) throw new Error('Card not in hand');
          const [disc] = player.hand.splice(dIdx, 1);
          player.graveyard.push(disc);
          this.addLog(`${player.name} discards ${disc.name}.`);
          return { success: true };
        }

        case 'next-phase':
        case 'pass-priority':
        case 'pass': {
          if (this.state.phase === 'mulligan') return { success: false, error: 'Complete mulligan first' };
          if (this.state.activePlayer === playerIndex || this.state.mode === '1v0') {
            this.advancePhase();
            this.addLog(`${player.name} passes.`);
            return { success: true };
          }
          return { success: false, error: 'Not your turn' };
        }

        default:
          return { success: false, error: `Unknown action: ${action.type}` };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ── Mana payment ────────────────────────────────────────────
  payMana(player, manaCostStr) {
    const regex = /\{([^}]+)\}/g;
    let match;
    const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };

    while ((match = regex.exec(manaCostStr)) !== null) {
      const sym = match[1];
      if (!isNaN(parseInt(sym, 10))) {
        cost.generic += parseInt(sym, 10);
      } else if (sym === 'X') {
        // X costs are 0 for now
      } else if (sym.includes('/')) {
        // Phyrexian / Hybrid – simplified: treat first part as colored
        const first = sym.split('/')[0];
        if (cost[first] !== undefined) cost[first]++;
        else cost.generic++;
      } else if (cost[sym] !== undefined) {
        cost[sym]++;
      }
    }

    for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      if ((player.manaPool[c] || 0) < cost[c]) throw new Error(`Not enough ${c} mana`);
    }

    let availableForGeneric = 0;
    for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) {
      availableForGeneric += (player.manaPool[c] || 0) - cost[c];
    }
    if (availableForGeneric < cost.generic) throw new Error('Not enough mana for generic cost');

    for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) player.manaPool[c] -= cost[c];

    let remaining = cost.generic;
    for (const c of ['C', 'G', 'R', 'B', 'U', 'W']) {
      if (remaining <= 0) break;
      const deduct = Math.min(player.manaPool[c] || 0, remaining);
      player.manaPool[c] -= deduct;
      remaining -= deduct;
    }
  }
}
