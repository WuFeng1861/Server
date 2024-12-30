import {Entity, Column, PrimaryColumn, Index} from 'typeorm';

@Entity('mock_stock_holdings')
export class MockStockHolding {
  @PrimaryColumn()
  id: number;
  
  @Column()
  stockId: string;
  
  @Column()
  stockName: string;
  
  @Column('decimal', { precision: 10, scale: 2 })
  buyPrice: number;
  
  @Column()
  amount: number;
  
  @Column({ type: 'date' })
  buyDate: Date;
  
  @Column({ type: 'date', nullable: true })
  sellDate: Date;
  
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  sellPrice: number;
  
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  profit: number;
  
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  profitRate: number;
  
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  fee: number;
  
  @Column()
  @Index('idx_times')
  times: number;
  
  @Column()
  @Index('idx_type')
  type: number = 1;
}
