export interface CreateMockStockHoldingDto {
  id: number;
  stockId: string;
  stockName: string;
  buyPrice: number;
  amount: number;
  buyDate: Date;
  times: number;
}

export interface UpdateMockStockHoldingDto {
  sellDate?: Date;
  sellPrice?: number;
  profit?: number;
  profitRate?: number;
  fee?: number;
  times?: number;
}
