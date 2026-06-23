'use client';

import React, { useRef, useEffect, useState } from 'react';
import styles from './LifeCounter.module.css';

export default function LifeCounter({ life, playerName, isOpponent = false, previousLife }) {
  const prevLifeRef = useRef(life);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    const prev = prevLifeRef.current;

    if (life < prev) {
      setAnimClass(styles.damage);
    } else if (life > prev) {
      setAnimClass(styles.heal);
    }

    prevLifeRef.current = life;

    if (life !== prev) {
      const timer = setTimeout(() => {
        setAnimClass('');
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [life]);

  const lifeClasses = [
    styles.life,
    isOpponent ? styles.lifeSmall : '',
    animClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.counter}>
      {isOpponent && <span className={styles.playerName}>{playerName}</span>}
      <span className={lifeClasses}>{life}</span>
      {!isOpponent && <span className={styles.playerName}>{playerName}</span>}
    </div>
  );
}
