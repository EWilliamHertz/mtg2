'use client';

import React from 'react';
import styles from './PhaseTracker.module.css';

const PHASES = [
  { id: 'untap', label: 'Untap', icon: '🔓' },
  { id: 'upkeep', label: 'Upkeep', icon: '⬆' },
  { id: 'draw', label: 'Draw', icon: '🃏' },
  { id: 'main1', label: 'Main 1', icon: '⚔' },
  { id: 'combat_begin', label: 'Begin Combat', icon: '⚔' },
  { id: 'combat_attackers', label: 'Declare Attackers', icon: '🗡' },
  { id: 'combat_blockers', label: 'Declare Blockers', icon: '🛡' },
  { id: 'combat_damage', label: 'Combat Damage', icon: '💥' },
  { id: 'combat_end', label: 'End Combat', icon: '🏁' },
  { id: 'main2', label: 'Main 2', icon: '⚔' },
  { id: 'end_step', label: 'End Step', icon: '⏭' },
  { id: 'cleanup', label: 'Cleanup', icon: '🧹' },
];

export default function PhaseTracker({ currentPhase, isActivePlayer, onAdvancePhase }) {
  const currentIndex = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div className={styles.tracker}>
      {PHASES.map((phase, index) => {
        let phaseClass = styles.phase;
        if (index === currentIndex) {
          phaseClass += ` ${styles.phaseCurrent}`;
        } else if (index < currentIndex) {
          phaseClass += ` ${styles.phasePast}`;
        }

        return (
          <div key={phase.id} className={phaseClass}>
            <span className={styles.phaseIcon}>{phase.icon}</span>
            <span>{phase.label}</span>
          </div>
        );
      })}

      <button
        className={`btn btn-primary btn-sm ${styles.nextBtn}`}
        disabled={!isActivePlayer}
        onClick={onAdvancePhase}
      >
        Next Phase
      </button>
    </div>
  );
}
