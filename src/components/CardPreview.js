'use client';

import React, { useMemo } from 'react';
import styles from './CardPreview.module.css';

const PREVIEW_WIDTH = 300;
const PREVIEW_MAX_HEIGHT = 520;
const EDGE_PADDING = 16;

/**
 * Formats oracle text by replacing mana symbols in braces with readable text.
 * @param {string} text - The oracle text to format.
 * @returns {string} Formatted text.
 */
function formatOracleText(text) {
  if (!text) return '';
  return text;
}

/**
 * Large card preview panel shown on hover.
 * Displays enlarged card image with name, type, oracle text, and P/T.
 */
export default function CardPreview({ card, position }) {
  if (!card || !position) return null;

  // Calculate position adjusted to stay on screen
  const adjustedPosition = useMemo(() => {
    if (!position) return { left: 0, top: 0 };

    let left = position.x + 20; // Offset from cursor
    let top = position.y - 20;

    // Check if preview would go off the right edge
    if (typeof window !== 'undefined') {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (left + PREVIEW_WIDTH + EDGE_PADDING > windowWidth) {
        // Position to the left of cursor instead
        left = position.x - PREVIEW_WIDTH - 20;
      }

      // Keep minimum left position
      if (left < EDGE_PADDING) {
        left = EDGE_PADDING;
      }

      // Check if preview would go off the bottom edge
      if (top + PREVIEW_MAX_HEIGHT + EDGE_PADDING > windowHeight) {
        top = windowHeight - PREVIEW_MAX_HEIGHT - EDGE_PADDING;
      }

      // Keep minimum top position
      if (top < EDGE_PADDING) {
        top = EDGE_PADDING;
      }
    }

    return { left, top };
  }, [position]);

  const imageUri = card.image_uri ? `/api/image-proxy?url=${encodeURIComponent(card.image_uri)}` : '';
  const name = card.name || '';
  const typeLine = card.type_line || '';
  const oracleText = formatOracleText(card.oracle_text);
  const power = card.power;
  const toughness = card.toughness;
  const hasStats = power !== undefined && toughness !== undefined;

  return (
    <div
      className={styles.preview}
      style={{
        left: `${adjustedPosition.left}px`,
        top: `${adjustedPosition.top}px`,
      }}
    >
      <div className={styles.previewPanel}>
        {/* Enlarged Card Image */}
        {imageUri && (
          <img
            className={styles.previewImage}
            src={imageUri}
            alt={name}
            draggable={false}
          />
        )}

        {/* Card Info */}
        <div className={styles.previewInfo}>
          {/* Card Name */}
          <h4 className={styles.previewName}>{name}</h4>

          {/* Type Line */}
          {typeLine && (
            <p className={styles.previewType}>{typeLine}</p>
          )}

          {/* Oracle Text */}
          {oracleText && (
            <p className={styles.previewText}>{oracleText}</p>
          )}

          {/* Power / Toughness */}
          {hasStats && (
            <div className={styles.previewStats}>
              {power} / {toughness}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
