'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardCount, setCardCount] = useState(0);

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

    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setCardCount(data.cardCount);
        }
      } catch (e) { }
    }
    fetchStats();
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

  const particles = Array.from({ length: 15 }, (_, i) => (
    <div key={i} className={styles.particle} />
  ));

  return (
    <div className={styles.page}>
      <header className={styles.topNav}>
        <div className={styles.navLogo}>Ouyrie</div>
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

      {showAuthModal && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', margin: 0 }}>
              {authMode === 'login' ? 'Login' : 'Register'}
            </h2>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {error && <div style={{ color: 'red' }}>{error}</div>}
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

      <div className={styles.particles}>{particles}</div>

      <main className={styles.content} style={{ marginTop: '120px', textAlign: 'center' }}>
        <section className={styles.hero} style={{ marginBottom: '60px' }}>
          <h1 className={styles.title} style={{ fontSize: '5rem', marginBottom: '20px', textShadow: '0 0 20px rgba(201,168,76,0.5)' }}>Ouyrie</h1>
          <p className={styles.subtitle} style={{ maxWidth: '800px', margin: '0 auto', lineHeight: '1.8', fontSize: '1.2rem' }}>
            We are dedicated to spreading Magic: The Gathering to ensure more people have the possibility to play it. 
            Many players have not had the opportunity to experience formats like Modern and Legacy, and we aim to change that.
            <br/><br/>
            With over <strong style={{ color: '#c9a84c' }}>{cardCount.toLocaleString()}</strong> unique cards in our database, every combination and strategy is at your fingertips.
            <br/><br/>
            <span style={{ fontSize: '0.9rem', color: '#aaa' }}>Special thanks to Scryfall and MTGJson for everything they do for the community.</span>
          </p>
        </section>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
          <Link href="/play" className={styles.btnPrimary} style={{ textDecoration: 'none', padding: '15px 40px', fontSize: '1.3rem' }}>
            Enter the Lobby
          </Link>
          <Link href="/deck-builder" className={styles.btnSecondary} style={{ textDecoration: 'none', padding: '15px 40px', fontSize: '1.3rem' }}>
            Deck Builder
          </Link>
        </div>
      </main>
    </div>
  );
}
