import {Injectable, Logger} from '@nestjs/common';
import { StockData, StockCache, StockHolding } from '../interfaces/stock-data.interface';
import { StockTestConfig } from '../interfaces/stock-test-config.interface';
import {InjectRepository} from '@nestjs/typeorm';
import {AllStocks} from '../entities/all-stocks.entity';
import {Repository} from 'typeorm';
import {Stock} from '../entities/stock.entity';
import {convertSeconds, dateToDayString} from '../utils/tools';
import {StockAnalysisService} from './stock-anlysis.service';
import {MockStockHoldingService} from './mock-stock-holding.service';
import {SomeKey} from '../entities/some-key.entity';
import {QuantitativeBuyResult, QuantitativeSellResult} from '../interfaces/public-interface';

@Injectable()
export class StockBackTestService {
  private stockDataTotalCache: Record<string, StockData[]> = {};
  private stockDataCache: Record<string, StockCache> = {};
  private emptyLength = 0;
  private emptyCodeCache: Record<string, boolean> = {};
  private holdId = 0;
  
  private defaultConfig: StockTestConfig = {
    startBalance: 1133*10000*2,
    maxStocksHolds: 1133,
    feeRate: 0.001,
    minRemainingBalanceToBuy: 10000,
    startDate: '2016-07-07',
  };
  
  constructor(
    private mockStockHoldingService: MockStockHoldingService,
    private stockAnalysisService: StockAnalysisService,
    @InjectRepository(AllStocks)
    private allStocksRepository: Repository<AllStocks>,
    @InjectRepository(Stock)
    private stockRepository: Repository<Stock>,
    @InjectRepository(SomeKey)
    private someKeyRepository: Repository<SomeKey>,
  ) {}
  
  private async createBuyRecord(stockId: string, stockName: string, price: number, amount: number, date: string, times: number): Promise<StockHolding> {
    this.holdId++;
    const buyRecord: StockHolding = {
      id: this.holdId,
      stockId,
      stockName,
      buyPrice: price,
      amount,
      buyDate: date
    };
    await this.mockStockHoldingService.create({
      id: buyRecord.id,
      stockId: buyRecord.stockId,
      stockName: buyRecord.stockName,
      buyPrice: buyRecord.buyPrice,
      amount: buyRecord.amount,
      buyDate: new Date(buyRecord.buyDate),
      times
    });
    return buyRecord;
  }
  
  private async createSellRecord(createRecord: StockHolding,  price: number, date: string): Promise<StockHolding> {
    const profit = (price - createRecord.buyPrice) * createRecord.amount - (price + createRecord.buyPrice) * createRecord.amount * this.defaultConfig.feeRate;
    const sellRecord: StockHolding = {
      id: createRecord.id,
      stockId: createRecord.stockId,
      amount: createRecord.amount,
      buyDate: createRecord.buyDate,
      buyPrice: createRecord.buyPrice,
      fee: (price + createRecord.buyPrice) * createRecord.amount * this.defaultConfig.feeRate,
      profit: profit,
      profitRate: profit / (createRecord.buyPrice * createRecord.amount) * 100,
      sellDate: date,
      sellPrice: price,
      stockName: createRecord.stockName,
    }
    await this.mockStockHoldingService.update(sellRecord.id, {
      sellDate: new Date(sellRecord.sellDate),
      sellPrice: sellRecord.sellPrice,
      fee: sellRecord.fee,
      profit: sellRecord.profit,
      profitRate: sellRecord.profitRate,
    });
    return sellRecord;
  }
  
  private async getStockAllData(code: string): Promise<StockData[]> {
    if (this.stockDataTotalCache[code]) {
      return this.stockDataTotalCache[code];
    }
  
    const stockData = await this.stockRepository.find({
      where: {stockid: code},
      order: {time: 'ASC'},
      select: ['time', 'open', 'high', 'low', 'close', 'volume'],
    });
  
    if (!stockData.length) {
      throw new Error(`没有该股票信息 ${code}`);
    }
  
    const formattedData: StockData[] = stockData.map(stock => ({
      time: dateToDayString(stock.time),
      open: Number(stock.open),
      high: Number(stock.high),
      low: Number(stock.low),
      close: Number(stock.close),
      volume: Number(stock.volume), // Convert BigInt to number
    }));
  
    this.stockDataTotalCache[code] = formattedData;
    return formattedData;
  }
  
  private async initStockData(startDate: string, stockList: { code: string; name: string }[]): Promise<void> {
    for (const {code, name} of stockList) {
      const data = await this.getStockAllData(code);
    
      const [nowData, nextData] = this.splitDataByDate(data, startDate);
    
      this.stockDataCache[code] = {
        code,
        name,
        data: nowData,
        nextData,
      };
    }
  }
  
  private splitDataByDate(data: StockData[], date: string): [StockData[], StockData[]] {
    const parseDate = new Date(date);
    
    return data.reduce<[StockData[], StockData[]]>(([now, next], item) => {
        const itemDate = new Date(item.time);
        return itemDate <= parseDate
          ? [[...now, item], next]
          : [now, [...next, item]];
      },
      [[], []]
    );
  }
  
  private getStockData(code: string): StockData[] | null {
    return this.stockDataCache[code]?.data || null;
  }
  
  private getNextStockData(code: string, todayDate: string): StockData[] {
    const stockData = this.stockDataCache[code];
    
    if (!stockData) {
      return [];
    }
    
    if (stockData.nextData.length === 0 && !this.emptyCodeCache[code]) {
      this.emptyCodeCache[code] = true;
      this.emptyLength++;
      return [];
    }
    
    if (stockData.nextData.length > 0) {
      while (true) {
        const nextData = stockData.nextData.shift();
        if (!nextData) {
          break;
        }
        if (new Date(nextData.time) > new Date(todayDate)) {
          stockData.nextData.unshift(nextData);
          break;
        }
        stockData.data.push(nextData);
      }
      // if (new Date(nextData.time) > new Date(todayDate)) {
      //   stockData.nextData.unshift(nextData);
      //   return stockData.data;
      // }
      // stockData.data.push(nextData);
    }
    return stockData.data;
  }
  
  private async getTimes(): Promise<number> {
    const someKey = await this.someKeyRepository.findOne({
      where: {id: 1},
    });
    return (someKey.data.times + 1) || 2;
  }
  
  private async setTimes(times: number): Promise<void> {
    const someKey = await this.someKeyRepository.findOne({
      where: {id: 1},
    });
    someKey.data.times = times;
    await this.someKeyRepository.save(someKey);
  }
  
  async startBackTest(
    stockList: { code: string; name: string }[],
    backTestType: number,
    config: Partial<StockTestConfig> = {},
  ): Promise<void> {
    const testConfig: StockTestConfig = {
      ...this.defaultConfig,
      ...config
    };
    const startTimeForTest = new Date();
    let maxHoldLens = 0;
    let maxWin = 0;
    let maxLoss = 0;
    const maxEmptyLength = stockList.length;
    const times = await this.getTimes();
    this.emptyCodeCache = {};
    this.emptyLength = 0;
    this.holdId = await this.mockStockHoldingService.getMaxId();
    console.log(`最大id ${this.holdId}`);
    let myTotalValue = testConfig.startBalance;
    let myRemainingBalance = testConfig.startBalance;
    let myStocksHolds = 0;
    let myTotalFees = 0;
    let myTotalProfit = 0;
    let myHolds: StockHolding[] = [];
    const finishStockDate: Record<string, string> = {};
    const checkFinishStockDate = (code: string, date: string): boolean => {
      if (finishStockDate[code] && new Date(finishStockDate[code]) >= new Date(date)) {
        return true;
      }
      finishStockDate[code] = date;
      return false;
    }
    const updateFinishStockDate = (code: string, date: string): void => {
      finishStockDate[code] = date;
    }
    
    await this.initStockData(testConfig.startDate, stockList);
    
    const checkTodayData = async (todayDate: string) => {
      try {
        if (this.emptyLength >= maxEmptyLength) {
          console.log('All stock data loaded');
          return;
        }
    
        // Update data for all stocks
        for (const {code} of stockList) {
          this.getNextStockData(code, todayDate);
        }
    
        // 处理持仓 卖出
        maxHoldLens = Math.max(maxHoldLens, myStocksHolds);
        const holdingsToProcess = [...myHolds];
        for (const holding of holdingsToProcess) {
          const stockData = this.getStockData(holding.stockId);
          if (!stockData) continue;
          // 今天的数据已经测试过了，不再测试
          if (checkFinishStockDate(holding.stockId, stockData[stockData.length - 1].time)) {
            continue;
          }
      
          const sellResult = await this.stockAnalysisService.quantitativeSellWithType(backTestType, stockData, holding.stockId, holding.stockName, holding.buyPrice, holding.buyDate);
          if (sellResult) {
            // 卖出股票
            const sellValue = sellResult.close * holding.amount;
            const buyValue = holding.buyPrice * holding.amount;
            myStocksHolds--;
            myTotalValue += sellValue - buyValue - testConfig.feeRate * sellValue;
            myRemainingBalance += (sellValue - testConfig.feeRate * sellValue);
            myTotalFees += (testConfig.feeRate * sellValue);
            myTotalProfit += (sellValue - buyValue - testConfig.feeRate * sellValue - testConfig.feeRate * buyValue);
            myHolds = myHolds.filter(item => item.stockId !== holding.stockId);
            console.log(`${todayDate}: 卖出 ${holding.stockId}-${holding.stockName} ${holding.amount} 股, 价格 ${sellResult.close}, 成本 ${buyValue}, 盈亏 ${(sellValue - buyValue - testConfig.feeRate * sellValue - testConfig.feeRate * buyValue)}, 手续费 ${testConfig.feeRate * sellValue + testConfig.feeRate * buyValue}, 剩余 ${myRemainingBalance}`);
            await this.createSellRecord(holding, sellResult.close, stockData[stockData.length - 1].time);
            if (myTotalProfit > maxWin) {
              maxWin = myTotalProfit;
            }
            if (myTotalProfit < maxLoss) {
              maxLoss = myTotalProfit;
            }
          }
        }
        // 打印卖出后的状态
        console.log(`${todayDate}: 持有股票数量 ${myStocksHolds}, 余额 ${myRemainingBalance}, 总盈亏 ${myTotalProfit}, 总手续费 ${myTotalFees}`)
    
        // 买
        if (myStocksHolds < testConfig.maxStocksHolds &&
          myRemainingBalance >= testConfig.minRemainingBalanceToBuy) {
          for (const {code, name} of stockList) {
            if (this.emptyCodeCache[code]) continue;
        
            if (myStocksHolds >= testConfig.maxStocksHolds ||
              myRemainingBalance < testConfig.minRemainingBalanceToBuy *
              (testConfig.maxStocksHolds - myStocksHolds)) {
              break;
            }
        
            const stockData = this.getStockData(code);
            if (!stockData?.length) continue;
            if (checkFinishStockDate(code, stockData[stockData.length - 1].time)) {
              continue;
            }
            
            const buyResult = await this.stockAnalysisService.quantitativeBuyWithType(backTestType, stockData, code, name);
            if (buyResult) {
              // 买入股票
              const canUseMoney = myRemainingBalance / (testConfig.maxStocksHolds - myStocksHolds);
              const buyAmount = Math.floor(canUseMoney / (buyResult.lastPrice * 100)) *100;
              if (buyAmount <= 0) {
                continue;
              }
              const buyValue = buyResult.lastPrice * buyAmount;
              myStocksHolds++;
              myTotalValue -= buyValue * testConfig.feeRate;
              myTotalFees += buyValue * testConfig.feeRate;
              myRemainingBalance -= (buyValue * testConfig.feeRate + buyValue);
              // 添加买入记录
              const buyRecord = await this.createBuyRecord(code, name, buyResult.lastPrice, buyAmount, stockData[stockData.length - 1].time, times);
              myHolds.push(buyRecord);
              console.log(`${todayDate}: 买入 ${code}-${name} ${buyAmount} 股, 价格 ${buyResult.lastPrice}, 成本 ${buyValue}, 手续费 ${buyValue * testConfig.feeRate}, 剩余 ${myRemainingBalance}`);
            }
            updateFinishStockDate(code, todayDate);
          }
        }
        
        if (myTotalValue > testConfig.minRemainingBalanceToBuy) {
          const tomorrowDate = new Date(todayDate);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          await checkTodayData(dateToDayString(tomorrowDate));
        }
      } catch (e) {
        console.error(e);
        throw e;
      } finally {
    
      }
    };
    console.log(`数据加载完成，开始回测：耗时：${convertSeconds((new Date().getTime() - startTimeForTest.getTime()) / 1000)}`);
    await checkTodayData(testConfig.startDate);
    await this.setTimes(times);
    console.log(`回测结束，总耗时：${convertSeconds((new Date().getTime() - startTimeForTest.getTime()) / 1000)}, 最大持仓数量 ${maxHoldLens}, 最大盈利 ${maxWin}, 最大亏损 ${maxLoss}`);
  }
}
