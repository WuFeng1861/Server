import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('stock_recommend')
export class StockRecommend {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  code: string;

  @Column()
  name: string;

  @Column('decimal', { precision: 10, scale: 2 })
  lastPrice: number;

  @Column()
  @Index('index_date')
  date: Date;
}