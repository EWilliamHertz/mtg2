'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';
import styles from '../page.module.css';

export default function PlayPage() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const lobbyRef = useRef(null);

  // ─── State ───
  const [decks, setDecks] = useState([]);
  const [lobbies, setLobbies] = useState([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [versusSelectedDeckId, setVersusSelectedDeckId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [createDeckId, setCreateDeckId] = useState('');
  const [waitingLobby, setWaitingLobby] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const [joinDeckLobbyId, setJoinDeckLobbyId] = useState(null);
  const [joinDeckId, setJoinDeckId] = useState('');
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  
  const playerName = user ? user.username : '';

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (e) { }
    }
    checkAuth();
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setUser({ username: data.username });
        setShowAuthModal(false);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    setUser(null);
  };

  // ─── Fetch decks ───
  useEffect(() => {
    async function fetchDecks() {
      try {
        const res = await fetch('/api/decks');
        if (res.ok) {
          const data = await res.json();
          setDecks(data);
          if (data.length > 0) {
            setSelectedDeckId(data[0].id);
            setVersusSelectedDeckId(data[0].id);
            setCreateDeckId(data[0].id);
            setJoinDeckId(data[0].id);
          }
        }
      } catch {
        // Silently handle - decks will be empty
      }
    }
    fetchDecks();
  }, []);

  // ─── Fetch lobbies ───
  const fetchLobbies = useCallback(async () => {
    try {
      const res = await fetch('/api/lobbies');
      if (res.ok) {
        const data = await res.json();
        setLobbies(data);
      }
    } catch {
      // Silently handle
    }
  }, []);

  useEffect(() => {
    fetchLobbies();
  }, [fetchLobbies]);

  // ─── Socket event listeners ───
  useEffect(() => {
    if (!socket) return;

    const handleLobbyList = (lobbyList) => {
      setLobbies(lobbyList);
    };

    const handleLobbyUpdate = (lobby) => {
      setLobbies((prev) =>
        prev.map((l) => (l.id === lobby.id ? lobby : l))
      );
      if (waitingLobby && lobby.id === waitingLobby.id) {
        setWaitingLobby(lobby);
      }
    };

    const handleGameStart = ({ gameId, playerId }) => {
      router.push(`/game?gameId=${gameId}&playerId=${playerId}`);
    };

    const handleError = (msg) => {
      setError(typeof msg === 'string' ? msg : msg?.message || 'An error occurred');
      setTimeout(() => setError(''), 6000);
    };

    socket.on('lobby-list', handleLobbyList);
    socket.on('lobby-update', handleLobbyUpdate);
    socket.on('game-start', handleGameStart);
    socket.on('error', handleError);

    return () => {
      socket.off('lobby-list', handleLobbyList);
      socket.off('lobby-update', handleLobbyUpdate);
      socket.off('game-start', handleGameStart);
      socket.off('error', handleError);
    };
  }, [socket, router, waitingLobby]);

  // ─── Solo Goldfish start ───
  const handleStartSolo = useCallback(async () => {
    if (!playerName.trim()) {
      setError('Please enter your name first.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    if (!selectedDeckId) {
      setError('Please select a deck.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    setLoading(true);
    try {
      if (socket) {
        socket.emit('create-lobby', {
          name: `${playerName}'s Solo Game`,
          mode: '1v0',
          playerName,
          deckId: selectedDeckId
        });
        
        // Wait for lobby-update to get the lobby ID
        const onLobbyUpdate = (lobby) => {
          if (lobby.name === `${playerName}'s Solo Game`) {
            socket.off('lobby-update', onLobbyUpdate);
            socket.emit('ready', { lobbyId: lobby.id });
          }
        };
        socket.on('lobby-update', onLobbyUpdate);
      }
    } catch (err) {
      setError(err.message || 'Failed to start solo game.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setLoading(false);
    }
  }, [playerName, selectedDeckId, socket]);

  // ─── Create Lobby (Versus) ───
  const handleCreateLobby = useCallback(async () => {
    if (!playerName.trim()) {
      setError('Please enter your name first.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    if (!createDeckId) {
      setError('Please select a deck.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    setLoading(true);
    try {
      if (socket) {
        socket.emit('create-lobby', {
          name: lobbyName || `${playerName}'s Lobby`,
          mode: '1v1',
          playerName,
          deckId: createDeckId
        });

        const onLobbyUpdate = (lobby) => {
          if (lobby.name === (lobbyName || `${playerName}'s Lobby`)) {
            socket.off('lobby-update', onLobbyUpdate);
            setWaitingLobby(lobby);
            setShowCreateModal(false);
            setIsReady(false);
            setLoading(false);
          }
        };
        socket.on('lobby-update', onLobbyUpdate);
      }
    } catch (err) {
      setError(err.message || 'Failed to create lobby.');
      setTimeout(() => setError(''), 4000);
      setLoading(false);
    }
  }, [playerName, lobbyName, createDeckId, socket]);

  // ─── Join lobby ───
  const handleJoinLobby = useCallback(
    (lobbyId) => {
      if (!playerName.trim()) {
        setError('Please enter your name first.');
        setTimeout(() => setError(''), 4000);
        return;
      }

      // If the user hasn't chosen a deck for this lobby, show the deck selector
      if (joinDeckLobbyId !== lobbyId) {
        setJoinDeckLobbyId(lobbyId);
        return;
      }

      if (!joinDeckId) {
        setError('Please select a deck.');
        setTimeout(() => setError(''), 4000);
        return;
      }

      if (socket) {
        socket.emit('join-lobby', { lobbyId, playerName, deckId: joinDeckId });
      }

      const lobby = lobbies.find((l) => l.id === lobbyId);
      setWaitingLobby(lobby || { id: lobbyId, name: 'Lobby' });
      setJoinDeckLobbyId(null);
      setIsReady(false);
    },
    [playerName, joinDeckId, joinDeckLobbyId, socket, lobbies]
  );

  // ─── Ready up ───
  const handleReady = useCallback(() => {
    if (socket && waitingLobby) {
      socket.emit('ready', { lobbyId: waitingLobby.id });
      setIsReady(true);
    }
  }, [socket, waitingLobby]);

  // ─── Leave waiting ───
  const handleLeaveWaiting = useCallback(() => {
    if (socket && waitingLobby) {
      socket.emit('leave-lobby', { lobbyId: waitingLobby.id });
    }
    setWaitingLobby(null);
    setIsReady(false);
  }, [socket, waitingLobby]);

  // ─── Open create modal ───
  const openCreateModal = useCallback(() => {
    setLobbyName(`${playerName}'s Lobby`);
    setShowCreateModal(true);
  }, [playerName]);

  // ─── Scroll to lobby browser ───
  const scrollToLobbies = useCallback(() => {
    lobbyRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ─── Helpers ───

  const getLobbyStatus = (lobby) => {
    if (lobby.status === 'in-game') return { label: 'In Game', className: styles.statusInGame };
    if (lobby.players && lobby.players.length >= (lobby.mode === '1v1' ? 2 : 1)) {
      return { label: 'Full', className: styles.statusFull };
    }
    return { label: 'Waiting', className: styles.statusWaiting };
  };

  const isLobbyJoinable = (lobby) => {
    if (lobby.status === 'in-game') return false;
    const maxPlayers = lobby.mode === '1v1' ? 2 : 1;
    return (lobby.players?.length ?? 0) < maxPlayers;
  };

  // ─── Particle elements ───
  const particles = Array.from({ length: 12 }, (_, i) => (
    <div key={i} className={styles.particle} />
  ));

  return (
    <div className={styles.page}>
      {/* Top Nav */}
      <header className={styles.topNav}>
        <div className={styles.navLogo}><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Ouyrie</Link></div>
        <div className={styles.navActions}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ color: '#c9a84c', fontWeight: 'bold' }}>{user.username}</span>
              <button className={styles.btnSecondary} onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <>
              <button className={styles.btnLogin} onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}>Login</button>
              <button className={styles.btnRegister} onClick={() => { setAuthMode('register'); setShowAuthModal(true); }}>Register</button>
            </>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', margin: 0 }}>
              {authMode === 'login' ? 'Login' : 'Register'}
            </h2>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--color-primary)' }}>Username</label>
                <input 
                  type="text" 
                  value={authUsername} 
                  onChange={e => setAuthUsername(e.target.value)} 
                  required
                  style={{ width: '100%', padding: '10px', background: '#1a1a2e', color: '#fff', border: '1px solid rgba(201,168,76,0.5)', borderRadius: '4px' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--color-primary)' }}>Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  required
                  style={{ width: '100%', padding: '10px', background: '#1a1a2e', color: '#fff', border: '1px solid rgba(201,168,76,0.5)', borderRadius: '4px' }} 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAuthModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Register')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Particles */}
      <div className={styles.particles}>{particles}</div>

      {/* Connection Status */}
      <div className={styles.connectionStatus}>
        <span
          className={`${styles.statusDot} ${
            isConnected ? styles.connected : styles.disconnected
          }`}
        />
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>

      {/* Error Banner */}
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className={styles.content}>


        {/* Mode Cards */}
        <section className={styles.modes}>
          {/* Solo Goldfish */}
          <div className={styles.modeCard}>
            <span className={styles.modeIcon}>🎣</span>
            <h2 className={styles.modeTitle}>Solo Goldfish</h2>
            <p className={styles.modeDesc}>
              Test your deck against a virtual opponent. Practice combos and perfect your strategy.
            </p>

            <select
              className={styles.deckSelect}
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
            >
              {decks.length === 0 && <option value="">No decks available</option>}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>

            <button
              className={styles.btnPrimary}
              onClick={handleStartSolo}
              disabled={loading || !playerName.trim() || !selectedDeckId}
            >
              {loading ? 'Starting...' : 'Start Solo Game'}
            </button>
          </div>

          {/* Versus */}
          <div className={styles.modeCard}>
            <span className={styles.modeIcon}>⚔️</span>
            <h2 className={styles.modeTitle}>Versus Mode</h2>
            <p className={styles.modeDesc}>
              Challenge another player in a 1v1 match. Prove your mastery.
            </p>

            <div className={styles.btnRow}>
              <button
                className={styles.btnPrimary}
                onClick={openCreateModal}
                disabled={!playerName.trim()}
              >
                Create Lobby
              </button>
              <button className={styles.btnSecondary} onClick={scrollToLobbies}>
                Browse Lobbies
              </button>
            </div>
          </div>
        </section>

        {/* Waiting for Opponent */}
        {waitingLobby && (
          <section className={styles.waitingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.waitingLobbyName}>{waitingLobby.name}</p>
            <p className={styles.waitingText}>
              {waitingLobby.players && waitingLobby.players.length >= 2
                ? 'Opponent joined! Ready up to start.'
                : 'Waiting for opponent...'}
            </p>

            {waitingLobby.players && waitingLobby.players.length >= 2 && (
              <div className={styles.opponentInfo}>
                <strong>Players:</strong>{' '}
                {waitingLobby.players.map((p) => p.name || p).join(' vs ')}
              </div>
            )}

            {!isReady ? (
              <button className={styles.readyBtn} onClick={handleReady}>
                Ready
              </button>
            ) : (
              <span className={`${styles.readyStatus} ${styles.isReady}`}>✓ Ready</span>
            )}

            <div style={{ marginTop: '16px' }}>
              <button
                className={styles.btnSecondary}
                style={{ width: 'auto', padding: '8px 24px' }}
                onClick={handleLeaveWaiting}
              >
                Leave
              </button>
            </div>
          </section>
        )}

        {/* Lobby Browser */}
        <section className={styles.lobbySection} ref={lobbyRef}>
          <h2 className={styles.sectionTitle}>Open Lobbies</h2>

          {lobbies.length === 0 ? (
            <div className={styles.emptyState}>
              No lobbies available. Create one!
            </div>
          ) : (
            <table className={styles.lobbyTable}>
              <thead>
                <tr className={styles.lobbyHeaderRow}>
                  <th>Lobby</th>
                  <th>Host</th>
                  <th>Mode</th>
                  <th>Players</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lobbies.map((lobby) => {
                  const status = getLobbyStatus(lobby);
                  const joinable = isLobbyJoinable(lobby);
                  return (
                    <tr key={lobby.id} className={styles.lobbyRow}>
                      <td>{lobby.name}</td>
                      <td>{lobby.hostName || lobby.host || '—'}</td>
                      <td>{lobby.mode}</td>
                      <td>
                        <span className={styles.playersBadge}>
                          {lobby.players?.length ?? 0} /{' '}
                          {lobby.mode === '1v1' ? 2 : 1}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.lobbyStatus} ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {joinDeckLobbyId === lobby.id ? (
                          <div className={styles.joinDeckRow}>
                            <select
                              className={styles.deckSelect}
                              value={joinDeckId}
                              onChange={(e) => setJoinDeckId(e.target.value)}
                            >
                              {decks.length === 0 && (
                                <option value="">No decks</option>
                              )}
                              {decks.map((deck) => (
                                <option key={deck.id} value={deck.id}>
                                  {deck.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className={styles.joinBtn}
                              onClick={() => handleJoinLobby(lobby.id)}
                              disabled={!joinDeckId}
                            >
                              Go
                            </button>
                          </div>
                        ) : (
                          <button
                            className={styles.joinBtn}
                            onClick={() => handleJoinLobby(lobby.id)}
                            disabled={!joinable}
                          >
                            Join
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Nav Link */}
        <div className={styles.navRow}>
          <Link href="/deck-builder" className={styles.navLink}>
            Build a Deck →
          </Link>
        </div>
      </div>

      {/* Create Lobby Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Create Lobby</h3>

            <label className={styles.modalLabel} htmlFor="lobbyNameInput">
              Lobby Name
            </label>
            <input
              id="lobbyNameInput"
              className={styles.modalInput}
              type="text"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              maxLength={40}
            />

            <label className={styles.modalLabel} htmlFor="createDeckSelect">
              Select Deck
            </label>
            <select
              id="createDeckSelect"
              className={styles.deckSelect}
              value={createDeckId}
              onChange={(e) => setCreateDeckId(e.target.value)}
            >
              {decks.length === 0 && <option value="">No decks available</option>}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>

            <div className={styles.modalButtons}>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleCreateLobby}
                disabled={loading || !createDeckId}
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
