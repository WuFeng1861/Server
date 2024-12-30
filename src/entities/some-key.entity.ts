import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('some_key')
export class SomeKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('json', { nullable: true })
  data: { cookie: string, times: number };
}
