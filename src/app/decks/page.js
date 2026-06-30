'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function DecksManager() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const res = await fetch('/ouyrie/api/decks');
      if (res.ok) {
        const data = await res.json();
        setDecks(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteDeck = async (id) => {
    if (!window.confirm('Are you sure you want to delete this deck?')) return;
    try {
      const res = await fetch(`/ouyrie/api/decks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== id));
      } else {
        alert('Failed to delete deck');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <a href="/" className={styles.backBtn}>← Back to Lobbies</a>
          <h1 className={styles.title} style={{ marginTop: '20px' }}>Your Decks</h1>
        </div>
        <a href="/deck-builder" className={styles.newDeckBtn}>+ Create New Deck</a>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#c9a84c', marginTop: '50px' }}>Loading decks...</div>
      ) : decks.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', marginTop: '50px' }}>
          <h2>No decks found.</h2>
          <p>Head to the Deck Builder to create your first deck!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {decks.map(deck => (
            <div key={deck.id} className={styles.deckCard}>
              <h3 className={styles.deckName}>{deck.name}</h3>
              <div className={styles.deckFormat}>{deck.format}</div>
              <div className={styles.deckActions}>
                <a href={`/deck-builder?id=${deck.id}`} className={styles.editBtn}>Edit Deck</a>
                <button onClick={() => deleteDeck(deck.id)} className={styles.deleteBtn}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
