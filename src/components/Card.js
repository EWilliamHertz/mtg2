'use client';

import React, { useState, useCallback } from 'react';
import styles from './Card.module.css';

const SIZE_CLASSES = {
  sm: styles.cardSm,
  md: styles.cardMd,
  lg: styles.cardLg,
};

/**
 * Renders a single MTG card with visual states and interactions.
 */
export default function Card({
  card,
  size = 'md',
  tapped = false,
  summoningSick = false,
  attacking = false,
  blocking = false,
  selected = false,
  onClick,
  onRightClick,
  onMouseEnter,
  onMouseLeave,
  showBack = false,
  style,
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleContextMenu = useCallback(
    (e) => {
      if (onRightClick) {
        e.preventDefault();
        onRightClick(e, card);
      }
    },
    [onRightClick, card]
  );

  const handleClick = useCallback(
    (e) => {
      if (onClick) {
        onClick(e, card);
      }
    },
    [onClick, card]
  );

  const handleMouseEnter = useCallback(
    (e) => {
      if (onMouseEnter) {
        onMouseEnter(e, card);
      }
    },
    [onMouseEnter, card]
  );

  const handleMouseLeave = useCallback(
    (e) => {
      if (onMouseLeave) {
        onMouseLeave(e, card);
      }
    },
    [onMouseLeave, card]
  );

  if (!card) return null;

  // Build class list
  const classNames = [
    styles.card,
    SIZE_CLASSES[size] || SIZE_CLASSES.md,
    tapped && styles.tapped,
    summoningSick && styles.summoningSick,
    attacking && styles.attacking,
    blocking && styles.blocking,
    selected && styles.selected,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={style}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-label={card.name || 'MTG Card'}
      title={card.name}
    >
      {showBack ? (
        /* Card Back Design */
        <div className={styles.cardBack} />
      ) : (
        <>
          {/* Shimmer placeholder while image loads */}
          {!imageLoaded && <div className={styles.shimmer} />}

          {/* Card Image */}
          <img
            className={styles.cardImage}
            src={card.image_uri ? `/api/image-proxy?url=${encodeURIComponent(card.image_uri)}` : ''}
            alt={card.name || 'MTG Card'}
            loading="lazy"
            draggable={false}
            onLoad={handleLoad}
            style={{
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 300ms ease',
            }}
          />
        </>
      )}
    </div>
  );
}
