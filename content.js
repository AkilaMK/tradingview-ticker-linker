// content.js - TradingView Ticker Sidebar

// Configuration
const CONFIG = {
  tickerRegex: /\$([A-Z]{1,5})(?=\s|$|[^\w])/g,
  tradingViewBaseUrl: 'https://www.tradingview.com/symbols/',
  sidebarId: 'ticker-sidebar',
  processedAttribute: 'data-ticker-processed',
  updateInterval: 1000,
  maxTickers: 100
};

// Site-specific configurations
const SITE_CONFIG = {
  'x.com': {
    selectors: [
      '[data-testid="tweetText"]',
      '[data-testid="tweet"]',
      'div[lang]',
      '.css-901oao'
    ]
  },
  'twitter.com': {
    selectors: [
      '[data-testid="tweetText"]',
      '[data-testid="tweet"]',
      'div[lang]',
      '.css-901oao'
    ]
  },
  default: {
    selectors: ['body']
  }
};

// Global state
let discoveredTickers = new Map(); // ticker -> {count, lastSeen, price}
let sidebar = null;
let isCollapsed = false;
let updateTimer = null;

/**
 * Get site configuration based on current domain
 */
function getSiteConfig() {
  const hostname = window.location.hostname.toLowerCase();
  return SITE_CONFIG[hostname] || SITE_CONFIG.default;
}

/**
 * Validate ticker symbol - now accepts any 1-5 letter ticker
 */
function isValidTicker(ticker) {
  return /^[A-Z]{1,5}$/.test(ticker);
}

/**
 * Get target elements for scanning
 */
function getTargetElements() {
  const config = getSiteConfig();
  const elements = [];

  config.selectors.forEach(selector => {
    try {
      const found = document.querySelectorAll(selector);
      elements.push(...found);
    } catch (error) {
      console.warn('TradingView Ticker Sidebar: Invalid selector:', selector);
    }
  });

  return elements;
}

/**
 * Create the sidebar HTML structure
 */
function createSidebar() {
  const sidebar = document.createElement('div');
  sidebar.id = CONFIG.sidebarId;
  sidebar.innerHTML = `
    <div class="ticker-sidebar-header">
      <div class="ticker-sidebar-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17h18v2H3v-2zm16.5-7L15 5.5 13 7.5 8.5 3 3 8.5 4.5 10l4-4 4.5 4.5 2-2L19.5 14h-.5v-4z"/>
        </svg>
        Tickers Found
      </div>
      <div class="ticker-sidebar-controls">
        <span class="ticker-count">0</span>
        <button class="ticker-collapse-btn" title="Collapse">−</button>
        <button class="ticker-close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="ticker-sidebar-content">
      <div class="ticker-list"></div>
      <div class="ticker-sidebar-footer">
        <small>Click any ticker to view chart on TradingView</small>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #${CONFIG.sidebarId} {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      max-height: 75vh;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      color: white;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
    }

    #${CONFIG.sidebarId}.collapsed .ticker-sidebar-content {
      display: none;
    }

    #${CONFIG.sidebarId}.collapsed {
      height: auto;
    }

    .ticker-sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #333;
      background: #2a2a2a;
      border-radius: 12px 12px 0 0;
      flex-shrink: 0;
    }

    .ticker-sidebar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #2962FF;
    }

    .ticker-sidebar-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ticker-count {
      background: #2962FF;
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      min-width: 20px;
      text-align: center;
    }

    .ticker-collapse-btn,
    .ticker-close-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 16px;
      line-height: 1;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ticker-collapse-btn:hover,
    .ticker-close-btn:hover {
      background: #333;
      color: white;
    }

    .ticker-sidebar-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .ticker-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      min-height: 200px;
      max-height: calc(75vh - 120px);
    }

    .ticker-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      margin: 4px 0;
      background: #2a2a2a;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }

    .ticker-item:hover {
      background: #333;
      border-color: #2962FF;
    }

    .ticker-item-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ticker-symbol {
      font-weight: 600;
      color: #2962FF;
    }

    .ticker-count-badge {
      background: #444;
      color: #ccc;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
      min-width: 18px;
      text-align: center;
    }

    .ticker-item-right {
      text-align: right;
      font-size: 12px;
      color: #999;
    }

    .ticker-time {
      font-size: 11px;
      color: #666;
    }

    .ticker-sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid #333;
      text-align: center;
      color: #666;
      flex-shrink: 0;
      border-radius: 0 0 12px 12px;
    }

    /* Custom scrollbar for ticker list */
    .ticker-list::-webkit-scrollbar {
      width: 8px;
    }

    .ticker-list::-webkit-scrollbar-track {
      background: #2a2a2a;
      border-radius: 4px;
    }

    .ticker-list::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 4px;
    }

    .ticker-list::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    .ticker-list::-webkit-scrollbar-corner {
      background: #2a2a2a;
    }

    /* Firefox scrollbar */
    .ticker-list {
      scrollbar-width: thin;
      scrollbar-color: #444 #2a2a2a;
    }

    @media (max-width: 768px) {
      #${CONFIG.sidebarId} {
        width: 280px;
        right: 10px;
        top: 10px;
        max-height: 65vh;
      }

      .ticker-list {
        max-height: calc(65vh - 120px);
      }
    }

    .ticker-new {
      animation: tickerPulse 0.5s ease;
    }

    @keyframes tickerPulse {
      0% { background: #2962FF; }
      100% { background: #2a2a2a; }
    }

    /* Empty state styling */
    .ticker-empty-state {
      text-align: center;
      color: #666;
      padding: 40px 20px;
      font-size: 13px;
    }

    .ticker-empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }
  `;

  document.head.appendChild(style);

  // Add event listeners
  const collapseBtn = sidebar.querySelector('.ticker-collapse-btn');
  const closeBtn = sidebar.querySelector('.ticker-close-btn');

  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle('collapsed', isCollapsed);
    collapseBtn.textContent = isCollapsed ? '+' : '−';
    collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.remove();
    if (updateTimer) {
      clearInterval(updateTimer);
    }
  });

  return sidebar;
}

/**
 * Update sidebar with current tickers
 */
function updateSidebar() {
  if (!sidebar) return;

  const tickerList = sidebar.querySelector('.ticker-list');
  const tickerCount = sidebar.querySelector('.ticker-count');

  if (!tickerList || !tickerCount) return;

  // Sort tickers by count (most appearances first), then by last seen (most recent first)
  const sortedTickers = Array.from(discoveredTickers.entries())
    .sort((a, b) => {
      const [tickerA, dataA] = a;
      const [tickerB, dataB] = b;

      // First sort by count (descending - most appearances first)
      if (dataB.count !== dataA.count) {
        return dataB.count - dataA.count;
      }

      // Then by last seen (most recent first)
      return dataB.lastSeen - dataA.lastSeen;
    })
    .slice(0, CONFIG.maxTickers);

  // Update count
  tickerCount.textContent = sortedTickers.length;

  // Clear and rebuild list
  tickerList.innerHTML = '';

  if (sortedTickers.length === 0) {
    tickerList.innerHTML = `
      <div class="ticker-empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17h18v2H3v-2zm16.5-7L15 5.5 13 7.5 8.5 3 3 8.5 4.5 10l4-4 4.5 4.5 2-2L19.5 14h-.5v-4z"/>
        </svg>
        <div>No tickers found yet</div>
        <small>Look for $TICKER symbols on this page!</small>
      </div>
    `;
    return;
  }

  sortedTickers.forEach(([ticker, data]) => {
    const item = document.createElement('div');
    item.className = 'ticker-item';

    const timeDiff = Date.now() - data.lastSeen;
    const timeText = timeDiff < 60000 ? 'Just now' :
                     timeDiff < 3600000 ? `${Math.floor(timeDiff / 60000)}m ago` :
                     timeDiff < 86400000 ? `${Math.floor(timeDiff / 3600000)}h ago` :
                     `${Math.floor(timeDiff / 86400000)}d ago`;

    item.innerHTML = `
      <div class="ticker-item-left">
        <div class="ticker-symbol">$${ticker}</div>
        <div class="ticker-count-badge">${data.count}</div>
      </div>
      <div class="ticker-item-right">
        <div class="ticker-time">${timeText}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      window.open(`${CONFIG.tradingViewBaseUrl}${ticker}/`, '_blank', 'noopener,noreferrer');
    });

    tickerList.appendChild(item);
  });
}

/**
 * Extract tickers from text content
 */
function extractTickers(text) {
  const tickers = new Set();
  const matches = text.matchAll(CONFIG.tickerRegex);

  for (const match of matches) {
    const ticker = match[1];
    if (isValidTicker(ticker)) {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers);
}

/**
 * Process discovered tickers
 */
function processTickers(tickers) {
  if (tickers.length === 0) return;

  const now = Date.now();
  let hasNewTickers = false;

  tickers.forEach(ticker => {
    if (discoveredTickers.has(ticker)) {
      const data = discoveredTickers.get(ticker);
      data.count += 1;
      data.lastSeen = now;
    } else {
      discoveredTickers.set(ticker, {
        count: 1,
        lastSeen: now
      });
      hasNewTickers = true;
    }
  });

  if (hasNewTickers || tickers.length > 0) {
    updateSidebar();
  }
}

/**
 * Scan page for tickers
 */
function scanForTickers() {
  const config = getSiteConfig();
  const allText = [];

  config.selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.textContent && !element.hasAttribute(CONFIG.processedAttribute)) {
          allText.push(element.textContent);
          element.setAttribute(CONFIG.processedAttribute, 'true');
        }
      });
    } catch (error) {
      console.warn('TradingView Ticker Sidebar: Invalid selector:', selector);
    }
  });

  const combinedText = allText.join(' ');
  const tickers = extractTickers(combinedText);
  processTickers(tickers);
}

/**
 * Initialize sidebar
 */
function initSidebar() {
  // Remove existing sidebar if any
  const existingSidebar = document.getElementById(CONFIG.sidebarId);
  if (existingSidebar) {
    existingSidebar.remove();
  }

  // Create and add new sidebar
  sidebar = createSidebar();
  document.body.appendChild(sidebar);

  console.log('TradingView Ticker Sidebar: Initialized and active by default');
}

/**
 * Start monitoring
 */
function startMonitoring() {
  // Initial scan
  scanForTickers();

  // Set up mutation observer for new content
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;

    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added nodes contain target elements
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const config = getSiteConfig();
            const hasTargetContent = config.selectors.some(selector => {
              try {
                return node.matches(selector) || (node.querySelector && node.querySelector(selector));
              } catch (e) {
                return false;
              }
            });
            if (hasTargetContent) {
              shouldScan = true;
            }
          }
        });
      }
    });

    if (shouldScan) {
      setTimeout(scanForTickers, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Periodic updates for missed content
  updateTimer = setInterval(() => {
    scanForTickers();
  }, CONFIG.updateInterval);

  // Scroll-based scanning for better real-time updates
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      // Quick scan for new visible content
      const visibleElements = getTargetElements().filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      });

      if (visibleElements.length > 0) {
        const allText = [];
        visibleElements.forEach(element => {
          if (element.textContent && !element.hasAttribute(CONFIG.processedAttribute)) {
            allText.push(element.textContent);
            element.setAttribute(CONFIG.processedAttribute, 'true');
          }
        });

        if (allText.length > 0) {
          const combinedText = allText.join(' ');
          const tickers = extractTickers(combinedText);
          processTickers(tickers);
        }
      }
    }, 200);
  }, { passive: true });
}

/**
 * Initialize everything
 */
function init() {
  console.log('TradingView Ticker Sidebar: Starting initialization...');

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        initSidebar();
        startMonitoring();
      }, 1000);
    });
  } else {
    setTimeout(() => {
      initSidebar();
      startMonitoring();
    }, 1000);
  }
}

// Start the extension - now active by default
init();