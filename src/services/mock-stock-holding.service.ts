import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MockStockHolding } from '../entities/mock-stock-holding.entity';
import { CreateMockStockHoldingDto, UpdateMockStockHoldingDto } from '../interfaces/mock-stock-holding.interface';

@Injectable()
export class MockStockHoldingService {
  constructor(
    @InjectRepository(MockStockHolding)
    private mockStockHoldingRepository: Repository<MockStockHolding>,
  ) {}
  
  async create(createDto: CreateMockStockHoldingDto): Promise<MockStockHolding> {
    const holding = this.mockStockHoldingRepository.create(createDto);
    return this.mockStockHoldingRepository.save(holding);
  }
  
  async update(id: number, updateDto: UpdateMockStockHoldingDto): Promise<MockStockHolding> {
    await this.mockStockHoldingRepository.update(id, updateDto);
    return this.mockStockHoldingRepository.findOne({ where: { id } });
  }
  
  async findByStockId(stockId: string): Promise<MockStockHolding[]> {
    return this.mockStockHoldingRepository.find({
      where: { stockId },
      order: { buyDate: 'DESC' },
    });
  }
  
  async findById(id: number): Promise<MockStockHolding> {
    return this.mockStockHoldingRepository.findOne({ where: { id } });
  }
  
  async findActiveHoldings(): Promise<MockStockHolding[]> {
    return this.mockStockHoldingRepository.find({
      where: { sellDate: null },
    });
  }
  
  async clearAll(): Promise<void> {
    await this.mockStockHoldingRepository.clear();
  }
  
  // 获取最大的id
  async getMaxId(): Promise<number> {
    const maxId = await this.mockStockHoldingRepository.query('SELECT MAX(id) as maxId FROM mock_stock_holdings');
    return maxId[0].maxId;
  }
  
  // 根据times查询数据
  async findByTimes(times: number): Promise<MockStockHolding[]> {
    return this.mockStockHoldingRepository.find({
      where: { times },
      order: { id: 'ASC' },
    });
  }
}
