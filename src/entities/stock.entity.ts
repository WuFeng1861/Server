import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 6, nullable: true })
  @Index('idx_stockid')
  stockid: string;

  @Column()
  @Index('idx_time')
  time: Date;

  @Column('decimal', { precision: 10, scale: 2 })
  open: number;

  @Column('decimal', { precision: 10, scale: 2 })
  high: number;

  @Column('decimal', { precision: 10, scale: 2 })
  low: number;

  @Column('decimal', { precision: 10, scale: 2 })
  close: number;

  @Column('bigint')
  volume: number;
}