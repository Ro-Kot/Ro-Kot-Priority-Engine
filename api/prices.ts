export const runtime = 'nodejs';

import yahooFinance from 'yahoo-finance2';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = searchParams.get('tickers');
  
  if (!tickers) {
    return Response.json({ error: 'Tickers parameter is required' }, { status: 400 });
  }

  try {
    const tickerArray = tickers.split(',').map((t: string) => t.trim().toUpperCase());
    const results: Record<string, number> = {};

    for (const ticker of tickerArray) {
      try {
        const quote = await yahooFinance.quote(ticker) as any;
        if (quote && quote.regularMarketPrice) {
          results[ticker] = quote.regularMarketPrice;
        }
      } catch (error) {
        console.error(`Error fetching ticker ${ticker}:`, error);
      }
    }

    return Response.json(results);
  } catch (error) {
    console.error('Error in /api/prices:', error);
    return Response.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}