import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import yahooFinanceModule from 'yahoo-finance2';
const yahooFinance = new (yahooFinanceModule as any)({ suppressNotices: ['yahooSurvey'] });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add middleware to parse JSON bodies
  app.use(express.json());

  // API Route: Get current prices for a list of tickers
  app.get('/api/prices', async (req, res) => {
    try {
      const { tickers } = req.query;
      
      if (!tickers || typeof tickers !== 'string') {
        return res.status(400).json({ error: 'Tickers parameter is required' });
      }

      const tickerArray = tickers.split(',').map(t => t.trim().toUpperCase());
      const results: Record<string, number> = {};

      // Yahoo Finance allows fetching quotes
      for (const ticker of tickerArray) {
        try {
          const quote = await yahooFinance.quote(ticker) as any;
          if (quote && quote.regularMarketPrice) {
             results[ticker] = quote.regularMarketPrice;
          } else {
             console.warn(`No regular market price for ${ticker}`);
          }
        } catch (error) {
          console.error(`Error fetching ticker ${ticker}:`, error);
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Error in /api/prices:', error);
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  // API Route: Get Finam Portfolio
  app.post('/api/finam/portfolio', async (req, res) => {
    try {
      const secretKey = req.body.apiKey || process.env.FINAM_API_KEY;
      if (!secretKey) {
        return res.status(400).json({ error: 'FINAM API Key is required' });
      }

      // 1. Get JWT Token
      const sessionRes = await fetch('https://api.finam.ru/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ secret: secretKey })
      });
      
      if (!sessionRes.ok) {
        console.error('Finam session failed:', await sessionRes.text());
        return res.status(401).json({ error: 'Failed to authenticate with Finam API' });
      }
      const jwt = (await sessionRes.json()).token;
      const authHeader = 'Bearer ' + jwt;

      // 2. Get Account ID using Token Details
      const detailsRes = await fetch('https://api.finam.ru/v1/sessions/details', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: jwt })
      });

      if (!detailsRes.ok) {
        return res.status(500).json({ error: 'Failed to fetch Finam token details' });
      }
      const details = await detailsRes.json();
      if (!details.account_ids || details.account_ids.length === 0) {
        return res.status(404).json({ error: 'No Finam accounts found for this token' });
      }
      
      // We will just use the first account found for simplicity
      const accountId = details.account_ids[0];

      // 3. Fetch Portfolio for the Account
      const accountRes = await fetch(`https://api.finam.ru/v1/accounts/${accountId}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
      });

      if (!accountRes.ok) {
        return res.status(500).json({ error: 'Failed to fetch Finam portfolio' });
      }

      const accountData = await accountRes.json();
      res.json(accountData);
      
    } catch (error) {
      console.error('Error in /api/finam/portfolio:', error);
      res.status(500).json({ error: 'Internal server error while fetching Finam data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Since express v4:
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
