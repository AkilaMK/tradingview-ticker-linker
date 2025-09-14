// content.js - TradingView Ticker Sidebar with Enhanced Stock Info

// Configuration
const CONFIG = {
  tickerRegex: /\$([A-Z]{1,5})(?=\s|$|[^\w])/g,
  tradingViewBaseUrl: 'https://www.tradingview.com/symbols/',
  sidebarId: 'ticker-sidebar',
  modalId: 'ticker-detail-modal',
  processedAttribute: 'data-ticker-processed',
  updateInterval: 1000,
  maxTickers: 100,
  // Alpha Vantage API (free tier - 5 API requests per minute, 500 per day)
  alphaVantageApiKey: 'demo', // Replace with your actual API key
  alphaVantageBaseUrl: 'https://www.alphavantage.co/query'
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
let discoveredTickers = new Map(); // ticker -> {count, lastSeen, price, stockData}
let sidebar = null;
let modal = null;
let isCollapsed = false;
let updateTimer = null;
let stockDataCache = new Map(); // Cache for stock data

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
 * Fetch stock data from Alpha Vantage API
 */
async function fetchStockData(ticker) {
  // Check cache first
  const cacheKey = `${ticker}_${new Date().toDateString()}`;
  if (stockDataCache.has(cacheKey)) {
    return stockDataCache.get(cacheKey);
  }

  try {
    // Fetch multiple endpoints for comprehensive data
    const [overviewResponse, quoteResponse] = await Promise.all([
      fetch(`${CONFIG.alphaVantageBaseUrl}?function=OVERVIEW&symbol=${ticker}&apikey=${CONFIG.alphaVantageApiKey}`),
      fetch(`${CONFIG.alphaVantageBaseUrl}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${CONFIG.alphaVantageApiKey}`)
    ]);

    const [overviewData, quoteData] = await Promise.all([
      overviewResponse.json(),
      quoteResponse.json()
    ]);

    const stockData = {
      symbol: ticker,
      companyName: overviewData.Name || ticker,
      description: overviewData.Description || 'No description available',
      sector: overviewData.Sector || 'N/A',
      industry: overviewData.Industry || 'N/A',
      marketCap: overviewData.MarketCapitalization || 'N/A',
      peRatio: overviewData.PERatio || 'N/A',
      priceTarget: overviewData.AnalystTargetPrice || 'N/A',
      currentPrice: quoteData['Global Quote'] ? quoteData['Global Quote']['05. price'] : 'N/A',
      change: quoteData['Global Quote'] ? quoteData['Global Quote']['09. change'] : 'N/A',
      changePercent: quoteData['Global Quote'] ? quoteData['Global Quote']['10. change percent'] : 'N/A',
      high52Week: overviewData['52WeekHigh'] || 'N/A',
      low52Week: overviewData['52WeekLow'] || 'N/A',
      dividendYield: overviewData.DividendYield || 'N/A',
      bookValue: overviewData.BookValue || 'N/A',
      eps: overviewData.EPS || 'N/A',
      revenuePerShare: overviewData.RevenuePerShareTTM || 'N/A',
      profitMargin: overviewData.ProfitMargin || 'N/A',
      forwardPE: overviewData.ForwardPE || 'N/A',
      beta: overviewData.Beta || 'N/A'
    };

    // Cache the data
    stockDataCache.set(cacheKey, stockData);

    return stockData;
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
    return {
      symbol: ticker,
      companyName: ticker,
      description: 'Unable to fetch company data at this time',
      error: true
    };
  }
}

/**
 * Create the detailed stock info modal
 */
function createStockModal() {
  const modal = document.createElement('div');
  modal.id = CONFIG.modalId;
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <span class="modal-ticker">Loading...</span>
            <span class="modal-company-name">Please wait...</span>
          </div>
          <button class="modal-close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="stock-loading">
            <div class="loading-spinner"></div>
            <p>Fetching stock data...</p>
          </div>
          <div class="stock-details" style="display: none;">
            </div>
        </div>
      </div>
    </div>
  `;

  // Add modal styles
  const modalStyle = document.createElement('style');
  modalStyle.textContent = `
    #${CONFIG.modalId} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 20000;
      display: none;
    }

    .modal-overlay {
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-content {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 16px;
      width: 100%;
      max-width: 800px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #333;
      background: #2a2a2a;
      border-radius: 16px 16px 0 0;
    }

    /* MODIFICATION START: Combined ticker and company name into a single row */
    .modal-title {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      gap: 12px;
    }
    /* MODIFICATION END */

    .modal-ticker {
      font-size: 24px;
      font-weight: 700;
      color: #2962FF;
    }

    .modal-company-name {
      font-size: 16px;
      color: #ccc;
      font-weight: 400;
    }

    .modal-close-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      font-size: 24px;
      line-height: 1;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-close-btn:hover {
      background: #333;
      color: white;
    }

    .modal-body {
      padding: 24px;
    }

    .stock-loading {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top: 3px solid #2962FF;
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .stock-details {
      display: grid;
      gap: 24px;
    }

    .stock-section {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #333;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #2962FF;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title svg {
      width: 20px;
      height: 20px;
    }

    .stock-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .stock-metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #333;
    }

    .stock-metric:last-child {
      border-bottom: none;
    }

    .metric-label {
      color: #999;
      font-size: 14px;
    }

    .metric-value {
      font-weight: 600;
      color: white;
      text-align: right;
    }

    .price-positive {
      color: #00C851;
    }

    .price-negative {
      color: #FF4444;
    }

    .company-description {
      color: #ccc;
      line-height: 1.6;
      font-size: 15px;
    }

    /* MODIFICATION START: Removed old, large price styles for uniformity */
    /* .price-target-section, .current-price, etc. have been removed */
    /* MODIFICATION END */

    .action-buttons {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      flex-wrap: wrap;
    }

    .action-btn {
      background: #2962FF;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .action-btn:hover {
      background: #1e4ba8;
    }

    .action-btn.secondary {
      background: #333;
      color: #ccc;
    }

    .action-btn.secondary:hover {
      background: #444;
    }

    /* Responsive design */
    @media (max-width: 768px) {
      .modal-content {
        margin: 10px;
        max-height: 95vh;
      }

      .modal-header {
        padding: 16px 20px;
      }

      .modal-body {
        padding: 20px;
      }

      .modal-ticker {
        font-size: 20px;
      }

      .stock-grid {
        grid-template-columns: 1fr;
      }

      .action-buttons {
        flex-direction: column;
      }
    }
  `;

  document.head.appendChild(modalStyle);

  // Add event listeners
  const closeBtn = modal.querySelector('.modal-close-btn');
  const overlay = modal.querySelector('.modal-overlay');

  const closeModal = () => {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeModal();
    }
  });

  return modal;
}

/**
 * Format currency values
 */
function formatCurrency(value, decimals = 2) {
  if (!value || value === 'N/A' || value === 'None') return 'N/A';
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

/**
 * Format large numbers (market cap, etc.)
 */
function formatLargeNumber(value) {
  if (!value || value === 'N/A' || value === 'None') return 'N/A';
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';

  return num.toFixed(2);
}

/**
 * Calculate price target percentage
 */
function calculateTargetPercentage(currentPrice, targetPrice) {
  if (!currentPrice || !targetPrice || currentPrice === 'N/A' || targetPrice === 'N/A') {
    return null;
  }

  const current = parseFloat(currentPrice);
  const target = parseFloat(targetPrice);

  if (isNaN(current) || isNaN(target) || current === 0) return null;

  return ((target - current) / current * 100).toFixed(2);
}

/**
 * Show detailed stock information modal
 */
async function showStockDetails(ticker) {
  if (!modal) {
    modal = createStockModal();
    document.body.appendChild(modal);
  }

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Show loading state
  const loading = modal.querySelector('.stock-loading');
  const details = modal.querySelector('.stock-details');
  const tickerElement = modal.querySelector('.modal-ticker');
  const companyNameElement = modal.querySelector('.modal-company-name');

  loading.style.display = 'block';
  details.style.display = 'none';
  tickerElement.textContent = `$${ticker}`;
  companyNameElement.textContent = 'Loading...';

  try {
    // Fetch stock data
    const stockData = await fetchStockData(ticker);

    // Update modal title
    tickerElement.textContent = `$${stockData.symbol}`;
    companyNameElement.textContent = stockData.companyName;

    // Calculate price target percentage
    const targetPercentage = calculateTargetPercentage(stockData.currentPrice, stockData.priceTarget);

    // MODIFICATION START: Rebuilt Price & Performance section for uniform row heights/fonts
    // Build detailed content
    details.innerHTML = `
      <div class="stock-section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Price & Performance
        </div>
        <div class="stock-grid">
            <div>
                <div class="stock-metric">
                    <span class="metric-label">Current Price</span>
                    <span class="metric-value ${stockData.change && parseFloat(stockData.change) >= 0 ? 'price-positive' : 'price-negative'}">${formatCurrency(stockData.currentPrice)}</span>
                </div>
                <div class="stock-metric">
                    <span class="metric-label">Change</span>
                    <span class="metric-value ${stockData.change && parseFloat(stockData.change) >= 0 ? 'price-positive' : 'price-negative'}">${stockData.change && stockData.change !== 'N/A' ? `${formatCurrency(stockData.change, 2)} (${stockData.changePercent})` : 'N/A'}</span>
                </div>
            </div>
            <div>
                ${stockData.priceTarget !== 'N/A' ? `
                <div class="stock-metric">
                    <span class="metric-label">Analyst Target</span>
                    <span class="metric-value">${formatCurrency(stockData.priceTarget)}</span>
                </div>
                ` : ''}
                ${targetPercentage ? `
                <div class="stock-metric">
                    <span class="metric-label">Target Change</span>
                    <span class="metric-value ${parseFloat(targetPercentage) >= 0 ? 'price-positive' : 'price-negative'}">
                        ${parseFloat(targetPercentage) >= 0 ? '+' : ''}${targetPercentage}%
                    </span>
                </div>
                ` : ''}
            </div>
        </div>
      </div>
      {/* MODIFICATION END */}

      <div class="stock-section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
          Financial Metrics
        </div>
        <div class="stock-grid">
          <div>
            <div class="stock-metric">
              <span class="metric-label">Market Cap</span>
              <span class="metric-value">${formatLargeNumber(stockData.marketCap)}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">P/E Ratio</span>
              <span class="metric-value">${stockData.peRatio !== 'N/A' ? parseFloat(stockData.peRatio).toFixed(2) : 'N/A'}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">Forward P/E</span>
              <span class="metric-value">${stockData.forwardPE !== 'N/A' ? parseFloat(stockData.forwardPE).toFixed(2) : 'N/A'}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">EPS</span>
              <span class="metric-value">${formatCurrency(stockData.eps)}</span>
            </div>
          </div>
          <div>
            <div class="stock-metric">
              <span class="metric-label">Book Value</span>
              <span class="metric-value">${formatCurrency(stockData.bookValue)}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">Dividend Yield</span>
              <span class="metric-value">${stockData.dividendYield !== 'N/A' ? (parseFloat(stockData.dividendYield) * 100).toFixed(2) + '%' : 'N/A'}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">Beta</span>
              <span class="metric-value">${stockData.beta !== 'N/A' ? parseFloat(stockData.beta).toFixed(2) : 'N/A'}</span>
            </div>
            <div class="stock-metric">
              <span class="metric-label">Profit Margin</span>
              <span class="metric-value">${stockData.profitMargin !== 'N/A' ? (parseFloat(stockData.profitMargin) * 100).toFixed(2) + '%' : 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="stock-section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          52-Week Range
        </div>
        <div class="stock-metric">
          <span class="metric-label">52-Week High</span>
          <span class="metric-value">${formatCurrency(stockData.high52Week)}</span>
        </div>
        <div class="stock-metric">
          <span class="metric-label">52-Week Low</span>
          <span class="metric-value">${formatCurrency(stockData.low52Week)}</span>
        </div>
      </div>

      <div class="stock-section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Company Profile
        </div>
        <div class="stock-metric">
          <span class="metric-label">Sector</span>
          <span class="metric-value">${stockData.sector}</span>
        </div>
        <div class="stock-metric">
          <span class="metric-label">Industry</span>
          <span class="metric-value">${stockData.industry}</span>
        </div>
        <div class="company-description">
          ${stockData.description}
        </div>
      </div>

      <div class="action-buttons">
        <a href="${CONFIG.tradingViewBaseUrl}${ticker}/" target="_blank" rel="noopener noreferrer" class="action-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17h18v2H3v-2zm16.5-7L15 5.5 13 7.5 8.5 3 3 8.5 4.5 10l4-4 4.5 4.5 2-2L19.5 14h-.5v-4z"/>
          </svg>
          View Chart on TradingView
        </a>
        <a href="https://finance.yahoo.com/quote/${ticker}" target="_blank" rel="noopener noreferrer" class="action-btn secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
          Yahoo Finance
        </a>
      </div>
    `;

    // Hide loading and show details
    loading.style.display = 'none';
    details.style.display = 'block';

  } catch (error) {
    console.error('Error loading stock details:', error);

    // Show error state
    details.innerHTML = `
      <div class="stock-section">
        <div class="section-title">Error Loading Data</div>
        <p class="company-description">
          Unable to fetch stock data at this time. This might be due to API rate limits or network issues.
          Please try again later or visit TradingView directly.
        </p>
        <div class="action-buttons">
          <a href="${CONFIG.tradingViewBaseUrl}${ticker}/" target="_blank" rel="noopener noreferrer" class="action-btn">
            View on TradingView
          </a>
        </div>
      </div>
    `;

    loading.style.display = 'none';
    details.style.display = 'block';
  }
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
        <small>Click any ticker to view chart • Info button for details</small>
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
      width: 320px;
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
      transition: all 0.2s ease;
      border: 1px solid transparent;
      /* MODIFICATION START: Added cursor to indicate the whole row is clickable */
      cursor: pointer;
      /* MODIFICATION END */
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

    .ticker-info-btn {
      background: #2962FF;
      border: none;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .ticker-info-btn:hover {
      background: #1e4ba8;
      transform: scale(1.1);
    }

    .ticker-main-content {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      /* MODIFICATION START: Removed cursor property as it's now on .ticker-item */
      /* cursor: pointer; */
      /* MODIFICATION END */
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
        width: 300px;
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
        <button class="ticker-info-btn" title="View detailed stock information">i</button>
        <div class="ticker-main-content">
          <div class="ticker-symbol">${ticker}</div>
          <div class="ticker-count-badge">${data.count}</div>
        </div>
      </div>
      <div class="ticker-item-right">
        <div class="ticker-time">${timeText}</div>
      </div>
    `;

    // Add event listeners
    const infoBtn = item.querySelector('.ticker-info-btn');

    // MODIFICATION START: The whole row is now clickable to go to TradingView
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevents the row click event from firing
      showStockDetails(ticker);
    });

    item.addEventListener('click', () => {
      window.open(`${CONFIG.tradingViewBaseUrl}${ticker}/`, '_blank', 'noopener,noreferrer');
    });
    // MODIFICATION END

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