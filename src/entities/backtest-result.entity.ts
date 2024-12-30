import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('backtest_result_list')
export class BacktestResult {
  @PrimaryGeneratedColumn()
  ID: number;
  
  @Column({ nullable: true })
  @Index('idx_StrategyTypeID')
  StrategyTypeID: number;
  
  @Column({ type: 'datetime', nullable: true })
  BacktestStartDate: Date;
  
  @Column({ type: 'datetime', nullable: true })
  BacktestEndDate: Date;
  
  @Column({ nullable: true })
  TransactionCount: number;
  
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  TotalProfit: number;
  
  @Column({ nullable: true })
  BacktestTimes: number;
}
