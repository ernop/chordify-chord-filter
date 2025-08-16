// ==UserScript==
// @name         Chordify: Only show the chords I don't know yet, and sort them.
// @namespace    https://chordify.net
// @version      0.5
// @description  Remove chosen chord blocks, auto-switch Diagrams -> Summary, and alphabetically sort remaining chord blocks. You can configure the chords you know already so they won't be shown. Chordify is awesome!
// @match        https://chordify.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- Blocklist (exact text, including Unicode glyphs) ---------------------
  // Majors:
  //   A B C D E F G
  // Minors:
  //   Aₘ Bₘ Cₘ Dₘ Eₘ Fₘ Gₘ
  // Flats:
  //   A♭ B♭ C♭ D♭ E♭ F♭ G♭
  // Flat minors:
  //   A♭ₘ B♭ₘ C♭ₘ D♭ₘ E♭ₘ F♭ₘ G♭ₘ
  const blockedChordsList = [
    'A','B','C','D','E','F','G',
    'Aₘ','Bₘ','Cₘ','Dₘ','Eₘ','Fₘ','Gₘ',
    'A♭','B♭','C♭','D♭','E♭','F♭','G♭',
    'A♭ₘ','B♭ₘ','C♭ₘ','D♭ₘ','E♭ₘ','F♭ₘ','G♭ₘ',
  ];
  const blockedChords = new Set(blockedChordsList);

  const normalize = (s) => (s || '').trim().normalize('NFC');

  const isTargetSpan = (span) =>
    span &&
    span.classList.contains('cbg1qdk') &&
    blockedChords.has(normalize(span.textContent));

  // Heuristic guard so we only remove real chord-diagram blocks
  const isChordBlock = (el) =>
    !!el?.querySelector?.('svg use[href*="/api/v2/diagrams/instruments/"]');

  // Try to identify the "outer" chord block container
  const chordContainerFor = (span) =>
    span.closest('div.deu1fhf') || // wrapper seen in prior snapshots
    span.closest('div');           // fallback

  function purge(root = document) {
    root.querySelectorAll('span.cbg1qdk').forEach((span) => {
      if (!isTargetSpan(span)) return;
      const container = chordContainerFor(span);
      if (container && isChordBlock(container)) container.remove();
    });
  }

  // --- Sorting helpers (alphabetical by visible chord text) -----------------
  const chordKey = (el) => {
    const t = normalize(el.querySelector('span.cbg1qdk')?.textContent || '');
    // Normalize symbols so simple ASCII sorting groups as expected
    return t
      .replace(/\s+/g, '')
      .replace(/ₘ/g, 'm')
      .replace(/♭/g, 'b')
      .replace(/♯/g, '#');
  };

  function sortChordBlocks(root = document) {
    // Collect remaining chord blocks grouped by parent element
    const blocks = [...root.querySelectorAll('div.deu1fhf')].filter(isChordBlock);
    if (blocks.length < 2) return;

    const byParent = new Map();
    for (const b of blocks) {
      const p = b.parentElement;
      if (!p) continue;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(b);
    }

    // Sort each group and re-append in sorted order
    for (const [parent, list] of byParent) {
      list.sort((a, b) => chordKey(a).localeCompare(chordKey(b), undefined, { sensitivity: 'base' }));
      for (const el of list) parent.appendChild(el);
    }
  }

  // Debounce sorting to avoid thrash during rapid DOM updates
  let _sortPending = false;
  const queueSort = () => {
    if (_sortPending) return;
    _sortPending = true;
    setTimeout(() => {
      _sortPending = false;
      sortChordBlocks();
    }, 50);
  };

  // --- Auto-click "Summary" (not "Animated") when in Diagrams view ----------
  function onDiagramsPage() {
    return !!document.querySelector('.view-diagrams');
  }

  function clickSummaryIfPresent(root = document) {
    if (!onDiagramsPage()) return;
    const candidates = root.querySelectorAll('button, [role="button"], a');
    for (const el of candidates) {
      const txt = normalize(el.textContent || '');
      if (!txt) continue;
      // Only click the one labeled exactly "Summary"
      if (/^summary$/i.test(txt) && !el.dataset._clickedSummary) {
        el.dataset._clickedSummary = '1';
        el.click();
        break;
      }
    }
  }

  // --- Init -----------------------------------------------------------------
  const start = () => {
    purge();
    queueSort();              // sort remaining blocks after purging
    clickSummaryIfPresent();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // --- React to dynamic changes --------------------------------------------
  const mo = new MutationObserver((mutations) => {
    let touched = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;

        // Directly-added matching span
        if (node.matches?.('span.cbg1qdk') && isTargetSpan(node)) {
          const container = chordContainerFor(node);
          if (container && isChordBlock(container)) {
            container.remove();
            touched = true;
          }
        } else {
          // Spans added deeper in the subtree
          const spans = node.querySelectorAll?.('span.cbg1qdk');
          if (spans?.length) {
            purge(node);
            touched = true;
          }
        }

        // Try to click "Summary" when it appears
        clickSummaryIfPresent(node);
      }
    }
    if (touched) queueSort();
  });

  mo.observe(document.body, { childList: true, subtree: true });

  // In case the app client-side navigates without reloads, re-check periodically
  let lastTick = 0;
  const tick = () => {
    const now = Date.now();
    if (now - lastTick > 1500) {
      lastTick = now;
      clickSummaryIfPresent();
      queueSort();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
