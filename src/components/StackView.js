'use client';

import React from 'react';
import ManaCost from './ManaSymbols';
import styles from './StackView.module.css';

export default function StackView({ stack = [] }) {
  if (stack.length === 0) return null;

  // Reverse for LIFO display (most recent on top)
  const reversedStack = [...stack].reverse();

  return (
    <div className={styles.stackContainer}>
      <div className={styles.stackTitle}>Stack ({stack.length})</div>
      {reversedStack.map((item) => (
        <div key={item.id} className={styles.stackItem}>
          {item.card?.image_uri ? (
            <img
              src={`/api/image-proxy?url=${encodeURIComponent(item.card.image_uri)}`}
              alt={item.card.name}
              className={styles.stackThumbnail}
            />
          ) : (
            <div className={styles.stackThumbnail} />
          )}
          <div className={styles.stackInfo}>
            <div className={styles.stackName}>{item.card?.name}</div>
            <div className={styles.stackController}>{item.controller}</div>
            {item.card?.mana_cost && (
              <ManaCost cost={item.card.mana_cost} size={14} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
