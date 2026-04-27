export interface PortfolioItem {
  id: string;
  ticker: string;
  quantity: number;
  avgPrice: number;
  targetShare?: number; // Target share in percentage (0 - 100)
  isExcluded?: boolean;
  // Current values dynamically updated
  currentPrice?: number;
}

export interface CalculatedPortfolioItem extends PortfolioItem {
  currentValue: number;
  share: number; // 0 to 1
  idealShare: number; // 0 to 1
  fulfillmentRatio: number; // share / idealShare
  toBuyQty: number; // How many units to buy to reach idealShare
  rankShare: number;
  priceRatio: number; // currentPrice / avgPrice
  rankPrice: number;
  totalRank: number;
}
