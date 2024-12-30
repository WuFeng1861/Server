import {Body, Controller, Get, HttpException, HttpStatus, Post, Query} from '@nestjs/common';
import { AppService } from './app.service';
import { StockRecommendResponse } from './interfaces/public-interface';
import {SetCookieDto} from './dto/set-cookie.dto';
import {MockStockHolding} from './entities/mock-stock-holding.entity';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('recommendStocks')
  async getRecommendStocks(): Promise<StockRecommendResponse[]> {
    return this.appService.getRecommendStocks();
  }
  
  @Get('startStockRecommend')
  async startStockRecommend(@Query('update') update?: string): Promise<string> {
    return this.appService.startStockRecommend(update);
  }
  
  @Get('startBackTest')
  async startBackTest(@Query('startDate') startDate: string): Promise<string> {
    return this.appService.startBackTest(startDate);
  }
  
  @Get('getMockStockHolding')
  async getMockStockHolding(@Query('times') times: number): Promise<MockStockHolding[]> {
    return this.appService.getMockStockHolding(times);
  }
  
  @Get('taskStatus')
  async getTaskStatus(): Promise<string> {
    return this.appService.getRunningStatus();
  }
  
  @Get('getBackTestTimes')
  async getBackTestTimes(): Promise<number> {
    return this.appService.getBackTestTimes();
  }
  
  @Post('setCookie')
  async setCookie(@Body() setCookieDto: SetCookieDto): Promise<void> {
    if (!setCookieDto.cookie) {
      throw new HttpException('请传入Cookie', 401);
    }
    await this.appService.setCookie(setCookieDto.cookie);
  }
}
