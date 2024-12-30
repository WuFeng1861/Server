import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('price_range_data')
export class PriceRange {
  @PrimaryColumn()
  id: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  min_price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  max_price: number;
}