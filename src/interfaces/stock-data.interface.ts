export interface StockData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockCache {
  code: string;
  name: string;
  data: StockData[];
  nextData: StockData[];
}

export interface StockHolding {
  id: number;
  stockId: string;
  stockName: string;
  buyPrice: number;
  amount: number;
  buyDate: string;
  sellDate?: string;
  sellPrice?: number;
  profit?: number;
  profitRate?: number;
  fee?: number;
}
