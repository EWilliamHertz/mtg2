'use client';

import React from 'react';

/**
 * Parses a mana cost string like "{2}{W}{U}" into an array of symbol strings.
 * @param {string} manaCost - The mana cost string to parse.
 * @returns {string[]} Array of symbol strings (e.g., ['2', 'W', 'U']).
 */
export function parseManaSymbols(manaCost) {
  if (!manaCost) return [];
  const symbols = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(manaCost)) !== null) {
    symbols.push(match[1]);
  }
  return symbols;
}

/**
 * Converts a mana symbol string to the Scryfall SVG filename.
 * Hybrid symbols like "W/U" become "WU".
 * @param {string} symbol - The raw symbol string.
 * @returns {string} The formatted symbol for the Scryfall URL.
 */
function formatSymbolForUrl(symbol) {
  // Replace slashes for hybrid mana (e.g., W/U → WU, 2/W → 2W)
  return symbol.replace(/\//g, '');
}

/**
 * Renders a mana cost string as a row of Scryfall SVG icons.
 * @param {{ cost: string, size?: number }} props
 */
export default function ManaCost({ cost, size = 16 }) {
  if (!cost) return null;

  const symbols = parseManaSymbols(cost);
  if (symbols.length === 0) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1px',
      }}
      aria-label={`Mana cost: ${cost}`}
    >
      {symbols.map((symbol, index) => {
        const formatted = formatSymbolForUrl(symbol);
        return (
          <img
            key={`${symbol}-${index}`}
            src={`/api/image-proxy?url=${encodeURIComponent(`https://svgs.scryfall.io/card-symbols/${formatted}.svg`)}`}
            alt={symbol}
            width={size}
            height={size}
            draggable={false}
            style={{
              display: 'inline-block',
              width: `${size}px`,
              height: `${size}px`,
              verticalAlign: 'middle',
              marginRight: '2px',
              flexShrink: 0,
            }}
          />
        );
      })}
    </span>
  );
}
