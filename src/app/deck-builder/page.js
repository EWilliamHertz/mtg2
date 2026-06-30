'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './page.module.css';
import Card from '@/components/Card';
import ManaCost from '@/components/ManaSymbols';

const COLORS = [
  { id: 'W', color: '#f8f6d8' },
  { id: 'U', color: '#c1d8e9' },
  { id: 'B', color: '#bab1ab' },
  { id: 'R', color: '#fba58f' },
  { id: 'G', color: '#9bd3ae' }
];

const TYPES = ['All', 'Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land'];
const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Mythic'];
const FORMATS = ['Casual', 'Standard', 'Modern', 'Legacy', 'Commander'];

export default function DeckBuilder() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedType, setSelectedType] = useState('All');
  const [cmcRange, setCmcRange] = useState([0, 7]);
  const [selectedRarity, setSelectedRarity] = useState('All');
  const [searchResults, setSearchResults] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [deckName, setDeckName] = useState('New Deck');
  const [deckFormat, setDeckFormat] = useState('Standard');
  const [deckCards, setDeckCards] = useState({}); 
  const [sideboardCards, setSideboardCards] = useState({});
  const [addingToSideboard, setAddingToSideboard] = useState(false);
  const [savedDecks, setSavedDecks] = useState([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [importExportText, setImportExportText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    Creatures: true, Instants: true, Sorceries: true, Enchantments: true, Artifacts: true, Lands: true, Planeswalkers: true, Other: true
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      loadDeck({ target: { value: id } });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchCards = async (reset = false) => {
    try {
      const p = reset ? 1 : page;
      const params = new URLSearchParams();
      if (debouncedQuery) params.append('q', debouncedQuery);
      if (selectedColors.length > 0) params.append('colors', selectedColors.join(','));
      if (selectedType !== 'All') params.append('type', selectedType);
      if (selectedRarity !== 'All') params.append('rarity', selectedRarity);
      params.append('cmc_min', cmcRange[0]);
      params.append('cmc_max', cmcRange[1]);
      params.append('page', p);

      const res = await fetch(`/ouyrie/api/cards?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(prev => reset ? data.cards : [...prev, ...data.cards]);
        setHasMore(data.hasMore);
      } else {
        if (reset) {
          setSearchResults([{ id: 'mock-1', name: 'Mock Card', type: 'Creature', cmc: 2, colors: ['U'], rarity: 'Rare', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg' }]);
          setHasMore(false);
        }
      }
    } catch (e) {
      console.error(e);
      if (reset) {
        setSearchResults([{ id: 'mock-1', name: 'Mock Card', type: 'Creature', cmc: 2, colors: ['U'], rarity: 'Rare', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg' }]);
        setHasMore(false);
      }
    }
  };

  useEffect(() => {
    fetchCards(true);
  }, [debouncedQuery, selectedColors, selectedType, selectedRarity, cmcRange]);

  useEffect(() => {
    if (page > 1) {
      fetchCards(false);
    }
  }, [page]);

  useEffect(() => {
    fetchSavedDecks();
  }, []);

  const fetchSavedDecks = async () => {
    try {
      const res = await fetch('/ouyrie/api/decks');
      if (res.ok) {
        const data = await res.json();
        setSavedDecks(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleColor = (colorId) => {
    setSelectedColors(prev => prev.includes(colorId) ? prev.filter(c => c !== colorId) : [...prev, colorId]);
  };

  const addCard = (card, forceSideboard = null) => {
    const isSide = forceSideboard !== null ? forceSideboard : addingToSideboard;
    const setFn = isSide ? setSideboardCards : setDeckCards;
    setFn(prev => {
      const cardId = card.scryfall_id;
      const existing = prev[cardId];
      const isBasicLand = card.type_line && card.type_line.includes('Basic Land');
      const maxAllowed = isBasicLand ? 99 : 4;
      // Note: This max checking only checks within the same deck section (main vs side).
      // Proper MTG rules check combined count, but this is okay for now.
      if (existing && existing.quantity >= maxAllowed) return prev;
      return {
        ...prev,
        [cardId]: { card, quantity: (existing ? existing.quantity + 1 : 1) }
      };
    });
  };

  const removeCard = (cardId, isSideboard) => {
    const setFn = isSideboard ? setSideboardCards : setDeckCards;
    setFn(prev => {
      const existing = prev[cardId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const newDeck = { ...prev };
        delete newDeck[cardId];
        return newDeck;
      }
      return {
        ...prev,
        [cardId]: { ...existing, quantity: existing.quantity - 1 }
      };
    });
  };

  const loadDeck = async (e) => {
    const id = e.target.value;
    setSelectedDeckId(id);
    if (!id) return;
    try {
      const res = await fetch(`/ouyrie/api/decks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDeckName(data.name || 'Loaded Deck');
        setDeckFormat(data.format || 'Standard');
        
        const main = {};
        const side = {};
        if (data.cards) {
          data.cards.forEach(c => {
            if (c.is_sideboard) {
              side[c.scryfall_id] = { card: c, quantity: c.quantity };
            } else {
              main[c.scryfall_id] = { card: c, quantity: c.quantity };
            }
          });
        }
        setDeckCards(main);
        setSideboardCards(side);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveDeck = async () => {
    const method = selectedDeckId ? 'PUT' : 'POST';
    const url = selectedDeckId ? `/api/decks/${selectedDeckId}` : '/api/decks';
    const combinedCards = {};
    Object.entries(deckCards).forEach(([id, entry]) => {
      combinedCards[`${id}_main`] = { cardId: id, quantity: entry.quantity, is_sideboard: false };
    });
    Object.entries(sideboardCards).forEach(([id, entry]) => {
      combinedCards[`${id}_side`] = { cardId: id, quantity: entry.quantity, is_sideboard: true };
    });

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deckName, format: deckFormat, cards: combinedCards })
      });
      if (res.ok) {
        alert('Deck saved successfully!');
        fetchSavedDecks();
        setShowSaveModal(false);
      } else {
        alert('Failed to save deck.');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving deck.');
    }
  };

  const deleteDeck = async () => {
    if (!selectedDeckId) return;
    try {
      const res = await fetch(`/ouyrie/api/decks/${selectedDeckId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Deck deleted.');
        newDeck();
        fetchSavedDecks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const newDeck = () => {
    setDeckName('New Deck');
    setDeckCards({});
    setSideboardCards({});
    setSelectedDeckId('');
  };

  const handleExport = () => {
    let list = Object.values(deckCards).map(c => `${c.quantity} ${c.card.name}`).join('\n');
    if (Object.keys(sideboardCards).length > 0) {
      list += '\n\nSideboard\n';
      list += Object.values(sideboardCards).map(c => `${c.quantity} ${c.card.name}`).join('\n');
    }
    setImportExportText(list);
    setShowImportExport(true);
  };

  const handleImport = async () => {
    setLoading(true);
    const lines = importExportText.split('\n').map(l => l.trim()).filter(l => l);
    const newMain = {};
    const newSide = {};
    let isSide = false;
    for (const line of lines) {
      if (line.toLowerCase() === 'sideboard') {
        isSide = true;
        continue;
      }
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const qty = parseInt(match[1], 10);
        const name = match[2];
        try {
          const res = await fetch(`/ouyrie/api/cards?q=${encodeURIComponent(name)}&exact=true&limit=1`);
          if (res.ok) {
            const data = await res.json();
            if (data.cards && data.cards.length > 0) {
              const card = data.cards[0];
              if (isSide) newSide[card.scryfall_id] = { card, quantity: qty };
              else newMain[card.scryfall_id] = { card, quantity: qty };
            }
          }
        } catch(e) {}
      }
    }
    setDeckCards(newMain);
    setSideboardCards(newSide);
    setShowImportExport(false);
    setLoading(false);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const groupedCards = Object.values(deckCards).reduce((acc, { card, quantity }) => {
    const t = (card.type_line || '').toLowerCase();
    let group = 'Other';
    if (t.includes('creature')) group = 'Creatures';
    else if (t.includes('instant')) group = 'Instants';
    else if (t.includes('sorcery')) group = 'Sorceries';
    else if (t.includes('enchantment')) group = 'Enchantments';
    else if (t.includes('artifact')) group = 'Artifacts';
    else if (t.includes('land')) group = 'Lands';
    else if (t.includes('planeswalker')) group = 'Planeswalkers';
    
    if (!acc[group]) acc[group] = [];
    acc[group].push({ card, quantity });
    return acc;
  }, {});

  const totalCards = Object.values(deckCards).reduce((sum, { quantity }) => sum + quantity, 0);

  const hasInvalidCopies = Object.values(deckCards).some(({ card, quantity }) => !(card.type || '').includes('Basic Land') && quantity > 4);

  return (
    <div className={styles.container}>
      <div className={styles.searchPanel}>
        <div className={styles.filters}>
          <div style={{ marginBottom: '15px' }}>
            <button onClick={() => window.location.href = '/'} className={`${styles.btn} ${styles.btnSecondary}`}>
              ← Back to Lobbies
            </button>
          </div>
          <input 
            type="text" 
            placeholder="Search cards..." 
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.colorFilters}>
            {COLORS.map(c => (
              <button 
                key={c.id} 
                className={`${styles.colorCircle} ${selectedColors.includes(c.id) ? styles.colorCircleActive : ''}`}
                style={{ backgroundColor: c.color }}
                onClick={() => toggleColor(c.id)}
              />
            ))}
          </div>
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className={styles.dropdown}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={selectedRarity} onChange={e => setSelectedRarity(e.target.value)} className={styles.dropdown}>
            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className={styles.cmcFilter}>
            <label>CMC: {cmcRange[0]} - {cmcRange[1] === 7 ? '7+' : cmcRange[1]}</label>
            <input type="range" min="0" max="7" value={cmcRange[1]} onChange={e => setCmcRange([cmcRange[0], parseInt(e.target.value)])} />
          </div>
        </div>

        <div className={styles.resultsGrid}>
          {searchResults.map((card, i) => (
            <div 
              key={card.scryfall_id + '-' + i} 
              className={styles.cardWrapper} 
              onClick={() => addCard(card)}
              onMouseEnter={() => setHoveredCard(card)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <Card card={card} size="md" />
            </div>
          ))}
          {hasMore && (
            <button className={styles.loadMoreBtn} onClick={() => setPage(p => p + 1)}>Load More</button>
          )}
        </div>
      </div>

      <div className={styles.deckPanel}>
        <div className={styles.deckHeader}>
          <h2 style={{ margin: 0, color: 'var(--color-primary)' }}>{deckName || 'New Deck'}</h2>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginLeft: '10px' }}>{deckFormat}</span>
          <select value={selectedDeckId} onChange={loadDeck} className={styles.dropdown} style={{ marginLeft: 'auto' }}>
            <option value="">-- Load Saved Deck --</option>
            {savedDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className={styles.deckActions}>
            <button onClick={() => setShowSaveModal(true)} className={`${styles.btn} ${styles.btnPrimary}`}>Save</button>
            <button onClick={newDeck} className={`${styles.btn} ${styles.btnSecondary}`}>New</button>
            <button onClick={() => setShowImportExport(true)} className={`${styles.btn} ${styles.btnSecondary}`}>Import/Export</button>
            {selectedDeckId && <button onClick={deleteDeck} className={`${styles.btn} ${styles.btnDanger}`}>Delete</button>}
          </div>
        </div>

        <div className={styles.deckStats}>
          <div className={`${styles.statPill} ${totalCards < 60 ? styles.warningText : ''}`}>
            {totalCards} Main Deck
          </div>
          <div className={styles.statPill}>
            {Object.values(sideboardCards).reduce((sum, c) => sum + c.quantity, 0)} Sideboard
          </div>
          {totalCards < 60 && <div className={styles.warningMessage}>Deck must have at least 60 cards.</div>}
          {hasInvalidCopies && <div className={styles.errorMessage}>Too many copies of a non-basic land!</div>}
          
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: '#c9a84c' }}>Add to Sideboard</label>
            <input type="checkbox" checked={addingToSideboard} onChange={e => setAddingToSideboard(e.target.checked)} />
          </div>
        </div>

        <div className={styles.deckList}>
          {['Creatures', 'Planeswalkers', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other'].map(group => {
            const cards = groupedCards[group];
            if (!cards || cards.length === 0) return null;
            const count = cards.reduce((sum, c) => sum + c.quantity, 0);
            return (
              <div key={group} className={styles.deckSection}>
                <div className={styles.sectionHeader} onClick={() => toggleSection(group)}>
                  {expandedSections[group] ? '▼' : '▶'} {group} ({count})
                </div>
                {expandedSections[group] && (
                  <div className={styles.sectionCards}>
                    {cards.map(({ card, quantity }) => (
                      <div key={card.scryfall_id} className={styles.deckRow} onMouseEnter={() => setHoveredCard(card)} onMouseLeave={() => setHoveredCard(null)}>
                        <div 
                          className={styles.rowControls}
                          onMouseEnter={() => setHoveredCard(null)}
                          onMouseLeave={() => setHoveredCard(card)}
                        >
                          <button onClick={() => removeCard(card.scryfall_id, false)} className={styles.qtyBtn}>-</button>
                          <span className={styles.qtySpan}>{quantity}</span>
                          <button onClick={() => addCard(card, false)} className={styles.qtyBtn}>+</button>
                        </div>
                        <span className={styles.rowName}>{card.name}</span>
                        <span className={styles.rowMana}><ManaCost cost={card.mana_cost || ''} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {Object.keys(sideboardCards).length > 0 && (
            <div className={styles.deckSection} style={{ marginTop: '20px', borderTop: '2px solid rgba(201,168,76,0.3)', paddingTop: '10px' }}>
              <div className={styles.sectionHeader} onClick={() => toggleSection('Sideboard')}>
                {expandedSections['Sideboard'] !== false ? '▼' : '▶'} Sideboard ({Object.values(sideboardCards).reduce((sum, c) => sum + c.quantity, 0)})
              </div>
              {expandedSections['Sideboard'] !== false && (
                <div className={styles.sectionCards}>
                  {Object.values(sideboardCards).map(({ card, quantity }) => (
                    <div key={card.scryfall_id} className={styles.deckRow} onMouseEnter={() => setHoveredCard(card)} onMouseLeave={() => setHoveredCard(null)}>
                      <div 
                        className={styles.rowControls}
                        onMouseEnter={() => setHoveredCard(null)}
                        onMouseLeave={() => setHoveredCard(card)}
                      >
                        <button onClick={() => removeCard(card.scryfall_id, true)} className={styles.qtyBtn}>-</button>
                        <span className={styles.qtySpan}>{quantity}</span>
                        <button onClick={() => addCard(card, true)} className={styles.qtyBtn}>+</button>
                      </div>
                      <span className={styles.rowName}>{card.name}</span>
                      <span className={styles.rowMana}><ManaCost cost={card.mana_cost || ''} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showImportExport && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)' }}>Import / Export Deck</h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>Format: [quantity] [card name] (e.g. "4 Lightning Bolt")</p>
            <textarea
              style={{ width: '100%', height: '300px', background: '#1a1a2e', color: '#e8e6e3', border: '1px solid rgba(201,168,76,0.5)', borderRadius: '8px', padding: '10px', resize: 'none' }}
              value={importExportText}
              onChange={e => setImportExportText(e.target.value)}
              placeholder="4 Lightning Bolt&#10;4 Mountain"
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowImportExport(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleExport} className="btn btn-secondary">Export to Text</button>
              <button onClick={handleImport} className="btn btn-primary" disabled={loading}>{loading ? 'Importing...' : 'Import List'}</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)' }}>Save Deck</h2>
            
            <label style={{ color: 'var(--color-primary)' }}>Deck Name</label>
            <input 
              type="text" 
              value={deckName} 
              onChange={e => setDeckName(e.target.value)} 
              className={styles.deckNameInput} 
              style={{ width: '100%', padding: '10px', background: '#1a1a2e', color: '#fff', border: '1px solid rgba(201,168,76,0.5)', borderRadius: '4px' }} 
            />
            
            <label style={{ color: 'var(--color-primary)', marginTop: '10px' }}>Format</label>
            <select 
              value={deckFormat} 
              onChange={e => setDeckFormat(e.target.value)} 
              className={styles.dropdown}
              style={{ width: '100%' }}
            >
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowSaveModal(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSaveDeck} className="btn btn-primary">Save Deck</button>
            </div>
          </div>
        </div>
      )}

      {hoveredCard && (
        <div className={styles.hoverPreview}>
          <img src={hoveredCard.image_uri ? `/api/image-proxy?url=${encodeURIComponent(hoveredCard.image_uri)}` : 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering_card_back.jpg'} alt={hoveredCard.name || 'Card'} />
        </div>
      )}
    </div>
  );
}
