import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {PriceRange} from './entities/price-range.entity';
import {StockExtremeGrowthDate} from './entities/stock-extreme-growth-date.entity';
import {StockRecommend} from './entities/stock-recommend.entity';
import {QuantitativeBuyResult, StockRecommendResponse} from './interfaces/public-interface';
import {SomeKey} from './entities/some-key.entity';
import {AllStocks} from './entities/all-stocks.entity';
import {CacheService} from './services/cache.service';
import {Stock} from './entities/stock.entity';
import {
  getStock30DaysQuotation,
  getStockAllQuotation,
} from './utils/api';
import {StockAnalysisService} from './services/stock-anlysis.service';
import {StockData} from './interfaces/stock-data.interface';
import {convertSeconds, dateToDayString} from './utils/tools';
import {StockBackTestService} from './services/stock-back-test.service';
import {MockStockHolding} from './entities/mock-stock-holding.entity';
import {MockStockHoldingService} from './services/mock-stock-holding.service';
import {BacktestResult} from './entities/backtest-result.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(PriceRange)
    private priceRangeRepository: Repository<PriceRange>,
    @InjectRepository(StockExtremeGrowthDate)
    private stockExtremeGrowthRepository: Repository<StockExtremeGrowthDate>,
    @InjectRepository(StockRecommend)
    private stockRecommendRepository: Repository<StockRecommend>,
    @InjectRepository(SomeKey)
    private someKeyRepository: Repository<SomeKey>,
    @InjectRepository(AllStocks)
    private allStocksRepository: Repository<AllStocks>,
    @InjectRepository(Stock)
    private stockRepository: Repository<Stock>,
    @InjectRepository(MockStockHolding)
    private mockStockHoldingRepository: Repository<MockStockHolding>,
    @InjectRepository(BacktestResult)
    private backtestResultRepository: Repository<BacktestResult>,
    private cacheService: CacheService,
    private stockAnalysisService: StockAnalysisService,
    private stockBackTestService: StockBackTestService,
    private mockStockHoldingService: MockStockHoldingService,
  ) {
  }
  getBackTestTypes(): string[] {
    return ["成交量策略", "妖股回弹策略", "低位成交量放大策略", "三红增量"];
  }
  async getBackTestResults(): Promise<BacktestResult[]> {
    const cacheKey = 'backTest-results';
    const cachedData = this.cacheService.get<BacktestResult[]>(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    const results = await this.backtestResultRepository.find({
      order: {
        BacktestTimes: 'DESC'
      }
    });
    
    this.cacheService.set(cacheKey, results);
    return results;
  }
  
  async getRecommendStocks(): Promise<StockRecommendResponse[]> {
    const cacheKey = 'recommend-stocks';
    const cachedData =
      this.cacheService.get<StockRecommendResponse[]>(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const targetDate = now.getHours() >= 10 ? today : yesterday;
    
    const stocks = await this.stockRecommendRepository.find({
      where: {
        date: targetDate,
      },
      order: {
        id: 'ASC',
      },
    });
    const result = stocks.map((stock) => ({
      ...stock,
      date: stock.date.toLocaleDateString().replaceAll('/', '-'),
    }));
    
    this.cacheService.set(cacheKey, result);
    return result;
  }
  
  async getCookieData(newCookie?: string): Promise<string> {
    const cacheKey = 'cookie-data';
    let cookie: string;
    
    if (newCookie) {
      // If new cookie provided, update database and cache
      await this.someKeyRepository.update(1, {
        data: {cookie: newCookie},
      });
      this.cacheService.set(cacheKey, newCookie, 24 * 60 * 60 * 1000); // 24 hours
      cookie = newCookie;
    } else {
      // Try to get cookie from cache first
      cookie = this.cacheService.get<string>(cacheKey);
      
      // If not in cache, try database
      if (!cookie) {
        const someKey = await this.someKeyRepository.findOne({
          where: {id: 1},
        });
        
        if (!someKey || !someKey.data) {
          throw new HttpException(
            '没有Cookie信息,请先设置 Cookie',
            401,
          );
        }
        cookie = someKey.data.cookie;
        this.cacheService.set(cacheKey, cookie, 24 * 60 * 60 * 1000); // Cache for 24 hours
      }
    }
    return cookie;
  }
  async getTokenData(): Promise<string> {
    const cacheKey = 'token-data';
    let token: string;
  
    // Try to get cookie from cache first
    token = this.cacheService.get<string>(cacheKey);
  
    // If not in cache, try database
    if (!token) {
      const someKey = await this.someKeyRepository.findOne({
        where: {id: 1},
      });
    
      if (!someKey || !someKey.data) {
        throw new HttpException(
          '没有Token信息,请先设置 Token',
          401,
        );
      }
      token = someKey.data.token;
      this.cacheService.set(cacheKey, token, 24 * 60 * 60 * 1000); // Cache for 24 hours
    }
    return token;
  }
  
  getRunningStatus(): string {
    const runningNameObj = {
      'start-stock-recommend': '计算推荐股票',
      'start-back-test': '股票回测',
    };
    const runningName = this.getIsRunning();
    if (runningName) {
      return runningNameObj[runningName] || '未定义的运行任务';
    }
    return '';
  }
  
  getIsRunning(): string {
    const isRunningTaskNameKey = `running-task-name`;
    return this.cacheService.get<string>(isRunningTaskNameKey) || '';
  }
  
  setIsRunning(isRunning: boolean, runName: string): void {
    // 设置缓存
    const cacheKey = 'is-running';
    const cacheKeyWithRunName = `${cacheKey}-${runName}`;
    const isRunningTaskNameKey = `running-task-name`;
    const isRunningTaskName = this.cacheService.get<string>(isRunningTaskNameKey);
    // 如果想要开启任务首先判断没有其他任务在运行
    if (isRunning && isRunningTaskName) {
      throw new HttpException('任务正在运行，请稍后再试', 401,);
    }
    // 如果关闭任务得先判断当前任务是否在运行
    if (!isRunning && !this.cacheService.get<boolean>(cacheKeyWithRunName)) {
      throw new HttpException('任务未运行，请先运行任务', 401,);
    }
    // 设置缓存
    this.cacheService.set(cacheKey, isRunning, 24 * 60 * 60 * 1000); // Cache for 24 hours
    this.cacheService.set(cacheKeyWithRunName, isRunning, 24 * 60 * 60 * 1000); // Cache for 24 hours
    // 若是开启任务，则设置当前任务名称 若是关闭任务，则清除当前任务名称
    this.cacheService.set(isRunningTaskNameKey, isRunning ? runName : '', 24 * 60 * 60 * 1000); // Cache for 24 hours
  }
  
  async setCookie(cookie: string): Promise<void> {
    try {
      // 先查询出来原来的数据，看你有没有其他的属性
      const someKey = await this.someKeyRepository.findOne({
        where: {id: 1},
      });
      someKey.data.cookie = cookie;
      await this.someKeyRepository.update(1, {
        data: someKey.data,
      });
      this.cacheService.set('cookie-data', cookie, 24 * 60 * 60 * 1000); // 24 hours
    } catch (error) {
      throw new HttpException(
        'Failed to set cookie',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  async setToken(token: string): Promise<void> {
    try {
      // 先查询出来原来的数据，看你有没有其他的属性
      const someKey = await this.someKeyRepository.findOne({
        where: {id: 1},
      });
      someKey.data.token = token;
      await this.someKeyRepository.update(1, {
        data: someKey.data,
      });
      this.cacheService.set('token-data', token, 24 * 60 * 60 * 1000); // 24 hours
    } catch (error) {
      throw new HttpException(
        'Failed to set token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  async getBackTestTimes(): Promise<number> {
    const someKey = await this.someKeyRepository.findOne({
      where: {id: 1},
    });
    
    if (!someKey || !someKey.data) {
      throw new HttpException(
        '没有回测次数信息,请进行回测',
        401,
      );
    }
    return someKey.data.times || 0;
  }
  
  async getMockStockHolding(times: number): Promise<MockStockHolding[]> {
    const cacheKey = `mock-stock-holding-${times}`;
    const cachedData = this.cacheService.get<MockStockHolding[]>(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }
    
    const maxTimes = await this.getBackTestTimes();
    if (times > maxTimes) {
      throw new HttpException(`回测次数还未到${times}`, 401,);
    }
    
    const mockStockHoldings = await this.mockStockHoldingService.findByTimes(times);
    this.cacheService.set(cacheKey, mockStockHoldings, 24 * 60 * 60 * 1000); // Cache for 24 hours
    
    return mockStockHoldings;
  }
  
  async getStockAllData(
    stockid: string,
    stockname: string,
    update: boolean = false,
  ): Promise<StockData[]> {
    const cacheKey = `stock-all-data-${stockid}`;
    const cachedData = this.cacheService.get<StockData[]>(cacheKey) || [];
    const cookie = await this.getCookieData();
    const token = await this.getTokenData();
    let updateData: StockData[] = [];
    if (cachedData.length === 0) {
      const stockData = await this.stockRepository.find({
        select: ['time', 'open', 'high', 'low', 'close', 'volume'],
        where: {
          stockid: stockid,
        },
        order: {
          time: 'ASC',
        },
      });
      for (const data of stockData) {
        cachedData.push({
          time: dateToDayString(data.time),
          open: Number(data.open),
          high: Number(data.high),
          low: Number(data.low),
          close: Number(data.close),
          volume: Number(data.volume),
        });
      }
    }
    if (update && cachedData.length === 0) {
      updateData = await getStockAllQuotation(stockid, stockname, cookie, token);
    }
    if (update && cachedData.length > 0) {
      updateData = await getStock30DaysQuotation(stockid, stockname, cookie, token);
    }
    for (let i = 0; i < updateData.length; i++) {
      const item = updateData[i];
      const findItem = cachedData.find((data) => data.time === item.time);
      if (!findItem) {
        cachedData.push(item);
        await this.stockRepository.save({
          stockid: stockid,
          time: new Date(item.time.replace(/-/g, '/')),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        });
        continue;
      }
      if (
        findItem.low !== item.low ||
        findItem.high !== item.high ||
        findItem.open !== item.open ||
        findItem.close !== item.close ||
        findItem.volume !== item.volume
      ) {
        await this.stockRepository.update(
          {
            stockid: stockid,
            time: new Date(item.time.replace(/-/g, '/')),
          },
          {
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
          },
        );
        findItem.open = item.open;
        findItem.high = item.high;
        findItem.low = item.low;
        findItem.close = item.close;
        findItem.volume = item.volume;
      }
    }
    this.cacheService.set(cacheKey, cachedData, 24 * 60 * 60 * 1000); // Cache for 24 hours
    return cachedData;
  }
  
  startStockRecommend(recommendType: number, update?: boolean): string {
    if (this.getIsRunning()) {
      throw new HttpException('正在执行任务，请稍后再试', 401,);
    }
    console.log(`开始计算推荐股票 ${recommendType}`);
    this.startStockRecommendTask(recommendType, update);
    return '开始计算推荐股票';
    
  }
  
  async startStockRecommendTask(recommendType: number, update?: boolean): Promise<string> {
    const startTimestamp = new Date().getTime();
    try {
      this.setIsRunning(true, 'start-stock-recommend');
      await this.getCookieData();
      // 获取所有的股票信息
      const allStocks = await this.allStocksRepository.find({
        order: {
          stockid: 'ASC',
        },
      });
      
      if (!allStocks.length) {
        throw new HttpException('数据库没有股票信息', 401,);
      }
      const recommendStocks: QuantitativeBuyResult[] = [];
      let lastDate: Date | undefined;
      for (const stock of allStocks) {
        const stockData = await this.getStockAllData(
          stock.stockid,
          stock.stockname,
          !!update,
        );
        const lastDateTemp = new Date(stockData[stockData.length - 1].time.replace(/-/g, '/'));
        if (lastDate && lastDateTemp.getTime() < lastDate.getTime()) {
          continue;
        }
        lastDate = lastDateTemp;
        const stockAnalysisBuyResult = await this.stockAnalysisService.quantitativeBuyWithType(recommendType, stockData, stock.stockid, stock.stockname);
        if (!stockAnalysisBuyResult) {
          continue;
        }
        recommendStocks.push(stockAnalysisBuyResult);
      }
      // 删除数据库中已存在的推荐股票
      await this.stockRecommendRepository.delete({
        date: lastDate,
        type: recommendType,
      });
      // Save recommend stocks to database
      for (const stock of recommendStocks) {
        const stockRecommend = new StockRecommend();
        stockRecommend.code = stock.code;
        stockRecommend.name = stock.name;
        stockRecommend.lastPrice = stock.lastPrice;
        stockRecommend.date = lastDate;
        stockRecommend.type = recommendType;
        await this.stockRecommendRepository.save(stockRecommend);
      }
      // 清除推荐股票缓存
      this.cacheService.delete('recommend-stocks');
      return '计算推荐股票完成';
    } catch (error) {
      throw error;
    } finally {
      this.setIsRunning(false, 'start-stock-recommend');
      console.log(`计算推荐股票耗时 ${convertSeconds((new Date().getTime() - startTimestamp) / 1000)}`);
    }
  }
  
  startBackTest(startDate: string, endDate: string, maxStocksHolds: number, stopBuyRatio: number, initialPerAmount: number,backTestTye: number = 1) {
    if (this.getIsRunning()) {
      throw new HttpException('正在执行任务，请稍后再试', 401,);
    }
    if (!startDate) {
      throw new HttpException('请选择开始日期', 401,);
    }
    console.log(`开始回测 ${startDate} ${backTestTye}`);
    const minRemainingBalanceToBuy = stopBuyRatio * initialPerAmount / 100;
    const startBalance = initialPerAmount * maxStocksHolds;
    this.startBackTestTask(startDate, endDate,maxStocksHolds, minRemainingBalanceToBuy, startBalance, backTestTye);
    return '开始回测';
  }
  
  private async startBackTestTask(startDate: string, endDate: string, maxStocksHolds: number, minRemainingBalanceToBuy: number, startBalance: number, backTestTye: number = 1) {
    const startTimestamp = new Date().getTime();
    try {
      this.setIsRunning(true, 'start-back-test');
      const allStocks = await this.allStocksRepository.find({
        order: {
          stockid: 'ASC',
        },
      });
      const stocks = allStocks.map((stock) => ({
        code: stock.stockid,
        name: stock.stockname,
      }));
      await this.stockBackTestService.startBackTest(stocks, backTestTye,{
        startDate: startDate,
        endDate: endDate,
        maxStocksHolds: maxStocksHolds,
        minRemainingBalanceToBuy: minRemainingBalanceToBuy,
        startBalance: startBalance,
      });
    } catch (error) {
      throw error;
    } finally {
      this.setIsRunning(false, 'start-back-test');
      console.log(`回测耗时 ${convertSeconds((new Date().getTime() - startTimestamp) / 1000)}`);
    }
  }
}
