import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('all_stocks')
export class AllStocks {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 6 })
  stockid: string;

  @Column()
  stockname: string;
}
