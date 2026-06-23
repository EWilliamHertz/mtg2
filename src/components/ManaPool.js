'use client';

import React from 'react';
import styles from './ManaPool.module.css';

const MANA_TYPES = [
  { key: 'W', label: 'White Mana', letter: 'W', colorClass: 'orbW' },
  { key: 'U', label: 'Blue Mana', letter: 'U', colorClass: 'orbU' },
  { key: 'B', label: 'Black Mana', letter: 'B', colorClass: 'orbB' },
  { key: 'R', label: 'Red Mana', letter: 'R', colorClass: 'orbR' },
  { key: 'G', label: 'Green Mana', letter: 'G', colorClass: 'orbG' },
  { key: 'C', label: 'Colorless Mana', letter: 'C', colorClass: 'orbC' },
];

export default function ManaPool({ manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } }) {
  return (
    <div className={styles.pool}>
      {MANA_TYPES.map(({ key, label, letter, colorClass }) => {
        const count = manaPool[key] || 0;
        const isActive = count > 0;

        const orbClasses = [
          styles.orb,
          styles[colorClass],
          isActive ? styles.orbActive : styles.orbEmpty,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={key} className={orbClasses} title={label}>
            <span>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
