'use client';

import React, { useRef, useEffect } from 'react';
import styles from './GameLog.module.css';

export default function GameLog({ logs = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={styles.logContainer} ref={scrollRef}>
      <div className={styles.logTitle}>Game Log</div>
      {logs.length === 0 ? (
        <div className={styles.logEntry}>No events yet.</div>
      ) : (
        logs.map((log, i) => {
          const message = typeof log === 'string' ? log : log.message;
          const timestamp = typeof log === 'object' ? log.timestamp : null;

          return (
            <div key={i} className={styles.logEntry}>
              {timestamp && (
                <span className={styles.logTimestamp}>{timestamp}</span>
              )}
              {message}
            </div>
          );
        })
      )}
    </div>
  );
}
