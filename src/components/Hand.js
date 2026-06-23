'use client';

import React from 'react';
import Card from './Card';
import styles from './Hand.module.css';

export default function Hand({ cards = [], onCardClick, onCardHover, onCardLeave, selectedCardId }) {
  const count = cards.length;
  const maxRotation = Math.min(count * 3, 25); // degrees

  return (
    <div className={styles.hand}>
      {cards.map((card, i) => {
        const centerOffset = i - (count - 1) / 2;
        const rotation = centerOffset * (maxRotation / Math.max(count - 1, 1));
        const yOffset = Math.abs(centerOffset) * 8; // creates arc
        const isSelected = selectedCardId === card.instanceId;

        return (
          <div
            key={card.instanceId || i}
            className={`${styles.cardWrapper} ${isSelected ? styles.cardSelected : ''}`}
            style={{
              transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
              zIndex: isSelected ? 10 : i,
            }}
            onClick={() => onCardClick?.(card)}
            onMouseEnter={(e) => onCardHover?.(card, e)}
            onMouseLeave={() => onCardLeave?.()}
          >
            <Card card={card} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
