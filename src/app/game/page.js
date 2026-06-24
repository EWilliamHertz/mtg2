'use client';

import React, {
  useEffect, useState, useCallback, useRef, Suspense
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import styles from './page.module.css';

import PhaseTracker   from '@/components/PhaseTracker';
import ManaPool       from '@/components/ManaPool';
import LifeCounter    from '@/components/LifeCounter';
import Hand           from '@/components/Hand';
import Battlefield    from '@/components/Battlefield';
import StackView      from '@/components/StackView';
import ZoneOverlay    from '@/components/ZoneOverlay';
import GameLog        from '@/components/GameLog';

// ─── tiny helpers ──────────────────────────────────────────────
const IMG = (uri) =>
  uri
    ? `/api/image-proxy?url=${encodeURIComponent(uri)}`
    : 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg';

// ─── Bottoming Interface ───────────────────────────────────────
function BottomingInterface({ hand, count, onConfirm }) {
  const [selected, setSelected] = useState([]);
  const toggle = (id) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  return (
    <div className={styles.modalBody}>
      <p className={styles.modalSubtitle}>
        Select <span className={styles.accent}>{count}</span> cards to put on the bottom.
      </p>
      <div className={styles.cardRow}>
        {hand.map(card => (
          <div
            key={card.instanceId}
            className={`${styles.selCard} ${selected.includes(card.instanceId) ? styles.selCardActive : ''}`}
            onClick={() => toggle(card.instanceId)}
          >
            <img src={IMG(card.image_uri)} alt={card.name || 'Card'} />
            {selected.includes(card.instanceId) && (
              <div className={styles.selBadge}>✓</div>
            )}
          </div>
        ))}
      </div>
      <button
        className={styles.primaryBtn}
        disabled={selected.length !== count}
        onClick={() => onConfirm(selected)}
      >
        Confirm ({selected.length}/{count})
      </button>
    </div>
  );
}

// ─── Ponder Drag-and-Drop Rearrange Modal ─────────────────────
function PonderModal({ cards, canShuffle, onConfirm, onShuffle }) {
  const [order, setOrder] = useState(cards.map(c => c.instanceId));
  const dragIdx = useRef(null);

  const handleDragStart = (e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  };
  const handleDragEnd = () => { dragIdx.current = null; };

  const ordered = order.map(id => cards.find(c => c.instanceId === id)).filter(Boolean);

  return (
    <div className={styles.ponderModal}>
      <div className={styles.ponderGlow} />
      <h2 className={styles.modalTitle}>
        <span className={styles.spellIcon}>🔮</span> Ponder
      </h2>
      <p className={styles.modalSubtitle}>
        Drag cards to set the order. The <span className={styles.accent}>rightmost</span> card will be on top.
      </p>
      <div className={styles.ponderRow}>
        {ordered.map((card, idx) => (
          <div
            key={card.instanceId}
            className={styles.ponderCard}
            draggable
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
          >
            <img src={IMG(card.image_uri)} alt={card.name} />
            <div className={styles.ponderLabel}>
              {idx === ordered.length - 1 ? '▲ TOP' : `${idx + 1}`}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.btnRow}>
        {canShuffle && (
          <button className={styles.secondaryBtn} onClick={onShuffle}>
            🔀 Shuffle Instead
          </button>
        )}
        <button
          className={styles.primaryBtn}
          onClick={() => onConfirm(order)}
        >
          ✓ Confirm Order
        </button>
      </div>
    </div>
  );
}

// ─── Brainstorm Put-Back Modal ────────────────────────────────
function BrainstormModal({ hand, putBack, onConfirm }) {
  const [selected, setSelected] = useState([]);
  const toggle = (id) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  return (
    <div className={styles.brainstormModal}>
      <div className={styles.brainstormGlow} />
      <h2 className={styles.modalTitle}>
        <span className={styles.spellIcon}>🌊</span> Brainstorm
      </h2>
      <p className={styles.modalSubtitle}>
        Select <span className={styles.accent}>{putBack}</span> cards to put back on top of your library.
      </p>
      <div className={styles.cardRow}>
        {hand.map(card => (
          <div
            key={card.instanceId}
            className={`${styles.selCard} ${selected.includes(card.instanceId) ? styles.selCardActive : ''}`}
            onClick={() => toggle(card.instanceId)}
          >
            <img src={IMG(card.image_uri)} alt={card.name || 'Card'} />
            {selected.includes(card.instanceId) && (
              <div className={styles.selBadge}>↑</div>
            )}
          </div>
        ))}
      </div>
      <button
        className={styles.primaryBtn}
        disabled={selected.length !== putBack}
        onClick={() => onConfirm(selected)}
      >
        Put Back ({selected.length}/{putBack})
      </button>
    </div>
  );
}

// ─── Delver Reveal Modal ──────────────────────────────────────
function DelverRevealModal({ revealedCard, onDismiss }) {
  const isFlip =
    revealedCard?.type_line?.includes('Instant') ||
    revealedCard?.type_line?.includes('Sorcery');
  return (
    <div className={styles.delverModal}>
      <div className={styles.delverGlow} />
      <h2 className={styles.modalTitle}>
        <span className={styles.spellIcon}>🧬</span> Delver of Secrets — Upkeep Trigger
      </h2>
      <p className={styles.modalSubtitle}>
        Top card of your library is revealed:
      </p>
      <div className={styles.delverReveal}>
        <div className={`${styles.delverCard} ${isFlip ? styles.delverFlip : ''}`}>
          <img src={IMG(revealedCard?.image_uri)} alt={revealedCard?.name || 'Card'} />
        </div>
        {isFlip ? (
          <div className={styles.delverResult}>
            <span className={styles.transformBadge}>⚡ TRANSFORMS!</span>
            <p>{revealedCard.name} is an Instant/Sorcery.</p>
            <p>Delver becomes <strong>Insectile Aberration (3/2 Flying)</strong>.</p>
          </div>
        ) : (
          <div className={styles.delverResult}>
            <span className={styles.noFlipBadge}>No flip this turn</span>
            <p>{revealedCard?.name} is not an Instant or Sorcery.</p>
          </div>
        )}
      </div>
      <button className={styles.primaryBtn} onClick={onDismiss}>
        Continue
      </button>
    </div>
  );
}

// ─── Targeting Mode Banner ────────────────────────────────────
function TargetingBanner({ card, onCancel }) {
  return (
    <div className={styles.targetBanner}>
      <span className={styles.targetPulse} />
      <span>
        Select a target for <strong>{card?.name}</strong>
        {' '}— click a creature, player life, or spell on the stack
      </span>
      <button className={styles.cancelBtn} onClick={onCancel}>✕ Cancel</button>
    </div>
  );
}

// ─── Stack Resolve Banner ─────────────────────────────────────
function StackBanner({ stack, onResolve }) {
  if (!stack || stack.length === 0) return null;
  const top = stack[stack.length - 1];
  return (
    <div className={styles.stackBanner}>
      <span className={styles.stackCount}>{stack.length}</span>
      <span>Stack: <strong>{top.card?.name}</strong></span>
      <button className={styles.resolveBtn} onClick={onResolve}>
        ✓ Resolve Top
      </button>
    </div>
  );
}

// ─── Alternate Cost Picker ────────────────────────────────────
function AltCostModal({ card, player, onConfirm, onCancel }) {
  const altCosts = card?.engineMetadata?.alternateCosts || [];
  const [chosenAlt, setChosenAlt] = useState(null);
  const [exileCardId, setExileCardId] = useState(null);
  const [returnLandId, setReturnLandId] = useState(null);

  if (altCosts.length === 0) return null;

  return (
    <div className={styles.altCostModal}>
      <h2 className={styles.modalTitle}>⚗️ Alternate Cost — {card.name}</h2>
      <p className={styles.modalSubtitle}>Choose how to pay:</p>
      <div className={styles.altCostOptions}>
        <button
          className={`${styles.altCostBtn} ${chosenAlt === 'normal' ? styles.altCostBtnActive : ''}`}
          onClick={() => setChosenAlt('normal')}
        >
          Pay normal mana cost: {card.mana_cost}
        </button>
        {altCosts.map(alt => (
          <button
            key={alt.id}
            className={`${styles.altCostBtn} ${chosenAlt === alt.id ? styles.altCostBtnActive : ''}`}
            onClick={() => setChosenAlt(alt.id)}
          >
            {alt.description}
          </button>
        ))}
      </div>

      {/* Sub-selection for Force of Will alt */}
      {chosenAlt === 'force_of_will_alt' && (
        <div>
          <p className={styles.modalSubtitle}>Select a blue card from hand to exile:</p>
          <div className={styles.cardRow}>
            {player.hand
              .filter(c => (Array.isArray(c.colors) ? c.colors : []).includes('U'))
              .map(c => (
                <div
                  key={c.instanceId}
                  className={`${styles.selCard} ${exileCardId === c.instanceId ? styles.selCardActive : ''}`}
                  onClick={() => setExileCardId(c.instanceId)}
                >
                  <img src={IMG(c.image_uri)} alt={c.name} />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Sub-selection for Daze alt */}
      {chosenAlt === 'daze_alt' && (
        <div>
          <p className={styles.modalSubtitle}>Select an Island to return to hand:</p>
          <div className={styles.cardRow}>
            {player.battlefield
              .filter(c => c.type_line?.includes('Island'))
              .map(c => (
                <div
                  key={c.instanceId}
                  className={`${styles.selCard} ${returnLandId === c.instanceId ? styles.selCardActive : ''}`}
                  onClick={() => setReturnLandId(c.instanceId)}
                >
                  <img src={IMG(c.image_uri)} alt={c.name} />
                </div>
              ))}
          </div>
        </div>
      )}

      <div className={styles.btnRow}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          className={styles.primaryBtn}
          disabled={!chosenAlt}
          onClick={() => {
            if (chosenAlt === 'normal') {
              onConfirm({ useNormal: true });
            } else {
              onConfirm({
                altCostId: chosenAlt,
                exileCardInstanceId: exileCardId,
                returnLandInstanceId: returnLandId,
              });
            }
          }}
        >
          Cast!
        </button>
      </div>
    </div>
  );
}

// ─── Show and Tell Modal ──────────────────────────────────────
function ShowAndTellModal({ hand, onConfirm }) {
  const [chosen, setChosen] = useState(null);
  const permanents = hand.filter(c =>
    !c.type_line?.includes('Instant') && !c.type_line?.includes('Sorcery')
  );
  return (
    <div className={styles.satModal}>
      <h2 className={styles.modalTitle}>🎪 Show and Tell</h2>
      <p className={styles.modalSubtitle}>
        Choose a permanent to put onto the battlefield (or pass).
      </p>
      <div className={styles.cardRow}>
        {permanents.map(c => (
          <div
            key={c.instanceId}
            className={`${styles.selCard} ${chosen === c.instanceId ? styles.selCardActive : ''}`}
            onClick={() => setChosen(c.instanceId)}
          >
            <img src={IMG(c.image_uri)} alt={c.name} />
          </div>
        ))}
      </div>
      <div className={styles.btnRow}>
        <button className={styles.secondaryBtn} onClick={() => onConfirm(null)}>
          Pass
        </button>
        <button
          className={styles.primaryBtn}
          onClick={() => onConfirm(chosen)}
        >
          Put Onto Battlefield
        </button>
      </div>
    </div>
  );
}

// ─── Activated Abilities Modal ────────────────────────────────
function ActivatedAbilitiesModal({ card, onConfirm, onCancel, tapLand }) {
  const abilities = card?.engineMetadata?.activatedAbilities || [];
  const isLand = card?.type_line?.includes('Land');
  const isFetch = card?.engineMetadata?.isFetchLand;
  
  if (abilities.length === 0 && !isLand) return null;

  return (
    <div className={styles.altCostModal}>
      <h2 className={styles.modalTitle}>⚡ Abilities — {card?.name}</h2>
      <div className={styles.altCostOptions}>
        {isLand && (
          <button className={styles.altCostBtn} onClick={tapLand}>
            {isFetch ? 'Pay 1 life, Sacrifice: Fetch Land' : 'Tap for Mana'}
          </button>
        )}
        {abilities.map(ab => (
          <button key={ab.id} className={styles.altCostBtn} onClick={() => onConfirm(ab)}>
            {ab.description || `Activate ${ab.id}`}
          </button>
        ))}
      </div>
      <div className={styles.btnRow}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main Game Component ───────────────────────────────────────
function GameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId  = searchParams?.get('gameId')   || 'test-game';
  const playerId = searchParams?.get('playerId') || 'player-1';
  const { socket, isConnected } = useSocket();

  const [gameState,    setGameState]    = useState(null);
  const [logs,         setLogs]         = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [attackers,    setAttackers]    = useState([]);
  const [blockers,     setBlockers]     = useState([]);
  const [zoneOverlay,  setZoneOverlay]  = useState(null);
  const [mulliganState, setMulliganState] = useState(null);
  const [gameOver,     setGameOver]     = useState(null);
  const [previewCard,  setPreviewCard]  = useState(null);
  const previewTimer = useRef(null);

  // Targeting mode
  const [targetingCard, setTargetingCard] = useState(null); // card object waiting for target
  // Alternate cost modal
  const [altCostCard, setAltCostCard] = useState(null);
  // Activated abilities modal
  const [activatedAbilityCard, setActivatedAbilityCard] = useState(null);

  // ── Hover preview ──────────────────────────────────────────
  const handleGlobalHover = useCallback((card) => {
    if (!card) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewCard(card), 800);
  }, []);

  const handleGlobalLeave = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewCard(null);
  }, []);

  // ── Socket wiring ──────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isConnected || !gameId || !playerId) return;
    socket.emit('join-game', { gameId, playerId });

    const handleGameStart = (data) => {
      const state = data.state || data;
      setGameState(state);
      const me = state.players?.find(p => p.id === playerId);
      if (state.phase === 'mulligan' && me && !me.hasKeptHand) setMulliganState('decision');
      setLogs([{ id: Date.now(), text: 'Game started!' }]);
    };

    const handleGameUpdate = (newState) => {
      setGameState(newState);
      if (newState.log?.length) setLogs(newState.log.map(l => ({ id: l.time, text: l.message })));
      const me = newState.players?.find(p => p.id === playerId);
      if (newState.phase === 'mulligan' && me && !me.hasKeptHand) {
        setMulliganState('decision');
      } else if (newState.phase !== 'mulligan') {
        setMulliganState(null);
      }
      if (newState.winner) setGameOver(newState.winner === playerId ? 'victory' : 'defeat');
    };

    const handleGameOver = (result) => {
      setGameOver(result?.winner === playerId ? 'victory' : 'defeat');
    };

    const handleError = (msg) => {
      console.error('Server error:', msg);
      if (msg === 'Game not found') router.push('/');
    };

    socket.on('game-start',  handleGameStart);
    socket.on('game-update', handleGameUpdate);
    socket.on('game-over',   handleGameOver);
    socket.on('error',       handleError);

    return () => {
      socket.off('game-start',  handleGameStart);
      socket.off('game-update', handleGameUpdate);
      socket.off('game-over',   handleGameOver);
      socket.off('error',       handleError);
    };
  }, [socket, isConnected, gameId, playerId, router]);

  // ── Action dispatcher ──────────────────────────────────────
  const handleAction = useCallback((type, payload = {}) => {
    if (!socket) return;
    socket.emit('game-action', { gameId, playerId, type, ...payload });
  }, [socket, gameId, playerId]);

  // ── Play card (with Phase 1 targeting + Phase 3 alt cost) ──
  const playCard = useCallback((card) => {
    handleGlobalLeave();
    const meta = card.engineMetadata;

    // Check for alternate costs first
    const hasAltCost = meta?.alternateCosts?.length > 0;
    if (hasAltCost) {
      setAltCostCard(card);
      setSelectedCard(null);
      return;
    }

    // Check for required targeting
    if (meta?.requiresTarget) {
      setTargetingCard(card);
      setSelectedCard(null);
      return;
    }

    handleAction('play-card', { instanceId: card.instanceId });
    setSelectedCard(null);
  }, [handleAction, handleGlobalLeave]);

  const confirmAltCost = useCallback((altCostDetails) => {
    const card = altCostCard;
    if (!card) return;
    setAltCostCard(null);

    if (altCostDetails.useNormal) {
      // Check if targeting still needed
      if (card.engineMetadata?.requiresTarget) {
        setTargetingCard(card);
        return;
      }
      handleAction('play-card', { instanceId: card.instanceId });
    } else {
      if (card.engineMetadata?.requiresTarget) {
        // Need to collect target too, store alt cost
        setTargetingCard({ ...card, _pendingAltCost: altCostDetails });
        return;
      }
      handleAction('play-card', { instanceId: card.instanceId, alternateCostDetails: altCostDetails });
    }
  }, [altCostCard, handleAction]);

  // When a target is clicked
  const handleTargetClick = useCallback((targetRef) => {
    if (!targetingCard) return;
    
    // Check if targeting for an activated ability
    if (targetingCard._pendingAbilityId) {
      handleAction('activate-ability', {
        instanceId: targetingCard.instanceId,
        abilityId: targetingCard._pendingAbilityId,
        targets: [targetRef]
      });
      setTargetingCard(null);
      return;
    }

    const altCostDetails = targetingCard._pendingAltCost || null;
    handleAction('play-card', {
      instanceId: targetingCard.instanceId,
      targets: [targetRef],
      ...(altCostDetails ? { alternateCostDetails: altCostDetails } : {}),
    });
    setTargetingCard(null);
  }, [targetingCard, handleAction]);

  const tapLand = useCallback((instanceId) => {
    handleGlobalLeave();
    handleAction('tap-land', { instanceId });
    setActivatedAbilityCard(null);
  }, [handleAction, handleGlobalLeave]);

  const confirmActivateAbility = useCallback((ability) => {
    const card = activatedAbilityCard;
    if (!card) return;
    setActivatedAbilityCard(null);

    if (ability.requiresTarget) {
      setTargetingCard({ ...card, _pendingAbilityId: ability.id });
    } else {
      handleAction('activate-ability', { instanceId: card.instanceId, abilityId: ability.id });
    }
  }, [activatedAbilityCard, handleAction]);

  const nextPhase    = () => handleAction('next-phase');
  const passPriority = () => handleAction('pass-priority');
  const concede      = () => handleAction('concede');
  const resolveTop   = () => handleAction('resolve-top-of-stack');

  const toggleAttacker = (id) =>
    setAttackers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const confirmAttackers = () => {
    handleAction('declare-attackers', { attackers });
    setAttackers([]);
  };

  const assignBlocker = (blockerInstanceId, attackerInstanceId) =>
    setBlockers(prev => [...prev, { blockerInstanceId, attackerInstanceId }]);

  const confirmBlockers = () => {
    handleAction('declare-blockers', { blockers });
    setBlockers([]);
  };

  const handleMulligan = (keep) => {
    if (keep) {
      const me = gameState?.players?.find(p => p.id === playerId);
      if (me && me.mulliganCount > 0) setMulliganState('bottoming');
      else { handleAction('mulligan-keep', {}); setMulliganState(null); }
    } else {
      handleAction('mulligan-mulligan', {});
      setMulliganState('decision');
    }
  };

  const handlePutOnBottom = (ids) => {
    handleAction('mulligan-keep', { bottomCards: ids });
    setMulliganState(null);
  };

  // ── Loading ────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingScreen}>
          <div className={styles.loadingSpinner} />
          <p>Connecting to game server…</p>
        </div>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────
  const is1v1         = gameState.mode === '1v1';
  const playersArr    = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
  const playerState   = playersArr.find(p => p.id === playerId);
  const opponentState = playersArr.find(p => p.id !== playerId) || null;
  const activePlayerId = playersArr[gameState.activePlayer]?.id;
  const isMyTurn      = activePlayerId === playerId;

  // ── Sideboarding screen ─────────────────────────────────────
  if (gameState.phase === 'sideboarding') {
    return (
      <div className={styles.container}>
        <div className={styles.overlay}>
          <div className={styles.sideboardModal}>
            <h2 className={styles.modalTitle}>⚔️ Sideboarding</h2>
            <p className={styles.modalSubtitle}>
              Score: You {gameState.matchWins[playerState.index]} –{' '}
              {opponentState ? gameState.matchWins[opponentState.index] : 0} Opponent
            </p>
            {playerState.sideboardReady ? (
              <p style={{ color: '#4ade80', marginTop: 20 }}>Waiting for opponent…</p>
            ) : (
              <button
                className={styles.primaryBtn}
                style={{ marginTop: 20 }}
                onClick={() =>
                  handleAction('submit-sideboard', {
                    newMainDeck: playerState.deck,
                    newSideboard: playerState.sideboard,
                  })
                }
              >
                Submit Sideboard →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main game render ────────────────────────────────────────
  return (
    <div className={styles.container}>

      {/* ── Left sidebar – phase tracker ──────────────────── */}
      <div className={styles.leftSidebar}>
        <PhaseTracker
          currentPhase={gameState.phase}
          activePlayerId={activePlayerId}
          playerId={playerId}
        />
      </div>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className={styles.mainArea}>

        {/* Targeting mode banner */}
        {targetingCard && (
          <TargetingBanner
            card={targetingCard}
            onCancel={() => setTargetingCard(null)}
          />
        )}

        {/* Stack banner */}
        {gameState.stack?.length > 0 && (
          <StackBanner
            stack={gameState.stack}
            onResolve={resolveTop}
          />
        )}

        {/* Opponent zone */}
        <div className={styles.opponentZone}>
          {is1v1 && opponentState ? (
            <>
              <div className={styles.opponentStats}>
                <LifeCounter
                  life={opponentState.life}
                  name={opponentState.name || 'Opponent'}
                  onClick={targetingCard ? () => handleTargetClick(opponentState.id) : undefined}
                  isTargetable={!!targetingCard}
                />
              </div>
              <div className={styles.opponentHand}>
                <span className={styles.handCount}>{opponentState.hand?.length || 0} cards</span>
                {Array.from({ length: opponentState.hand?.length || 0 }).map((_, i) => (
                  <div key={i} className={styles.cardBack} />
                ))}
              </div>
              <div className={styles.battlefieldWrapper}>
                <Battlefield
                  cards={opponentState.battlefield}
                  isOpponent
                  onCardHover={handleGlobalHover}
                  onCardLeave={handleGlobalLeave}
                  onCardClick={targetingCard ? (card) => handleTargetClick(card.instanceId) : undefined}
                  isTargeting={!!targetingCard}
                />
              </div>
            </>
          ) : (
            <div
              className={styles.goldfishBanner}
              onClick={targetingCard ? () => handleTargetClick('goldfish') : undefined}
              style={targetingCard ? { cursor: 'crosshair', boxShadow: '0 0 20px #f59e0b' } : {}}
            >
              <h3>🐟 Goldfish Mode</h3>
              <LifeCounter life={gameState.virtualOpponent?.life ?? 20} name="Virtual Opponent" />
            </div>
          )}
        </div>

        {/* Player zone */}
        <div className={styles.playerZone}>
          <div className={styles.battlefieldWrapper}>
            <Battlefield
              cards={playerState.battlefield}
              onCardClick={(card) => {
                if (targetingCard) {
                  handleTargetClick(card.instanceId);
                } else if (gameState.phase === 'combat_attackers' && isMyTurn) {
                  toggleAttacker(card.instanceId);
                } else {
                  const abilities = card.engineMetadata?.activatedAbilities || [];
                  if (abilities.length > 0 || card.type_line?.includes('Land')) {
                    setActivatedAbilityCard(card);
                  }
                }
              }}
              onCardHover={handleGlobalHover}
              onCardLeave={handleGlobalLeave}
              attackers={attackers}
              isTargeting={!!targetingCard}
            />
          </div>

          <div className={styles.handWrapper}>
            <Hand
              cards={playerState.hand}
              selectedCardId={selectedCard}
              onCardClick={(card) => {
                setSelectedCard(card.instanceId);
                playCard(card);
              }}
              onCardHover={handleGlobalHover}
              onCardLeave={handleGlobalLeave}
            />
          </div>
        </div>

        {/* Stack overlay */}
        {gameState.stack?.length > 0 && (
          <div className={styles.stackOverlay}>
            <StackView stack={gameState.stack} />
          </div>
        )}
      </div>

      {/* ── Right sidebar ────────────────────────────────── */}
      <div className={styles.rightSidebar}>
        <div className={styles.sidebarSection}>
          <h2 className={styles.turnHeading}>Turn {gameState.turn || 1}</h2>
          <div className={styles.turnIndicator}>
            {isMyTurn ? '⚡ Your Turn' : `${opponentState?.name ?? "Opponent"}'s Turn`}
          </div>
        </div>
        <div className={styles.sidebarSection}>
          <LifeCounter
            life={playerState.life}
            name="You"
            onClick={targetingCard ? () => handleTargetClick(playerState.id) : undefined}
          />
        </div>
        <div className={styles.sidebarSection}>
          <ManaPool manaPool={playerState.manaPool} />
        </div>
        <div className={styles.sidebarSection}>
          <div className={styles.zones}>
            <button className={styles.zoneButton} onClick={() => setZoneOverlay('graveyard')}>
              ⚰ GY ({playerState.graveyard?.length || 0})
            </button>
            <button className={styles.zoneButton} onClick={() => setZoneOverlay('exile')}>
              ✦ Exile ({playerState.exile?.length || 0})
            </button>
          </div>
        </div>
        <div className={styles.gameLogWrapper}>
          <GameLog logs={logs} />
        </div>
        <div className={styles.turnControls}>
          {gameState.phase === 'combat_attackers' && isMyTurn && (
            <button className={styles.primaryBtn} onClick={confirmAttackers}>
              ⚔ Declare Attackers
            </button>
          )}
          {gameState.phase === 'combat_blockers' && !isMyTurn && is1v1 && (
            <button className={styles.primaryBtn} onClick={confirmBlockers}>
              🛡 Declare Blockers
            </button>
          )}
          {gameState.stack?.length > 0 && (
            <button className={styles.resolveBtn} onClick={resolveTop}>
              ✓ Resolve Top of Stack
            </button>
          )}
          <button className={styles.button} onClick={nextPhase}>Next Phase →</button>
          <button className={`${styles.button} ${styles.buttonPass}`} onClick={passPriority}>
            Pass Priority
          </button>
          <button className={`${styles.button} ${styles.buttonConcede}`} onClick={concede}>
            Concede
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          MODAL LAYER
          ════════════════════════════════════════════ */}

      {/* Zone overlay */}
      {zoneOverlay && (
        <div className={styles.overlay} onClick={() => setZoneOverlay(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <ZoneOverlay
              zoneName={zoneOverlay}
              cards={playerState[zoneOverlay]}
              onClose={() => setZoneOverlay(null)}
            />
          </div>
        </div>
      )}

      {/* Mulligan decision */}
      {mulliganState === 'decision' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🃏 Opening Hand</h2>
            {playerState.mulliganCount > 0 && (
              <p className={styles.mulliganCount}>Mulligan #{playerState.mulliganCount}</p>
            )}
            <div className={styles.cardRow}>
              {playerState.hand.map(card => (
                <div key={card.instanceId} className={styles.mulliganCardWrap}>
                  <img src={IMG(card.image_uri)} alt={card.name || 'Card'} />
                </div>
              ))}
            </div>
            <div className={styles.btnRow}>
              <button className={styles.primaryBtn} onClick={() => handleMulligan(true)}>
                Keep ✓
              </button>
              <button className={styles.secondaryBtn} onClick={() => handleMulligan(false)}>
                Mulligan ↺
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mulligan bottoming */}
      {mulliganState === 'bottoming' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Place on Bottom</h2>
            <BottomingInterface
              hand={playerState.hand}
              count={playerState.mulliganCount || 0}
              onConfirm={handlePutOnBottom}
            />
          </div>
        </div>
      )}

      {/* Surveil */}
      {playerState.isSurveiling && playerState.surveilCard && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🔍 Surveil</h2>
            <p className={styles.modalSubtitle}>
              Keep on top or put into graveyard?
            </p>
            <div className={styles.cardRow} style={{ justifyContent: 'center' }}>
              <div className={styles.mulliganCardWrap} style={{ width: 200 }}>
                <img src={IMG(playerState.surveilCard.image_uri)} alt={playerState.surveilCard.name} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.primaryBtn} onClick={() => handleAction('resolve-surveil', { keepOnTop: true })}>
                Keep on Top
              </button>
              <button className={styles.secondaryBtn} onClick={() => handleAction('resolve-surveil', { keepOnTop: false })}>
                To Graveyard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scry */}
      {playerState.isScrying && playerState.scryCard && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🔮 Scry</h2>
            <p className={styles.modalSubtitle}>Keep on top or put on bottom?</p>
            <div className={styles.cardRow} style={{ justifyContent: 'center' }}>
              <div className={styles.mulliganCardWrap} style={{ width: 200 }}>
                <img src={IMG(playerState.scryCard.image_uri)} alt={playerState.scryCard.name} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.primaryBtn} onClick={() => handleAction('resolve-scry', { keepOnTop: true })}>
                Keep on Top
              </button>
              <button className={styles.secondaryBtn} onClick={() => handleAction('resolve-scry', { keepOnTop: false })}>
                Put on Bottom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fetch land library search */}
      {playerState.isSearchingLibrary && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: '90%' }}>
            <h2 className={styles.modalTitle}>📚 Search Your Library</h2>
            <p className={styles.modalSubtitle}>Select a land to put onto the battlefield.</p>
            <div className={styles.cardRow} style={{ flexWrap: 'wrap', maxHeight: '55vh', overflowY: 'auto' }}>
              {playerState.library.map(card => {
                const isValid = !playerState.searchCriteria ||
                  playerState.searchCriteria.some(t => card.type_line?.includes(t));
                return (
                  <div
                    key={card.instanceId}
                    className={`${styles.selCard} ${isValid ? styles.selCardValid : styles.selCardDim}`}
                    onClick={() => {
                      if (isValid) handleAction('resolve-library-search', { targetInstanceId: card.instanceId });
                    }}
                  >
                    <img src={IMG(card.image_uri)} alt={card.name || 'Card'} />
                  </div>
                );
              })}
            </div>
            <button
              className={styles.secondaryBtn}
              style={{ marginTop: 16 }}
              onClick={() => handleAction('resolve-library-search', { targetInstanceId: null })}
            >
              Fail to Find
            </button>
          </div>
        </div>
      )}

      {/* Phase 2 – Ponder rearrange */}
      {playerState.isRearrangingLibrary && playerState.ponderCards?.length > 0 && (
        <div className={styles.overlay}>
          <PonderModal
            cards={playerState.ponderCards}
            canShuffle={playerState.ponderCanShuffle}
            onConfirm={(newOrder) => handleAction('resolve-rearrange', { newOrder, shuffle: false })}
            onShuffle={() => handleAction('resolve-rearrange', { newOrder: [], shuffle: true })}
          />
        </div>
      )}

      {/* Phase 2 – Brainstorm put-back */}
      {playerState.isBrainstorming && playerState.brainstormData && (
        <div className={styles.overlay}>
          <BrainstormModal
            hand={playerState.hand}
            putBack={playerState.brainstormData.putBack}
            onConfirm={(topdeckCards) => handleAction('resolve-brainstorm', { topdeckCards })}
          />
        </div>
      )}

      {/* Phase 4 – Delver reveal */}
      {playerState.isRevealingTopCard && playerState.revealedCard && (
        <div className={styles.overlay}>
          <DelverRevealModal
            revealedCard={playerState.revealedCard}
            onDismiss={() => handleAction('resolve-reveal')}
          />
        </div>
      )}

      {/* Phase 3 – Alternate cost chooser */}
      {altCostCard && (
        <div className={styles.overlay}>
          <AltCostModal
            card={altCostCard}
            player={playerState}
            onConfirm={confirmAltCost}
            onCancel={() => setAltCostCard(null)}
          />
        </div>
      )}

      {/* Activated Abilities Menu */}
      {activatedAbilityCard && (
        <div className={styles.overlay}>
          <ActivatedAbilitiesModal
            card={activatedAbilityCard}
            onConfirm={confirmActivateAbility}
            onCancel={() => setActivatedAbilityCard(null)}
            tapLand={() => tapLand(activatedAbilityCard.instanceId)}
          />
        </div>
      )}

      {/* Show and Tell */}
      {playerState.isShowAndTelling && (
        <div className={styles.overlay}>
          <ShowAndTellModal
            hand={playerState.hand}
            onConfirm={(id) => handleAction('resolve-show-and-tell', { permanentInstanceId: id })}
          />
        </div>
      )}

      {/* Cleanup discard */}
      {gameState.phase === 'cleanup' && playerState.hand.length > 7 && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>♻ Discard to 7</h2>
            <p className={styles.modalSubtitle}>
              Discard{' '}
              <span className={styles.accent}>{playerState.hand.length - 7}</span> card(s).
            </p>
            <div className={styles.cardRow}>
              {playerState.hand.map(card => (
                <div
                  key={card.instanceId}
                  className={styles.selCard}
                  onClick={() => handleAction('discard', { cardInstanceId: card.instanceId })}
                >
                  <img src={IMG(card.image_uri)} alt={card.name || 'Card'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game over */}
      {gameOver && (
        <div className={styles.overlay}>
          <div className={`${styles.modal} ${gameOver === 'victory' ? styles.victoryModal : styles.defeatModal}`}>
            <h1 className={styles.gameOverTitle}>
              {gameOver === 'victory' ? '🏆 Victory!' : '💀 Defeat'}
            </h1>
            <button className={styles.primaryBtn} style={{ marginTop: 24 }} onClick={() => router.push('/')}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Global card preview */}
      {previewCard && (
        <div className={styles.globalCardPreview} onClick={() => setPreviewCard(null)}>
          <img src={IMG(previewCard.image_uri)} alt={previewCard.name || 'Preview'} />
        </div>
      )}
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0e1a', color: '#fff' }}>
          Loading…
        </div>
      }
    >
      <GameContent />
    </Suspense>
  );
}
