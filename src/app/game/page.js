'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import styles from './page.module.css';

import PhaseTracker from '@/components/PhaseTracker';
import ManaPool from '@/components/ManaPool';
import LifeCounter from '@/components/LifeCounter';
import Hand from '@/components/Hand';
import Battlefield from '@/components/Battlefield';
import StackView from '@/components/StackView';
import ZoneOverlay from '@/components/ZoneOverlay';
import GameLog from '@/components/GameLog';

function BottomingInterface({ hand, count, onConfirm, styles }) {
  const [selected, setSelected] = useState([]);
  
  const toggleCard = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div>
      <p>Select {count} cards to put on the bottom.</p>
      <div className={styles.mulliganHand}>
        {hand.map(card => (
          <div 
            key={card.instanceId} 
            onClick={() => toggleCard(card.instanceId)}
            style={{
              width: 150, 
              border: selected.includes(card.instanceId) ? '4px solid red' : '4px solid transparent',
              cursor: 'pointer'
            }}
          >
            <img src={card.image_uri || 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg'} alt={card.name || 'Card'} style={{width: '100%', borderRadius: 8}} />
          </div>
        ))}
      </div>
      <button 
        className={styles.button} 
        disabled={selected.length !== count} 
        onClick={() => onConfirm(selected)}
      >
        Confirm
      </button>
    </div>
  );
}

function GameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId = searchParams?.get('gameId') || 'test-game';
  const playerId = searchParams?.get('playerId') || 'player-1';
  const { socket, isConnected } = useSocket();

  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [attackers, setAttackers] = useState([]);
  const [blockers, setBlockers] = useState([]);
  
  const [zoneOverlay, setZoneOverlay] = useState(null);
  const [mulliganState, setMulliganState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const previewTimer = useRef(null);

  const handleGlobalHover = useCallback((card) => {
    if (!card) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setPreviewCard(card);
    }, 2000); // 2 second delay
  }, []);

  const handleGlobalLeave = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewCard(null);
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !gameId || !playerId) return;

    socket.emit('join-game', { gameId, playerId });

    const handleGameStart = (data) => {
      const state = data.state || data;
      setGameState(state);
      // players is an array; find our player by id
      const me = Array.isArray(state.players)
        ? state.players.find(p => p.id === playerId)
        : null;
      if (state.phase === 'mulligan' && me && !me.hasKeptHand) {
        setMulliganState('decision');
      }
      setLogs((prev) => [...prev, { id: Date.now(), text: 'Game started!' }]);
    };

    const handleGameUpdate = (newState) => {
      setGameState(newState);
      if (newState.log && Array.isArray(newState.log)) {
        setLogs(newState.log.map((l) => ({ id: l.time, text: l.message })));
      }
      // Auto-detect mulligan phase from state
      const me = Array.isArray(newState.players)
        ? newState.players.find(p => p.id === playerId)
        : null;
      if (newState.phase === 'mulligan' && me && !me.hasKeptHand) {
        setMulliganState('decision');
      } else if (newState.phase !== 'mulligan') {
        setMulliganState(null);
      }
      if (newState.winner) {
        setGameOver(newState.winner === playerId ? 'victory' : 'defeat');
      }
    };

    const handleGameOver = (result) => {
      setGameOver(result.winner === playerId ? 'victory' : 'defeat');
    };

    socket.on('game-start', handleGameStart);
    socket.on('game-update', handleGameUpdate);
    socket.on('game-over', handleGameOver);
    
    const handleError = (msg) => {
      console.error('Server error:', msg);
      if (msg === 'Game not found') {
        router.push('/'); // Bounce back to lobby if the server wiped the game
      }
    };
    socket.on('error', handleError);

    return () => {
      socket.off('game-start', handleGameStart);
      socket.off('game-update', handleGameUpdate);
      socket.off('game-over', handleGameOver);
      socket.off('error', handleError);
    };
  }, [socket, isConnected, gameId, playerId]);

  const handleAction = (type, payload = {}) => {
    if (!socket) return;
    socket.emit('game-action', { gameId, playerId, type, ...payload });
  };

  const playCard = (instanceId) => {
    handleAction('play-card', { instanceId });
    setSelectedCard(null);
  };

  const tapLand = (instanceId) => {
    handleAction('tap-land', { instanceId });
  };

  const nextPhase = () => {
    handleAction('next-phase');
  };

  const passPriority = () => {
    handleAction('pass-priority');
  };

  const concede = () => {
    handleAction('concede');
  };

  const toggleAttacker = (cardInstanceId) => {
    setAttackers((prev) =>
      prev.includes(cardInstanceId)
        ? prev.filter((id) => id !== cardInstanceId)
        : [...prev, cardInstanceId]
    );
  };

  
  const confirmAttackers = () => {
    handleAction('declare-attackers', { attackers: attackers });
    setAttackers([]);
  };

  const assignBlocker = (blockerInstanceId, attackerInstanceId) => {
    setBlockers((prev) => [...prev, { blockerInstanceId, attackerInstanceId }]);
  };

  const confirmBlockers = () => {
    handleAction('declare-blockers', { blockers: blockers });
    setBlockers([]);
  };

  const handleMulligan = (keep) => {
    if (keep) {
      const me = Array.isArray(gameState.players)
        ? gameState.players.find(p => p.id === playerId)
        : null;
      if (me && me.mulliganCount > 0) {
        // Need to select cards to put on bottom
        setMulliganState('bottoming');
      } else {
        // No cards to bottom, just keep
        handleAction('mulligan-keep', {});
        setMulliganState(null);
      }
    } else {
      handleAction('mulligan-mulligan', {});
      // Stay in decision after re-draw
      setMulliganState('decision');
    }
  };

  const handlePutOnBottom = (cardInstanceIds) => {
    handleAction('mulligan-keep', { bottomCards: cardInstanceIds });
    setMulliganState(null);
  };

  if (!gameState) {
    return <div className={styles.container}><div className={styles.modal}>Loading Game...</div></div>;
  }

  const is1v1 = gameState.mode === '1v1';
  const playersArr = Array.isArray(gameState.players) ? gameState.players : Object.values(gameState.players);
  const playerState = playersArr.find(p => p.id === playerId);
  const opponentState = playersArr.find(p => p.id !== playerId) || null;
  // activePlayer is an index in the engine; derive the actual player ID for UI checks
  const activePlayerId = playersArr[gameState.activePlayer]?.id;

  if (gameState.phase === 'sideboarding') {
    return (
      <div className={styles.container}>
        <div className={styles.modal}>
          <h2>Sideboarding</h2>
          <p>Match Score: You {gameState.matchWins[playerState.index]} - {opponentState ? gameState.matchWins[opponentState.index] : 0} Opponent</p>
          <p>Please swap cards and submit when ready.</p>
          {playerState.sideboardReady ? (
            <p style={{ color: '#00ff00', marginTop: '20px' }}>Waiting for opponent...</p>
          ) : (
            <button className={styles.button} onClick={() => {
              // Just submit as is for now if no drag-and-drop implemented
              handleAction('submit-sideboard', { newMainDeck: playerState.deck, newSideboard: playerState.sideboard });
            }} style={{ marginTop: '20px' }}>Submit Sideboard</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.leftSidebar}>
        <PhaseTracker currentPhase={gameState.phase} activePlayerId={activePlayerId} playerId={playerId} />
      </div>

      <div className={styles.mainArea}>
        <div className={styles.opponentZone}>
          {is1v1 && opponentState ? (
            <>
              <div className={styles.opponentStats}>
                <LifeCounter life={opponentState.life} name={opponentState.name || 'Opponent'} />
              </div>
              <div className={styles.opponentHand}>
                <span style={{color: '#aaa', fontSize: 12, marginRight: 8}}>
                  {opponentState.hand?.length || 0} cards in hand
                </span>
                {Array.from({ length: opponentState.hand?.length || 0 }).map((_, i) => (
                  <div key={i} className={styles.cardBack} />
                ))}
              </div>
              
              <div className={styles.battlefieldWrapper}>
                <Battlefield 
                  cards={opponentState.battlefield} 
                  isOpponent={true} 
                  onCardHover={handleGlobalHover}
                  onCardLeave={handleGlobalLeave}
                />
              </div>
            </>
          ) : (
            <div className={styles.goldfishBanner}>
              <h3>Goldfish Mode</h3>
              <LifeCounter life={20} name="Virtual Opponent" />
            </div>
          )}
        </div>

        <div className={styles.playerZone}>
          
          <div className={styles.battlefieldWrapper}>
            <Battlefield 
              cards={playerState.battlefield} 
              onCardClick={(card) => {
                if (gameState.phase === 'combat_attackers' && activePlayerId === playerId) {
                  toggleAttacker(card.instanceId);
                } else if (card.type_line && card.type_line.includes('Land')) {
                  tapLand(card.instanceId);
                }
              }}
              onCardHover={handleGlobalHover}
              onCardLeave={handleGlobalLeave}
              attackers={attackers}
            />
          </div>
          
          <div className={styles.handWrapper}>
            <Hand 
              cards={playerState.hand} 
              selectedCardId={selectedCard}
              onCardClick={(card) => {
                setSelectedCard(card.instanceId);
                playCard(card.instanceId);
              }}
              onCardHover={handleGlobalHover}
              onCardLeave={handleGlobalLeave}
            />
          </div>
        </div>

        {gameState.stack && gameState.stack.length > 0 && (
          <div className={styles.stackOverlay}>
            <StackView stack={gameState.stack} />
          </div>
        )}
      </div>

      <div className={styles.rightSidebar}>
        <div className={styles.sidebarSection}>
          <h2 style={{color: 'white', textAlign: 'center'}}>Turn {gameState.turn || 1}</h2>
        </div>
        <div className={styles.sidebarSection}>
          <LifeCounter life={playerState.life} name="You" />
        </div>
        <div className={styles.sidebarSection}>
          <ManaPool mana={playerState.manaPool} />
        </div>
        <div className={styles.sidebarSection}>
          <div className={styles.zones}>
            <button className={styles.zoneButton} onClick={() => setZoneOverlay('graveyard')}>
              Graveyard ({playerState.graveyard?.length || 0})
            </button>
            <button className={styles.zoneButton} onClick={() => setZoneOverlay('exile')}>
              Exile ({playerState.exile?.length || 0})
            </button>
          </div>
        </div>
        <div className={styles.gameLogWrapper}>
          <GameLog logs={logs} />
        </div>
        
        <div className={styles.turnControls}>
          <button className={styles.button} onClick={nextPhase}>Next Phase</button>
          
          <div className={styles.turnIndicator}>
            {activePlayerId === playerId 
              ? "Your Turn" 
              : (opponentState?.name ? `${opponentState.name}'s Turn` : "Opponent's Turn")}
          </div>

          {gameState.phase === 'combat_attackers' && activePlayerId === playerId && (
            <button className={styles.button} onClick={confirmAttackers}>Confirm Attackers</button>
          )}

          {gameState.phase === 'combat_blockers' && activePlayerId !== playerId && is1v1 && (
            <button className={styles.button} onClick={confirmBlockers}>Confirm Blockers</button>
          )}

          <button className={`${styles.button} ${styles.buttonPass}`} onClick={passPriority}>Pass Priority</button>
          <button className={`${styles.button} ${styles.buttonConcede}`} onClick={concede}>Concede</button>
        </div>
      </div>

      {zoneOverlay && (
        <div className={styles.overlay} onClick={() => setZoneOverlay(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <ZoneOverlay 
              zoneName={zoneOverlay} 
              cards={playerState[zoneOverlay]} 
              onClose={() => setZoneOverlay(null)} 
            />
          </div>
        </div>
      )}

      {mulliganState === 'decision' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Mulligan Decision</h2>
            <div className={styles.mulliganHand}>
              {playerState.hand.map(card => (
                <div key={card.instanceId} style={{width: 150}}>
                  <img src={card.image_uri || 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg'} alt={card.name || 'Card'} style={{width: '100%', borderRadius: 8}} />
                </div>
              ))}
            </div>
            <div style={{display: 'flex', gap: 20, justifyContent: 'center'}}>
              <button className={styles.button} onClick={() => handleMulligan(true)}>Keep</button>
              <button className={styles.button} onClick={() => handleMulligan(false)}>Mulligan</button>
            </div>
          </div>
        </div>
      )}

      {mulliganState === 'bottoming' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Select cards to put on bottom of library</h2>
            <BottomingInterface 
              hand={playerState.hand} 
              count={playerState.mulliganCount || 0} 
              onConfirm={handlePutOnBottom} 
              styles={styles} 
            />
          </div>
        </div>
      )}

      
      {playerState.isSearchingLibrary && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: '90%' }}>
            <h2>Search Your Library</h2>
            <p>Select a card to put onto the battlefield.</p>
            <div className={styles.mulliganHand} style={{ flexWrap: 'wrap', maxHeight: '60vh', overflowY: 'auto' }}>
              {playerState.library.map(card => (
                <div 
                  key={card.instanceId} 
                  style={{ width: 150, cursor: 'pointer' }} 
                  onClick={() => handleAction('resolve-library-search', { targetInstanceId: card.instanceId })}
                >
                  <img 
                    src={card.image_uri || 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg'} 
                    alt={card.name || 'Card'} 
                    style={{ width: '100%', borderRadius: 8 }} 
                  />
                </div>
              ))}
            </div>
            <button className={styles.button} onClick={() => handleAction('resolve-library-search', { targetInstanceId: null })} style={{ marginTop: 20 }}>
              Fail to Find
            </button>
          </div>
        </div>
      )}

      {gameState.phase === 'cleanup' && playerState.hand.length > 7 && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>Discard to Maximum Hand Size</h2>
            <p>You have {playerState.hand.length} cards in hand. Discard {playerState.hand.length - 7} cards.</p>
            <div className={styles.mulliganHand}>
              {playerState.hand.map(card => (
                <div key={card.instanceId} style={{width: 150}} onClick={() => handleAction('discard', { cardInstanceId: card.instanceId })}>
                  <img src={card.image_uri || 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg'} alt={card.name || 'Card'} style={{width: '100%', borderRadius: 8, cursor: 'pointer'}} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      
      {gameOver && (
        <div className={styles.overlay}>
          <div className={`${styles.modal} ${gameOver === 'victory' ? styles.victoryModal : styles.defeatModal}`}>
            <h1 style={{fontSize: 48, color: 'white'}}>{gameOver === 'victory' ? 'Victory!' : 'Defeat'}</h1>
            <button className={styles.button} onClick={() => router.push('/')} style={{marginTop: 20}}>Back to Main Menu</button>
          </div>
        </div>
      )}

      {previewCard && (
        <div 
          className={styles.globalCardPreview} 
          onClick={() => setPreviewCard(null)}
        >
          <img 
            src={previewCard.image_uri ? `/api/image-proxy?url=${encodeURIComponent(previewCard.image_uri)}` : ''} 
            alt={previewCard.name || 'Preview'} 
          />
        </div>
      )}
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.modal}>Loading Game...</div>
      </div>
    }>
      <GameContent />
    </Suspense>
  );
}
