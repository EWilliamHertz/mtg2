'use client';

import React from 'react';
import Card from './Card';
import styles from './ZoneOverlay.module.css';

export default function ZoneOverlay({ cards = [], title = '', isOpen = false, onClose }) {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {title} — {cards.length} {cards.length === 1 ? 'card' : 'cards'}
          </h2>
          <button className={styles.closeBtn} onClick={() => onClose?.()}>
            ✕
          </button>
        </div>
        {cards.length === 0 ? (
          <div className={styles.emptyText}>No cards in this zone.</div>
        ) : (
          <div className={styles.grid}>
            {cards.map((card, i) => (
              <div key={card.id || i}>
                <Card card={card} size="md" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
