'use client';

import React from 'react';
import Card from './Card';
import styles from './Battlefield.module.css';

export default function Battlefield({
  cards = [],
  onCardClick,
  onCardHover,
  onCardLeave,
  isOpponent = false,
}) {
  // Group cards by type
  // New code
  const lands = cards.filter((p) => p?.type_line?.includes('Land'));
  const creatures = cards.filter((p) => p?.type_line?.includes('Creature'));
  const others = cards.filter(
    (p) =>
      !p?.type_line?.includes('Land') &&
      !p?.type_line?.includes('Creature')
  );

  const renderZone = (permanents, label) => {
    if (permanents.length === 0) {
      return (
        <div className={styles.zone}>
          <div className={styles.zoneLabel}>{label}</div>
          <div className={`${styles.zone} ${styles.emptyZone}`} />
        </div>
      );
    }

    return (
      <div>
        <div className={styles.zoneLabel}>{label}</div>
        <div className={styles.zone}>
          {permanents.map((permanent) => (
            // New code
            <div
              key={permanent.instanceId}
              onClick={() => onCardClick?.(permanent)}
              onMouseEnter={(e) => onCardHover?.(permanent, e)}
              onMouseLeave={() => onCardLeave?.()}
            >
              <Card
                card={permanent}
                size="sm"
                tapped={permanent.tapped}
                summoningSick={permanent.summoningSick}
                attacking={permanent.attacking}
                blocking={permanent.blocking}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Player layout: others (top), creatures (middle), lands (bottom)
  // Opponent layout: reversed (lands top, creatures middle, others bottom)
  const zones = isOpponent
    ? [
        { permanents: lands, label: 'Lands' },
        { permanents: creatures, label: 'Creatures' },
        { permanents: others, label: 'Other Permanents' },
      ]
    : [
        { permanents: others, label: 'Other Permanents' },
        { permanents: creatures, label: 'Creatures' },
        { permanents: lands, label: 'Lands' },
      ];

  return (
    <div
      className={`${styles.battlefield} ${isOpponent ? styles.battlefieldOpponent : ''}`}
    >
      {zones.map((zone) => (
        <div key={zone.label}>
          {renderZone(zone.permanents, zone.label)}
        </div>
      ))}
    </div>
  );
}
