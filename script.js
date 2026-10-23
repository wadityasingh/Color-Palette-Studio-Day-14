/**
 * Color Palette Studio — Application Logic (script.js)
 * Built with Vanilla JavaScript (ES6+)
 */

(function () {
  'use strict';

  /* ==========================================================================
     Constants & Storage Keys
     ========================================================================== */
  const SWATCH_COUNT = 5;
  const MAX_RECENT_PALETTES = 5;
  const STORAGE_KEY_RECENT = 'cps_recent_palettes_v1';
  const STORAGE_KEY_COUNTER = 'cps_generation_counter_v1';
  const HEX_REGEX = /^#[0-9A-F]{6}$/i;

  /* ==========================================================================
     Application State
     ========================================================================== */
  const state = {
    swatches: Array.from({ length: SWATCH_COUNT }, () => ({
      hex: '#EA580C',
      locked: false,
    })),
    paletteCounter: 0,
    recentPalettes: [],
    copyTimeouts: {},
    globalToastTimeout: null,
  };

  /* ==========================================================================
     DOM Element References
     ========================================================================== */
  const elements = {
    paletteGrid: document.getElementById('palette-grid'),
    generateBtn: document.getElementById('generate-btn'),
    copyAllBtn: document.getElementById('copy-all-btn'),
    copyAllText: document.getElementById('copy-all-text'),
    resetLocksBtn: document.getElementById('reset-locks-btn'),
    paletteCounter: document.getElementById('palette-counter'),
    lockStatusText: document.getElementById('lock-status-text'),
    headerStatus: document.getElementById('header-status'),
    globalFeedback: document.getElementById('global-feedback'),
    recentContainer: document.getElementById('recent-palettes-container'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mainNav: document.getElementById('main-nav'),
  };

  /* ==========================================================================
     Color Generation & Validation Utilities
     ========================================================================== */

  /**
   * Validates whether a string is a strict 6-character hexadecimal color code.
   * @param {string} hex
   * @returns {boolean}
   */
  function isValidHex(hex) {
    return typeof hex === 'string' && HEX_REGEX.test(hex.trim());
  }

  /**
   * Generates a single random 6-character uppercase HEX color using Math.random().
   * @returns {string} Valid HEX string e.g. "#E76F51"
   */
  function generateRandomHexColor() {
    const hexChars = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * 16);
      color += hexChars[randomIndex];
    }
    return isValidHex(color) ? color : '#EA580C';
  }

  /**
   * Converts a valid 6-digit HEX code into an RGB string for helpful secondary inspection.
   * @param {string} hex
   * @returns {string} e.g. "rgb(231, 111, 81)"
   */
  function hexToRgbString(hex) {
    if (!isValidHex(hex)) return 'rgb(0, 0, 0)';
    const clean = hex.slice(1);
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /* ==========================================================================
     Safe LocalStorage Helpers
     ========================================================================== */

  function loadStoredState() {
    try {
      const savedRecent = window.localStorage.getItem(STORAGE_KEY_RECENT);
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent);
        if (Array.isArray(parsed)) {
          state.recentPalettes = parsed
            .filter(
              (palette) =>
                Array.isArray(palette) &&
                palette.length === SWATCH_COUNT &&
                palette.every(isValidHex)
            )
            .slice(0, MAX_RECENT_PALETTES);
        }
      }

      const savedCount = window.localStorage.getItem(STORAGE_KEY_COUNTER);
      if (savedCount !== null) {
        const parsedCount = parseInt(savedCount, 10);
        if (!Number.isNaN(parsedCount) && parsedCount >= 0) {
          state.paletteCounter = parsedCount;
        }
      }
    } catch {
      // Ignore storage errors if localStorage is disabled or restricted
    }
  }

  function saveStoredState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_RECENT,
        JSON.stringify(state.recentPalettes)
      );
      window.localStorage.setItem(
        STORAGE_KEY_COUNTER,
        String(state.paletteCounter)
      );
    } catch {
      // Fail gracefully if localStorage is unavailable
    }
  }

  function addPaletteToHistory(hexArray) {
    if (!Array.isArray(hexArray) || !hexArray.every(isValidHex)) return;

    const normalized = hexArray.map((h) => h.toUpperCase());
    const signature = normalized.join(',');

    // Avoid duplicate consecutive entries
    const filtered = state.recentPalettes.filter(
      (existing) => existing.join(',') !== signature
    );

    state.recentPalettes = [normalized, ...filtered].slice(
      0,
      MAX_RECENT_PALETTES
    );
    saveStoredState();
  }

  /* ==========================================================================
     Clipboard Copy Helpers (Clipboard API + Fallback)
     ========================================================================== */

  /**
   * Copies text to clipboard using navigator.clipboard.writeText() with a fallback.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyTextToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to fallback method if Clipboard API is blocked by permissions
      }
    }

    // Fallback copy method using a temporary off-screen textarea
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const succeeded = document.execCommand('copy');
      document.body.removeChild(textArea);
      return succeeded;
    } catch {
      return false;
    }
  }

  /* ==========================================================================
     UI Feedback & Status Updates
     ========================================================================== */

  function updateHeaderStatus(message) {
    if (!elements.headerStatus) return;
    elements.headerStatus.textContent = message;
  }

  function showGlobalFeedback(message) {
    if (!elements.globalFeedback) return;
    elements.globalFeedback.textContent = message;
    elements.globalFeedback.hidden = false;

    if (state.globalToastTimeout) {
      clearTimeout(state.globalToastTimeout);
    }

    state.globalToastTimeout = setTimeout(() => {
      elements.globalFeedback.hidden = true;
    }, 2600);
  }

  function showSwatchCopyConfirmation(index, hex) {
    const card = elements.paletteGrid.querySelector(
      `[data-swatch-index="${index}"]`
    );
    if (!card) return;

    const copyBtnText = card.querySelector('.copy-btn-label');
    card.classList.add('is-copied');
    if (copyBtnText) {
      copyBtnText.textContent = 'Copied!';
    }

    updateHeaderStatus(`Copied ${hex} to clipboard`);

    if (state.copyTimeouts[index]) {
      clearTimeout(state.copyTimeouts[index]);
    }

    state.copyTimeouts[index] = setTimeout(() => {
      card.classList.remove('is-copied');
      if (copyBtnText) {
        copyBtnText.textContent = 'Copy';
      }
      updateHeaderStatus('Ready to create');
    }, 1400);
  }

  /* ==========================================================================
     Core Palette Actions
     ========================================================================== */

  function generateNewPalette() {
    const lockedCount = state.swatches.filter((s) => s.locked).length;
    if (lockedCount === SWATCH_COUNT) {
      showGlobalFeedback(
        'All 5 swatches are currently locked. Unlock at least one swatch or click "Reset Locks" to generate new colors.'
      );
      return;
    }

    state.swatches = state.swatches.map((swatch) => {
      if (swatch.locked && isValidHex(swatch.hex)) {
        return swatch;
      }
      return {
        hex: generateRandomHexColor(),
        locked: false,
      };
    });

    state.paletteCounter += 1;
    const currentHexList = state.swatches.map((s) => s.hex);
    addPaletteToHistory(currentHexList);

    renderPalette();
    renderToolbarMeta();
    renderRecentPalettes();
    updateHeaderStatus('New palette generated');
  }

  async function handleSingleSwatchCopy(index) {
    const swatch = state.swatches[index];
    if (!swatch || !isValidHex(swatch.hex)) return;

    const hexToCopy = swatch.hex.toUpperCase();
    const success = await copyTextToClipboard(hexToCopy);

    if (success) {
      showSwatchCopyConfirmation(index, hexToCopy);
    } else {
      showGlobalFeedback(
        `Unable to access clipboard automatically. Color code: ${hexToCopy}`
      );
    }
  }

  async function handleCopyAllColors() {
    const validHexes = state.swatches
      .map((s) => s.hex.toUpperCase())
      .filter(isValidHex);

    if (validHexes.length !== SWATCH_COUNT) return;

    const formattedList = validHexes.join('\n');
    const success = await copyTextToClipboard(formattedList);

    if (success) {
      if (elements.copyAllText) {
        elements.copyAllText.textContent = 'Copied All 5 Colors!';
      }
      updateHeaderStatus('Copied all 5 HEX codes');

      setTimeout(() => {
        if (elements.copyAllText) {
          elements.copyAllText.textContent = 'Copy All Colors';
        }
        updateHeaderStatus('Ready to create');
      }, 1600);
    } else {
      showGlobalFeedback(
        `Clipboard unavailable. Palette: ${validHexes.join(', ')}`
      );
    }
  }

  function toggleSwatchLock(index) {
    if (!state.swatches[index]) return;
    state.swatches[index].locked = !state.swatches[index].locked;
    renderPalette();
    renderToolbarMeta();

    const status = state.swatches[index].locked ? 'Locked' : 'Unlocked';
    updateHeaderStatus(`${status} ${state.swatches[index].hex}`);
  }

  function resetAllLocks() {
    const hadLocks = state.swatches.some((s) => s.locked);
    if (!hadLocks) return;

    state.swatches.forEach((swatch) => {
      swatch.locked = false;
    });

    renderPalette();
    renderToolbarMeta();
    updateHeaderStatus('All locks reset');
  }

  function restorePaletteFromHistory(hexArray) {
    if (!Array.isArray(hexArray) || hexArray.length !== SWATCH_COUNT) return;
    if (!hexArray.every(isValidHex)) return;

    state.swatches = hexArray.map((hex, idx) => ({
      hex: hex.toUpperCase(),
      locked: state.swatches[idx] ? state.swatches[idx].locked : false,
    }));

    renderPalette();
    renderToolbarMeta();
    updateHeaderStatus('Restored palette from history');
  }

  function clearRecentHistory() {
    state.recentPalettes = [];
    saveStoredState();
    renderRecentPalettes();
    updateHeaderStatus('Cleared recent palettes');
  }

  /* ==========================================================================
     DOM Rendering
     ========================================================================== */

  function renderToolbarMeta() {
    if (elements.paletteCounter) {
      elements.paletteCounter.textContent = String(state.paletteCounter);
    }

    const lockedCount = state.swatches.filter((s) => s.locked).length;
    if (elements.lockStatusText) {
      elements.lockStatusText.textContent = `${lockedCount} of ${SWATCH_COUNT} locked`;
    }

    if (elements.resetLocksBtn) {
      elements.resetLocksBtn.disabled = lockedCount === 0;
    }
  }

  function renderPalette() {
    if (!elements.paletteGrid) return;

    elements.paletteGrid.innerHTML = '';

    state.swatches.forEach((swatch, index) => {
      const hex = isValidHex(swatch.hex) ? swatch.hex.toUpperCase() : '#EA580C';
      const rgb = hexToRgbString(hex);
      const isLocked = Boolean(swatch.locked);

      const card = document.createElement('article');
      card.className = `swatch-card${isLocked ? ' is-locked' : ''}`;
      card.setAttribute('role', 'listitem');
      card.setAttribute('data-swatch-index', String(index));

      // Color Swatch Area
      const colorArea = document.createElement('div');
      colorArea.className = 'swatch-color-area';
      colorArea.style.backgroundColor = hex;
      colorArea.setAttribute('role', 'button');
      colorArea.setAttribute('tabindex', '0');
      colorArea.setAttribute(
        'aria-label',
        `Color swatch ${index + 1}, HEX ${hex}. Click to copy color code.`
      );

      // Top bar inside color area: index + lock toggle
      const topRow = document.createElement('div');
      topRow.className = 'swatch-top-row';

      const indexBadge = document.createElement('span');
      indexBadge.className = 'swatch-index tabular-nums';
      indexBadge.textContent = `0${index + 1}`;

      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'lock-btn';
      lockBtn.setAttribute('aria-pressed', String(isLocked));
      lockBtn.setAttribute(
        'aria-label',
        isLocked ? `Unlock color ${hex}` : `Lock color ${hex}`
      );
      lockBtn.innerHTML = `
        <span class="css-icon-lock" aria-hidden="true"></span>
        <span>${isLocked ? 'Locked' : 'Lock'}</span>
      `;

      lockBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSwatchLock(index);
      });

      topRow.appendChild(indexBadge);
      topRow.appendChild(lockBtn);

      const clickHint = document.createElement('span');
      clickHint.className = 'swatch-click-hint';
      clickHint.textContent = 'Click to copy';

      colorArea.appendChild(topRow);
      colorArea.appendChild(clickHint);

      colorArea.addEventListener('click', () => {
        handleSingleSwatchCopy(index);
      });

      colorArea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          if (event.target === colorArea) {
            event.preventDefault();
            handleSingleSwatchCopy(index);
          }
        }
      });

      // Swatch Footer (HEX code + RGB + Copy Button + Confirmation)
      const footer = document.createElement('div');
      footer.className = 'swatch-footer';

      const codeRow = document.createElement('div');
      codeRow.className = 'swatch-code-row';

      const hexBtn = document.createElement('button');
      hexBtn.type = 'button';
      hexBtn.className = 'hex-code-btn tabular-nums';
      hexBtn.textContent = hex;
      hexBtn.setAttribute('aria-label', `Copy HEX code ${hex}`);
      hexBtn.addEventListener('click', () => {
        handleSingleSwatchCopy(index);
      });

      const confirmSpan = document.createElement('span');
      confirmSpan.className = 'copy-confirm-msg';
      confirmSpan.setAttribute('aria-live', 'polite');
      confirmSpan.textContent = 'Copied!';

      codeRow.appendChild(hexBtn);
      codeRow.appendChild(confirmSpan);

      const rgbLabel = document.createElement('span');
      rgbLabel.className = 'rgb-label tabular-nums';
      rgbLabel.textContent = rgb;

      const actionRow = document.createElement('div');
      actionRow.className = 'swatch-action-row';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'copy-swatch-btn';
      copyBtn.setAttribute('aria-label', `Copy ${hex} to clipboard`);
      copyBtn.innerHTML = `
        <span class="css-icon-copy" aria-hidden="true"></span>
        <span class="copy-btn-label">Copy</span>
      `;
      copyBtn.addEventListener('click', () => {
        handleSingleSwatchCopy(index);
      });

      actionRow.appendChild(copyBtn);

      footer.appendChild(codeRow);
      footer.appendChild(rgbLabel);
      footer.appendChild(actionRow);

      card.appendChild(colorArea);
      card.appendChild(footer);

      elements.paletteGrid.appendChild(card);
    });
  }

  function renderRecentPalettes() {
    if (!elements.recentContainer) return;

    elements.recentContainer.innerHTML = '';

    if (elements.clearHistoryBtn) {
      elements.clearHistoryBtn.hidden = state.recentPalettes.length === 0;
    }

    if (state.recentPalettes.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent =
        'No palette history yet. Click "Generate New Palette" to build your recent palettes list.';
      elements.recentContainer.appendChild(emptyDiv);
      return;
    }

    const grid = document.createElement('div');
      grid.className = 'recent-grid';

    state.recentPalettes.forEach((palette, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-palette-btn';
      btn.setAttribute(
        'aria-label',
        `Restore recent palette ${idx + 1}: ${palette.join(', ')}`
      );

      const strip = document.createElement('div');
      strip.className = 'recent-strip';

      palette.forEach((hex) => {
        const cell = document.createElement('span');
        cell.className = 'recent-strip-cell';
        cell.style.backgroundColor = hex;
        strip.appendChild(cell);
      });

      const meta = document.createElement('div');
      meta.className = 'recent-meta';
      meta.innerHTML = `
        <span class="tabular-nums">Palette #${idx + 1}</span>
        <span class="recent-restore-label">Restore</span>
      `;

      const codesPreview = document.createElement('div');
      codesPreview.className = 'recent-codes-preview tabular-nums';
      codesPreview.textContent = palette.join(' · ');

      btn.appendChild(strip);
      btn.appendChild(meta);
      btn.appendChild(codesPreview);

      btn.addEventListener('click', () => {
        restorePaletteFromHistory(palette);
      });

      grid.appendChild(btn);
    });

    elements.recentContainer.appendChild(grid);
  }

  /* ==========================================================================
     Event Listeners & Initialization
     ========================================================================== */

  function setupEventListeners() {
    if (elements.generateBtn) {
      elements.generateBtn.addEventListener('click', generateNewPalette);
    }

    if (elements.copyAllBtn) {
      elements.copyAllBtn.addEventListener('click', handleCopyAllColors);
    }

    if (elements.resetLocksBtn) {
      elements.resetLocksBtn.addEventListener('click', resetAllLocks);
    }

    if (elements.clearHistoryBtn) {
      elements.clearHistoryBtn.addEventListener('click', clearRecentHistory);
    }

    // Mobile Menu Toggle
    if (elements.mobileMenuBtn && elements.mainNav) {
      elements.mobileMenuBtn.addEventListener('click', () => {
        const isOpen = elements.mainNav.classList.toggle('is-open');
        elements.mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
      });

      elements.mainNav.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          elements.mainNav.classList.remove('is-open');
          elements.mobileMenuBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  function init() {
    loadStoredState();
    setupEventListeners();
    // Automatically generate initial 5-color palette on page load
    generateNewPalette();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
