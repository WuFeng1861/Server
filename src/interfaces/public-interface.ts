export interface StockRecommendResponse {
  id: number;
  code: string;
  name: string;
  lastPrice: number;
  date: string;
}

export interface QuantitativeBuyResult {
  code: string;
  name: string;
  lastPrice: number;
}

export interface QuantitativeSellResult {
  code: string;
  name: string;
  close: number;
}
