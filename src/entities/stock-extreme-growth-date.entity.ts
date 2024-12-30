import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('stock_extreme_growth_dates')
export class StockExtremeGrowthDate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  @Index('idx_stock_code')
  stock_code: string;

  @Column({ length: 7 })
  date: string;
}