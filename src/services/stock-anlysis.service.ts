import {Injectable} from '@nestjs/common';
import {CacheService} from './cache.service';
import {StockExtremeGrowthDate} from '../entities/stock-extreme-growth-date.entity';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {PriceRange} from '../entities/price-range.entity';
import {QuantitativeBuyResult, QuantitativeSellResult} from '../interfaces/public-interface';
import {StockData} from '../interfaces/stock-data.interface';
import {calcRsi} from '../utils/tools';

interface StockMonthMinMax {
  minPrice: number;
  maxPrice: number;
}

@Injectable()
export class StockAnalysisService {
  private readonly STOCK_MIN_TOP_PRICE = 0.099;// 涨停最小幅度9.96%
  private readonly MONTH_GROWTH_RATIO = 3; // 月涨幅倍数
  private readonly THREE_MONTHS_LOW_PERCENT = 0.35; // 当前价格处于最近3个月的最高最低的区间
  private readonly VOLUME_RATIO = 0.2; // 30天平均成交量的和最近5天的平均成交量的比例
  private readonly LAST_DAY_VOLUME_RATIO_LOW = 1.5; // 最后一天的成交量是历史平均的倍数范围的最低值
  private readonly LAST_DAY_VOLUME_RATIO_HIGH = 4; // 最后一天的成交量是历史平均的倍数范围的最高值
  private readonly LAST_DAYS_MAX_VOLUME_RANGE = 15; // 最后一天的成交量是多少天的最大值
  private readonly THREE_YEAR_TIME = 3 * 365 * 24 * 60 * 60 * 1000; // 3年时间戳
  private readonly THREE_MONTHS_TIME = 3 * 30 * 24 * 60 * 60 * 1000; // 3个月时间戳
  private readonly ONE_MONTH_TIME = 30 * 24 * 60 * 60 * 1000; // 1月时间戳
  private readonly ONE_DAY_TIME = 24 * 60 * 60 * 1000;  // 1天时间戳
  private readonly SHORT_BUY_PRICE_LOW_PERCENT = 0.6; // 短线买入价格与最高价的比例
  private readonly SHORT_BUY_TIME_RANGE = 26; // 短线价格倍数变化的指定时间范围
  private readonly SHORT_SELL_PRICE_MIN_GAP_PERCENT = 2; // 短线流短期内价格变化最小倍数
  // private readonly DO_JI_RANGE = 0.005; // 十字星开盘价和收盘价的差距
  private readonly DO_JI_RANGE = 0.1; // 十字星开盘价和收盘价的差距
  private readonly LOW_VOLUME_EXPANSION_PRICE_PERCENT = 1.25; // 低位成交量放大流价格位置百分比
  private readonly LOW_VOLUME_EXPANSION_VOLUME_RATIO = 1.5; // 低位成交量放大流成交量倍数
  private readonly LOW_VOLUME_EXPANSION_VOLUME_RATIO_MAX = 2; // 低位成交量放大流成交量倍数最大值
  private readonly LOW_VOLUME_EXPANSION_PRICE_RANGE = 0.005; // 低位成交量放大流价格波动范围
  private readonly LOW_VOLUME_EXPANSION_PRICE_GAP_RATIO = 1.5; // 低位成交量放大流价格波动倍数
  private readonly THREE_RED_VOLUME_RATIO = 1.7; // 三红增量成交量倍数
  private readonly THREE_RED_PROFIT_RATIO = 1.15; // 三红增量盈利比例
  private readonly THREE_RED_LOSS_RATIO = 0.95; // 三红增量止损比例
  private readonly THREE_RED_TIME_RANGE = 120; // 三红增量最大持有时间
  private readonly RSI_BUY = 5; // RSI买入阈值
  private readonly RSI_SELL = 75; // RSI卖出阈值 >=85不好 后续可以测试75-85之间的情况
  private readonly RSI_T_BUY = 15; // RSI-T买入阈值
  private readonly RSI_T_SELL = 75; // RSI-T卖出阈值
  private readonly RSI_T_STOP_LOSS = 0.93; // RSI-T止损比例
  private readonly RSI_T_TAKE_PROFIT = 1.15; // RSI-T止盈比例
  private readonly RSI_T_DOJI_COUNT = 3; // RSI-T十字星数量
  private readonly RSI_T_UP_T_COUNT = 2; // RSI-T上T数量
  private readonly RSI_T_UP_T_DAYS = 15; // RSI-T上T检查天数
  private readonly RSI_T_PRICE_RANGE = 0.15; // RSI-T价格区间比例
  private readonly RSI_T_PRICE_RANGE_YEARS = 3; // RSI-T价格区间年数
  private readonly T_SHAPE_RATIO = 0.2; // T形态比例
  
  // RSI-Low-T策略参数
  private readonly RSI_LOW_T_BUY = 15; // RSI买入阈值
  private readonly RSI_LOW_T_SELL = 75; // RSI卖出阈值
  private readonly RSI_LOW_T_PROFIT_RATIO = 1.25; // 止盈比例
  private readonly RSI_LOW_T_PRICE_STAGES = 10; // 价格阶段数
  private readonly RSI_LOW_T_BOTTOM_STAGES = 2; // 底部阶段数
  private readonly RSI_LOW_T_MIN_TIME_RATIO = 0.20; // 最小时间占比
  private readonly RSI_LOW_T_UP_T_COUNT = 2; // 上T数量
  private readonly RSI_LOW_T_UP_T_DAYS = 15; // 上T检查天数
  private readonly RSI_LOW_T_DECLINE_PERIODS = 8; // 检查最近8个5日期间
  private readonly RSI_LOW_T_MIN_DECLINE_COUNT = 6; // 最少下跌期数
  
  constructor(
    private cacheService: CacheService,
    @InjectRepository(StockExtremeGrowthDate)
    private stockExtremeGrowthRepository: Repository<StockExtremeGrowthDate>,
    @InjectRepository(PriceRange)
    private priceRangeRepository: Repository<PriceRange>,
  ) {
  }
  
  private selfError(message: string): never {
    const error = new Error(message);
    (error as any).errorSelfType = true;
    throw error;
  }
  
  private async checkExtremeGrowth(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<void> {
    const cacheKey_lastExtremeGrowthDate = `lastExtremeGrowthDate`;
    const cacheKey_stockMonthMinMax = `stockMonthMinMax`;
    const lastExtremeGrowthDateCache =
      this.cacheService.get<Record<string, string[]>>(
        cacheKey_lastExtremeGrowthDate,
      ) || {};
    const stockMonthMinMaxCache =
      this.cacheService.get<Record<string, StockMonthMinMax>>(
        cacheKey_stockMonthMinMax,
      ) || {};
    
    const checkGrowthFromCache = async (stockCode: string, time: string) => {
      
      if (!lastExtremeGrowthDateCache[stockCode]) {
        const extremeGrowthDates = await this.stockExtremeGrowthRepository.find(
          {where: {stock_code: stockCode}, order: {date: 'ASC'}},
        );
        if (extremeGrowthDates.length > 0) {
          lastExtremeGrowthDateCache[stockCode] = extremeGrowthDates.map(
            (record) => record.date,
          );
          this.cacheService.set(
            cacheKey_lastExtremeGrowthDate,
            lastExtremeGrowthDateCache,
          );
          return lastExtremeGrowthDateCache[stockCode].some(
            (date) =>
              new Date(time) > new Date(date) &&
              new Date(time).getTime() - new Date(date).getTime() <
              this.THREE_YEAR_TIME,
          );
        }
        return false;
      }
      return lastExtremeGrowthDateCache[stockCode].some(
        (date) =>
          new Date(time) > new Date(date) &&
          new Date(time).getTime() - new Date(date).getTime() <
          this.THREE_YEAR_TIME,
      );
    };
    
    if (await checkGrowthFromCache(code, data[data.length - 1].time)) {
      this.selfError(
        `距离上次月内涨幅3倍以上时间不到3年，不进行量化买入：${name} (${code}), 缓存时间：${lastExtremeGrowthDateCache[code]}`,
      );
    }
    
    const checkPriceRange = async (
      code: string,
      yearNum: string,
      monthNum: string,
    ) => {
      const cacheKey = `${code}-${yearNum}-${monthNum}`;
      if (stockMonthMinMaxCache[cacheKey]) {
        return true;
      }
      
      const priceRange = await this.priceRangeRepository.findOne({
        where: {id: cacheKey},
      });
      
      if (priceRange) {
        stockMonthMinMaxCache[cacheKey] = {
          minPrice: priceRange.min_price,
          maxPrice: priceRange.max_price,
        };
        this.cacheService.set(cacheKey_stockMonthMinMax, stockMonthMinMaxCache);
        return true;
      }
      
      return false;
    };
    
    const useData = [];
    for (const item of data) {
      const [yearNum, monthNum] = item.time.split('-');
      const timeDiff =
        new Date(data[data.length - 1].time).getTime() -
        new Date(item.time).getTime();
      
      if (timeDiff < this.THREE_YEAR_TIME) {
        const hasExistingRange = await checkPriceRange(code, yearNum, monthNum);
        if (!hasExistingRange) {
          useData.push(item);
        }
      }
    }
    
    const monthlyData: Record<string, StockData[]> = {};
    useData.forEach((item) => {
      const month = item.time.split('-').slice(0, 2).join('-');
      if (!monthlyData[month]) {
        monthlyData[month] = [];
      }
      monthlyData[month].push(item);
    });
    
    const monthlyGrowthOverList: string[] = [];
    for (const [month, monthlyItems] of Object.entries(monthlyData)) {
      const maxPrice = Math.max(...monthlyItems.map((item) => item.high));
      const minPrice = Math.min(...monthlyItems.map((item) => item.low));
      const [yearNum, monthNum] = month.split('-');
      const [lastYearNum, lastMonthNum] =
        useData[useData.length - 1].time.split('-');
      const cacheKey = `${code}-${yearNum}-${monthNum}`;
      if (yearNum !== lastYearNum || monthNum !== lastMonthNum) {
        stockMonthMinMaxCache[`${code}-${yearNum}-${monthNum}`] = {
          minPrice,
          maxPrice,
        };
        await this.priceRangeRepository.save({
          id: cacheKey,
          min_price: minPrice,
          max_price: maxPrice,
        });
        this.cacheService.set(cacheKey_stockMonthMinMax, stockMonthMinMaxCache);
      }
      
      if (maxPrice / minPrice >= this.MONTH_GROWTH_RATIO) {
        monthlyGrowthOverList.push(month);
      }
    }
    
    if (monthlyGrowthOverList.length === 0) {
      return;
    }
    
    monthlyGrowthOverList.sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    lastExtremeGrowthDateCache[code] = [
      ...new Set([
        ...(lastExtremeGrowthDateCache[code] || []),
        ...monthlyGrowthOverList,
      ]),
    ];
    this.cacheService.set(cacheKey_lastExtremeGrowthDate, lastExtremeGrowthDateCache);
    
    await Promise.all(
      monthlyGrowthOverList.map(async (date) => {
        const exists = await this.stockExtremeGrowthRepository.findOne({
          where: {stock_code: code, date},
        });
        if (!exists) {
          await this.stockExtremeGrowthRepository.save({
            stock_code: code,
            date,
          });
        }
      }),
    );
    
    this.selfError(
      `距离上次月内涨幅3倍以上时间不到3年，不进行量化买入：${name} (${code})`,
    );
  }
  
  private checkPriceInLowPercent(
    data: StockData[],
    code: string,
    name: string,
  ): void {
    const lastData = data[data.length - 1];
    const useData = data.filter(
      (item) =>
        new Date(item.time).getTime() <=
        new Date(lastData.time).getTime() - this.THREE_MONTHS_TIME,
    );
    const minPrice = Math.min(...useData.map((item) => item.low));
    const maxPrice = Math.max(...useData.map((item) => item.high));
    
    if (
      lastData.close <
      minPrice + (maxPrice - minPrice) * this.THREE_MONTHS_LOW_PERCENT
    ) {
      return;
    }
    this.selfError(
      `${name} (${code}) - 价格不处于历史三个月的${this.THREE_MONTHS_LOW_PERCENT * 100}%低价`,
    );
  }
  
  private checkLastDayUp(data: StockData[], code: string, name: string): void {
    const useData = data[data.length - 1];
    if (useData.open < useData.close) {
      return;
    }
    this.selfError(`${name} (${code}) - 最后一天未上涨`);
  }
  
  private checkVolumeRatio(
    data: StockData[],
    code: string,
    name: string,
  ): number {
    const useData = data
      .filter((item) =>
        new Date(item.time).getTime() >= new Date(data[data.length - 1].time).getTime() - this.ONE_MONTH_TIME,
      ).slice(0, -1);
    const last5DaysVolumeAverage =
      useData.slice(-5).reduce((acc, cur) => acc + cur.volume, 0) / useData.slice(-5).length;
    const last30DaysVolumeAverage =
      useData.reduce((acc, cur) => acc + cur.volume, 0) / useData.length;
    const minVolume = Math.min(last5DaysVolumeAverage, last30DaysVolumeAverage);
    const maxVolume = Math.max(last5DaysVolumeAverage, last30DaysVolumeAverage);
    
    if ((maxVolume - minVolume) / minVolume < this.VOLUME_RATIO) {
      return last5DaysVolumeAverage;
    }
    this.selfError(
      `${name} (${code}) - 30天成交量和最近5天的成交量差距不在${this.VOLUME_RATIO * 100}%范围内`,
    );
  }
  
  private checkLastDayVolume(
    data: StockData[],
    code: string,
    name: string,
    last5DaysVolumeAverage: number,
  ): void {
    const useData = data[data.length - 1];
    if (
      useData.volume < last5DaysVolumeAverage * this.LAST_DAY_VOLUME_RATIO_LOW ||
      useData.volume > last5DaysVolumeAverage * this.LAST_DAY_VOLUME_RATIO_HIGH
    ) {
      this.selfError(
        `${name} (${code}) - 最后一天的成交量不处于最近5天的成交量的${this.LAST_DAY_VOLUME_RATIO_LOW * 100}%-${this.LAST_DAY_VOLUME_RATIO_HIGH * 100}%之间`,
      );
    }
  }
  
  private checkLastDaysIsMaxVolume(
    data: StockData[],
    code: string,
    name: string,
  ): void {
    const useData = data
      .filter((item) =>
        new Date(item.time).getTime() >= new Date(data[data.length - 1].time).getTime() - this.LAST_DAYS_MAX_VOLUME_RANGE * 24 * 60 * 60 * 1000).slice(0, -1);
    const maxVolume = Math.max(...useData.map((item) => item.volume));
    const lastVolume = data[data.length - 1].volume;
    
    if (lastVolume <= maxVolume) {
      this.selfError(
        `${name} (${code}) - 最后一天的成交量不是最近${this.LAST_DAYS_MAX_VOLUME_RANGE}天最大的`,
      );
    }
    
    const yesterdayData = data[data.length - 2];
    if (yesterdayData.volume > lastVolume * 0.7) {
      this.selfError(`${name} (${code}) - 昨天的成交量大于今天的70%`);
    }
  }
  
  // 检查最近指定天数最高价和最低价的差距是否超过指定比例
  private checkPriceRange(
    data: StockData[],
    code: string,
    name: string,
    multiple: number,
    rangeDays: number,
  ): { maxPrice: number, minPrice: number, maxPriceTime: string, minPriceTime: string, maxIndex: number, minIndex: number } {
    const useData = data.slice(-rangeDays);
    // 遍历指定天数的最高价和最低价和最高价时间
    let maxPrice = 0;
    let minPrice = Infinity;
    let maxPriceTime = '';
    let minPriceTime = '';
    let maxIndex = 0;
    let minIndex = 0;
    for (let i = 0; i < useData.length; i++) {
      const item = useData[i];
      if (item.high > maxPrice) {
        maxPrice = item.high;
        maxPriceTime = item.time;
        maxIndex = data.length - rangeDays + i;
      }
      if (item.low < minPrice) {
        minPrice = item.low;
        minPriceTime = item.time;
        minIndex = data.length - rangeDays + i;
      }
    }
    // console.log(`${name} (${code}) - 最近${rangeDays}天最高价：${maxPrice} (${maxPriceTime})，最低价：${minPrice} (${minPriceTime})`,);
    
    if (maxPrice / minPrice <= multiple) {
      this.selfError(
        `${name} (${code}) - 最近${rangeDays}天最高价和最低价的差距不超过${multiple}倍`,
      );
    }
    return {maxPrice, minPrice, maxPriceTime, minPriceTime, maxIndex, minIndex};
  }
  
  private checkPriceNow(
    data: StockData[],
    code: string,
    name: string,
    priceTarget: number,
    compareType: 'less' | 'greater' = 'less',
  ): void {
    if (code === '002593') {
      console.log('1');
    }
    const useData = data[data.length - 1];
    if (useData.close < priceTarget && compareType === 'greater') {
      this.selfError(`${name} (${code}) - 当前价格低于目标价格`);
    }
    if (useData.close > priceTarget && compareType === 'less') {
      this.selfError(`${name} (${code}) - 当前价格高于目标价格`);
    }
  }
  
  private checkLastDayDown(data: StockData[]): boolean {
    const useData = data[data.length - 1];
    if (useData.open > useData.close) {
      return true;
    }
    return false;
  }
  
  // 检查股票当天是否跌幅超过指定比例
  private checkPriceDownOverRatio(
    data: StockData[],
    multiple: number,
  ): boolean {
    const useData = data[data.length - 1];
    const yesterdayData = data[data.length - 2];
    return (useData.close - yesterdayData.close) / yesterdayData.close < multiple * -1;
  }
  
  // 收盘价和开盘价差距超过指定比例
  private checkPriceOpenDiff(
    data: StockData[],
    multiple: number,
  ): boolean {
    const useData = data[data.length - 1];
    return (useData.close - useData.open) / useData.open < multiple;
  }
  
  private checkPriceLowerThanPreviousDays(
    data: StockData[],
    previousDays: number,
    multiple: number,
  ): boolean {
    const useData = data[data.length - 1];
    const previousData = data[data.length - previousDays - 1];
    return useData.close < previousData.close * multiple;
  }
  
  private checkHasDayUp(data: StockData[], code: string, name: string, startDay: number | Date | null = null): void {
    let useData = data;
    if (startDay) {
      useData = useData
        .filter((item) =>
          new Date(item.time).getTime() >= new Date(startDay).getTime(),
        );
    }
    let lastDayClose = useData[0].close;
    for (const item of useData) {
      if (item.close > lastDayClose) {
        return;
      }
      lastDayClose = item.close;
    }
    this.selfError(`${name} (${code}) - 至今未上涨`);
  }
  
  // 十字星判定
  private checkLastDayDoji(data: StockData): boolean {
    // if (Math.abs(data.open - data.close) > this.DO_JI_RANGE * data.open) {
    // if (Math.abs(data.open - data.close) > this.DO_JI_RANGE * (data.high - data.low)) {
    //   return false;
    // }
    // return true;
    
    // 解析数据
    const {open, close, high, low} = data;
    
    // 计算影线长度
    const upperShadow = high - Math.max(open, close);
    const lowerShadow = Math.min(open, close) - low;
    
    // 计算开盘价和收盘价的差值
    const priceDifference = Math.abs(open - close);
    
    // 计算价格波动范围
    const priceRange = high - low;
    
    // 定义影线长度和价格差的相对阈值
    const shadowThreshold = 0.3; // 影线长度占价格波动范围的30%
    const priceDiffThreshold = 0.05; // 价格差占价格波动范围的5%
    if (priceRange > 0 && (priceDifference / priceRange) <= priceDiffThreshold && (upperShadow / priceRange) >= shadowThreshold && (lowerShadow / priceRange) >= shadowThreshold) {
      return true;
    } else {
      return false;
    }
  }
  
  // 检查是否是上T形态
  private checkIsUpTShape(data: StockData): boolean {
    // const {open, close, high, low} = data;
    // const priceGap = Math.abs(open - close);
    // const highGap = Math.abs(high - low);
    // return priceGap < highGap * this.T_SHAPE_RATIO;
    // 解析数据
    const {open, close, high, low} = data;
    
    // 计算影线长度
    const upperShadow = high - Math.max(open, close);
    // 计算开盘价和收盘价的差值
    const priceDifference = Math.abs(open - close);
    // 计算价格波动范围
    const priceRange = high - low;
    // 定义影线长度和价格差的相对阈值
    const shadowThreshold = 0.70; // 影线长度占价格波动范围的80%
    const priceDiffThreshold = 0.2; // 价格差占价格波动范围的10%
    if (
      priceRange > 0 &&
      (priceDifference / priceRange) <= priceDiffThreshold &&
      (upperShadow / priceRange) >= shadowThreshold
    ) {
      return true;
    } else {
      return false;
    }
  }
  
  // 检查是否是下T形态
  private checkIsDownTShape(data: StockData): boolean {
    // const {open, close, high, low} = data;
    // const priceGap = Math.abs(open - close);
    // const lowGap = Math.abs(low - high);
    // return priceGap < lowGap * this.T_SHAPE_RATIO;
    // 解析数据
    const {open, close, high, low} = data;
    
    // 计算影线长度
    const lowerShadow = Math.min(open, close) - low;
    // 计算开盘价和收盘价的差值
    const priceDifference = Math.abs(open - close);
    // 计算价格波动范围
    const priceRange = high - low;
    // 定义影线长度和价格差的相对阈值
    const shadowThreshold = 0.7; // 影线长度占价格波动范围的80%
    const priceDiffThreshold = 0.2; // 价格差占价格波动范围的10%
    return priceRange > 0 &&
      (priceDifference / priceRange) <= priceDiffThreshold &&
      (lowerShadow / priceRange) >= shadowThreshold;
  }
  
  // 判断从指定日期到最后是否全部不上涨
  private checkNotUpFromDate(data: StockData[], code: string, name: string, startDay: number | Date): void {
    const useData = data
      .filter((item) =>
        new Date(item.time).getTime() >= new Date(startDay).getTime(),
      );
    let lastDayClose = useData[0].close;
    for (const item of useData) {
      if (item.close > lastDayClose) {
        this.selfError(`${name} (${code}) - 从${startDay}开始未上涨`);
        return;
      }
      lastDayClose = item.close;
    }
  }
  
  async quantitativeBuyWithType(type: number, stockData: StockData[], code: string, name: string): Promise<QuantitativeBuyResult | undefined> {
    // 1: 简单回测策略
    if (type === 1) {
      return await this.quantitativeBuy(stockData, code, name);
    }
    // 2. 妖股反弹策略
    if (type === 2) {
      return await this.quantitativeBuy_shorttime(stockData, code, name);
    }
    // 3. 低位成交量放大流策略
    if (type === 3) {
      return await this.quantitativeBuy_lowVolumeExpansion(stockData, code, name);
    }
    // 4. 三红增量策略
    if (type === 4) {
      return await this.quantitativeBuy_threeRedVolume(stockData, code, name);
    }
    // 5. RSI 策略
    if (type === 5) {
      return await this.quantitativeBuy_rsi(stockData, code, name);
    }
    
    // 6. RSI-T策略
    if (type === 6) {
      return await this.quantitativeBuy_rsiT(stockData, code, name);
    }
    
    // 7. RSI-LOW-T策略
    if (type === 7) {
      return await this.quantitativeBuy_rsiLowT(stockData, code, name);
    }
  }
  
  async quantitativeSellWithType(type: number, stockData: StockData[], code: string, name: string, buyPrice: number, buyTime: string): Promise<QuantitativeSellResult | undefined> {
    if (type === 1) {
      return await this.quantitativeSell(stockData, code, name, buyPrice);
    }
    if (type === 2) {
      return await this.quantitativeSell_shorttime(stockData, code, name, buyPrice, new Date(buyTime));
    }
    // 3. 低位成交量放大流策略
    if (type === 3) {
      return await this.quantitativeSell_lowVolumeExpansion(stockData, code, name, buyPrice);
    }
    // 4. 三红增量策略
    if (type === 4) {
      return await this.quantitativeSell_threeRedVolume(stockData, code, name, buyPrice, new Date(buyTime));
    }
    // 5. RSI 策略
    if (type === 5) {
      return await this.quantitativeSell_rsi(stockData, code, name);
    }
    // 6. RSI-T策略
    if (type === 6) {
      return await this.quantitativeSell_rsiT(stockData, code, name, buyPrice, new Date(buyTime));
    }
    
    // 7. RSI-LOW-T策略
    if (type === 7) {
      return await this.quantitativeSell_rsiLowT(stockData, code, name, buyPrice);
    }
  }
  
  async quantitativeBuy(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      this.checkLastDayUp(data, code, name);
      await this.checkExtremeGrowth(data, code, name);
      this.checkPriceInLowPercent(data, code, name);
      const last5DaysVolumeAverage = this.checkVolumeRatio(data, code, name);
      this.checkLastDayVolume(data, code, name, last5DaysVolumeAverage);
      this.checkLastDaysIsMaxVolume(data, code, name);
      
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
        // console.log(`${name} (${code}) - ${e.message}`);
      } else {
        console.error('Unexpected error during quantitative buy analysis:', e);
        throw new Error('Unexpected error during quantitative buy analysis');
      }
    }
  }
  
  async quantitativeSell(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const averageVolumeLast5Days =
        data.slice(-6, -1).reduce((acc, curr) => acc + curr.volume, 0) / 5;
      const {close, volume, open} = data[data.length - 1];
      
      const isVolume150Percent = volume > 1.5 * averageVolumeLast5Days;
      const isVolume400Percent = volume > 4 * averageVolumeLast5Days;
      const isBelow85PercentTarget = close < buyPrice * 0.93;
      const isPriceDown = close < open;
      const isPriceUp = close > open;
      
      if (isPriceDown && isVolume150Percent) {
        console.log(
          code,
          name,
          '条件1满足：今天价格下跌且交易量大于过去5日平均成交量150%',
        );
        return {code, name, close};
      } else if (isPriceUp && isVolume400Percent) {
        console.log(
          code,
          name,
          '条件2满足：今天价格上涨且成交量大于过去5日平均成交量400%',
        );
        return {code, name, close};
      } else if (isBelow85PercentTarget) {
        console.log(code, name, '条件3满足：今天的收盘价低于目标价格的93%');
        return {code, name, close};
      }
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
        // console.log(`${name} (${code}) - ${e.message}`);
      } else {
        console.error('Unexpected error during quantitativeSell analysis:', e);
        throw new Error('Unexpected error during quantitativeSell analysis');
      }
    }
  }
  
  async quantitativeBuy_shorttime(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      const {
        maxPrice,
        maxPriceTime,
        minPrice,
        minPriceTime,
        maxIndex
      } = this.checkPriceRange(data, code, name, this.SHORT_SELL_PRICE_MIN_GAP_PERCENT, this.SHORT_BUY_TIME_RANGE);
      this.checkPriceNow(data, code, name, maxPrice * this.SHORT_BUY_PRICE_LOW_PERCENT, 'less');
      // 最后时间和最高价时间不超过6交易日
      if (data.length - maxIndex > 6) {
        this.selfError(`${name} (${code}) - 最高价时间距离最后一天时间超过6个交易日`);
      }
      // this.checkNotUpFromDate(data, code, name, new Date(maxPriceTime));
      console.log(code, name, `最高价：${maxPrice} (${maxPriceTime})，最低价：${minPrice} (${minPriceTime})`);
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
        // console.log(`${name} (${code}) - ${e.message}`);
      } else {
        console.error('Unexpected error during quantitativeBuy_shorttime analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_shorttime analysis');
      }
    }
  }
  
  async quantitativeSell_shorttime(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
    buyTime: number | Date,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const buyDate = new Date(buyTime);
      const useData = data.filter((item) => new Date(item.time).getTime() >= buyDate.getTime());
      this.checkHasDayUp(useData, code, name);
      const isDoji = this.checkLastDayDoji(useData[useData.length - 1]);
      const lastDayDown = this.checkLastDayDown(useData);
      if (isDoji || lastDayDown) {
        return {code, name, close: useData[useData.length - 1].close};
      }
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
        // console.log(`${name} (${code}) - ${e.message}`);
      } else {
        console.error('Unexpected error during quantitativeSell_shorttime analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_shorttime analysis');
      }
    }
  }
  
  // 检查是否是ST
  private checkIsST(name: string): boolean {
    return name.includes('ST');
  }
  
  // 检查价格是否处于指定天数的低位百分比
  private checkPriceInLowPercentWithDays(data: StockData[], percent: number, days: number): boolean {
    const useData = data.slice(-days);
    const minPrice = Math.min(...useData.map(item => item.low));
    const lastPrice = data[data.length - 1].close;
    return lastPrice <= minPrice * percent;
  }
  
  // 检查价格是否高于前N天的平均价
  private checkPriceHigherThanAverage(data: StockData[], days: number, percent: number = 1): boolean {
    const useData = data.slice(-days);
    const averagePrice = useData.reduce((acc, cur) => acc + cur.close, 0) / useData.length;
    return data[data.length - 1].close > averagePrice * percent;
  }
  
  // 检查价格是否连续多天高于前N天的平均价
  private checkPriceHigherThanAverageWithDays(data: StockData[], days: number, continuousDays: number, percent: number = 1): boolean {
    for (let i = 0; i < continuousDays; i++) {
      const useData = data.slice(-days - i, i ? -i : undefined);
      const averagePrice = useData.reduce((acc, cur) => acc + cur.close, 0) / useData.length;
      if (useData[useData.length - 1 - i].close < averagePrice * percent) {
        return false;
      }
    }
    return true;
  }
  
  // 检查成交量是否是前N天的最大值
  private checkVolumeIsMaxInDays(data: StockData[], days: number): boolean {
    const useData = data.slice(-days - 1, -1);
    const maxVolume = Math.max(...useData.map(item => item.volume));
    return data[data.length - 1].volume > maxVolume;
  }
  
  // 检查成交量是否在前N天平均成交量的指定倍数范围内
  private checkVolumeInRangeOfAverage(data: StockData[], days: number, minRatio: number, maxRatio: number): boolean {
    const useData = data.slice(-days - 1, -1);
    const averageVolume = useData.reduce((acc, cur) => acc + cur.volume, 0) / useData.length;
    const lastVolume = data[data.length - 1].volume;
    return lastVolume >= averageVolume * minRatio && lastVolume <= averageVolume * maxRatio;
  }
  
  // 检查是否是第一次成交量超过前N天平均成交量的指定倍数
  private checkIsFirstVolumeExpansion(data: StockData[], days: number, ratio: number): boolean {
    const useData = data.slice(-days);
    const averageVolume = useData.slice(0, -1).reduce((acc, cur) => acc + cur.volume, 0) / (useData.length - 1);
    // 检查前面是否有超过这个倍数的
    for (let i = 0; i < useData.length - 1; i++) {
      if (useData[i].volume >= averageVolume * ratio) {
        return false;
      }
    }
    return useData[useData.length - 1].volume >= averageVolume * ratio;
  }
  
  // 检查价格波动是否超过指定倍数
  private checkPriceGapRatio(data: StockData, ratio: number): boolean {
    const {open, close, high, low} = data;
    const priceGap = Math.abs(open - close);
    const highGap = Math.abs(high - Math.max(open, close));
    const lowGap = Math.abs(low - Math.min(open, close));
    return highGap > priceGap * ratio || lowGap > priceGap * ratio;
  }
  
  // 价格在指定交易日内是否涨幅超过指定百分比
  private checkPriceUpPercentWithDays(data: StockData[], percent: number, days: number): boolean {
    const useData = data.slice(-days);
    const lastPrice = data[data.length - 1].close;
    const firstPrice = useData[0].close;
    const priceUpPercent = (lastPrice - firstPrice) / firstPrice;
    return priceUpPercent >= percent;
  }
  
  // 检测最后一天是否涨停
  private checkIsTop(data: StockData[]): boolean {
    const lastPrice = data[data.length - 1].close;
    const yesterdayPrice = data[data.length - 2].close;
    const priceGap = lastPrice - yesterdayPrice;
    return priceGap >= yesterdayPrice * this.STOCK_MIN_TOP_PRICE;
  }
  
  // 计算RSI
  private calculateRSI(stockData: StockData[], code: string | null = null, days: number = 12): number {
    if (days < 1 || stockData.length < days + 1) {
      this.selfError('RSI计算参数错误：' + `days=${days}, stockData.length=${stockData.length}`);
    }
    const useData = stockData.slice(-days - 40);
    const rsiList = calcRsi(useData.map(item => item.close));
    return rsiList[rsiList.length - 1];
  }
  
  // 检查最近N天内上T的数量
  private checkUpTCount(data: StockData[], days: number): number {
    return data.slice(-days).filter(day => this.checkIsUpTShape(day)).length;
  }
  
  // 检查最近N天内十字星的数量
  private checkDojiCount(data: StockData[]): number {
    return data.filter(day => this.checkLastDayDoji(day)).length;
  }
  
  // 检查价格是否在3年区间的低位
  private checkPriceInThreeYearRange(data: StockData[], code: string, name: string): void {
    const lastData = data[data.length - 1];
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - this.RSI_T_PRICE_RANGE_YEARS);
    
    const threeYearData = data.filter(item => new Date(item.time) >= threeYearsAgo);
    const maxPrice = Math.max(...threeYearData.map(item => item.high));
    const minPrice = Math.min(...threeYearData.map(item => item.low));
    const priceRange = maxPrice - minPrice;
    
    if (lastData.close > minPrice + priceRange * this.RSI_T_PRICE_RANGE) {
      this.selfError(`${name} (${code}) - 当前价格高于3年区间低位15%`);
    }
  }
  
  // 检查价格是否在3年底部阶段
  private checkPriceInBottomStages(data: StockData[], code: string, name: string): void {
    const tradingDays = 3 * 243;
    let threeYearData = data.slice(-tradingDays);
    
    if (threeYearData.length < tradingDays / 3) {
      this.selfError(`${name} (${code}) - 数据不足1年`);
    }
    
    const removeCount = 7;
    // Sort data by high price and remove 10 highest values
    const highPrices = threeYearData.map(item => item.high).sort((a, b) => b - a);
    const maxPrice = highPrices[removeCount]; // Get the 4th highest price
  
    // Sort data by low price and remove 10 lowest values
    const lowPrices = threeYearData.map(item => item.low).sort((a, b) => a - b);
    const minPrice = lowPrices[removeCount]; // Get the 4th lowest price
  
    // Filter out data points with extreme values
    threeYearData = threeYearData.filter(item =>
      item.high <= highPrices[removeCount] && item.low >= lowPrices[removeCount]
    );
    const priceRange = maxPrice - minPrice;
    const stageSize = priceRange / this.RSI_LOW_T_PRICE_STAGES;
    
    const stageCounts = new Array(this.RSI_LOW_T_PRICE_STAGES).fill(0);
    threeYearData.forEach(item => {
      const stageIndex = Math.floor((item.close - minPrice) / stageSize);
      const safeIndex = Math.min(Math.max(stageIndex, 0), this.RSI_LOW_T_PRICE_STAGES - 1);
      stageCounts[safeIndex]++;
    });
    
    const bottomStagesCount = stageCounts.slice(0, this.RSI_LOW_T_BOTTOM_STAGES).reduce((a, b) => a + b, 0);
    const timeRatio = bottomStagesCount / threeYearData.length;
    
    const currentPrice = data[data.length - 1].close;
    const currentStage = Math.floor((currentPrice - minPrice) / stageSize);
    
    if (currentStage >= this.RSI_LOW_T_BOTTOM_STAGES) {
      this.selfError(`${name} (${code}) - 当前价格不在底部${this.RSI_LOW_T_BOTTOM_STAGES}个阶段内`);
    }
    
    if (timeRatio < this.RSI_LOW_T_MIN_TIME_RATIO) {
      this.selfError(`${name} (${code}) - 底部阶段时间占比${(timeRatio * 100).toFixed(2)}%小于${this.RSI_LOW_T_MIN_TIME_RATIO * 100}%`);
    }
    if (code === '603517') {
      console.log('-------------------------------------------------------------------------------');
      console.log(bottomStagesCount, timeRatio, currentStage, '绝味食品');
      console.log(highPrices[removeCount]);
      console.log(lowPrices[removeCount]);
      console.log('-------------------------------------------------------------------------------');
    }
  }
  
  // 检查价格是否是在阴跌
  private checkFiveDayDeclinePeriods(data: StockData[], code: string, name: string): void {
    // 需要至少 8个5日期间 + 1天的数据
    if (data.length < this.RSI_LOW_T_DECLINE_PERIODS * 4 + 1) {
      this.selfError(`${name} (${code}) - 历史数据不足${this.RSI_LOW_T_DECLINE_PERIODS * 4 + 1}天`);
    }
    
    let declineCount = 0;
    // 检查最近8个5日期间
    for (let i = 0; i < this.RSI_LOW_T_DECLINE_PERIODS; i++) {
      const periodStart = data.length - 5 - (i * 4);
      const periodEnd = data.length - (i * 4);
      const periodData = data.slice(periodStart, periodEnd);
      
      // 如果收盘价下跌，计数加1
      if (periodData[periodData.length - 1].close < periodData[0].close) {
        declineCount++;
      }
    }
    
    if (declineCount >= this.RSI_LOW_T_MIN_DECLINE_COUNT) {
      this.selfError(`${name} (${code}) - 最近${this.RSI_LOW_T_DECLINE_PERIODS}个5日期间中有${declineCount}个下跌期间，大于等于要求的${this.RSI_LOW_T_MIN_DECLINE_COUNT}个`);
    }
  }
  
  // 低位成交量放大流买入
  async quantitativeBuy_lowVolumeExpansion(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      // 0. 股票名称中不包含ST
      if (this.checkIsST(name)) {
        this.selfError(`${name} (${code}) - 股票名称中包含ST`);
      }
      
      // 1. 当前股票的价格低于30交易日的最低价的125%
      if (!this.checkPriceInLowPercentWithDays(data, this.LOW_VOLUME_EXPANSION_PRICE_PERCENT, 30)) {
        this.selfError(`${name} (${code}) - 价格不处于30交易日的低位25%`);
      }
      
      // 2. 股票价格高于前5交易日的收盘平均价
      if (!this.checkPriceHigherThanAverage(data, 5)) {
        this.selfError(`${name} (${code}) - 价格不高于5交易日的收盘平均价`);
      }
      
      // 3. 成交量是20交易日内最大的
      if (!this.checkVolumeIsMaxInDays(data, 20)) {
        this.selfError(`${name} (${code}) - 成交量不是20交易日内最大的`);
      }
      
      // 4. 当天股票收盘价高于开盘价
      const isLastDayDown = this.checkLastDayDown(data);
      if (isLastDayDown) {
        this.selfError(`${name} (${code}) - 当天股票收盘价不高于开盘价`);
      }
      
      // 5. 当天成交量是20交易日平均成交量的1.5-2倍
      if (!this.checkVolumeInRangeOfAverage(data, 20, this.LOW_VOLUME_EXPANSION_VOLUME_RATIO, this.LOW_VOLUME_EXPANSION_VOLUME_RATIO_MAX)) {
        this.selfError(`${name} (${code}) - 当天成交量不在20交易日平均成交量的1.5-2倍范围内`);
      }
      
      // 6. 第一次成交量高于20交易日的1.5倍
      if (!this.checkIsFirstVolumeExpansion(data, 20, this.LOW_VOLUME_EXPANSION_VOLUME_RATIO)) {
        this.selfError(`${name} (${code}) - 不是第一次成交量高于20交易日的1.5倍`);
      }
      
      // 7. 当前价格不高于历史500交易日收盘价均价的70%
      if (this.checkPriceHigherThanAverage(data, 500, 0.7)) {
        this.selfError(`${name} (${code}) - 当前价格高于历史500交易日收盘价均价的70%`);
      }
      
      // 8. 120交易日内，当最低价在最高价之前的时候，最高价不超过最低价的145%
      const {minPrice, maxPrice, minIndex, maxIndex} = this.checkPriceRange(data, code, name, 0, 120);
      if (minIndex < maxIndex && maxPrice > minPrice * 1.45) {
        this.selfError(`${name} (${code}) - 120交易日内，当最低价在最高价之前的时候，最高价超过最低价的160%`);
      }
      
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeBuy_lowVolumeExpansion analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_lowVolumeExpansion analysis');
      }
    }
  }
  
  // 低位成交量放大流卖出
  async quantitativeSell_lowVolumeExpansion(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const lastData = data[data.length - 1];
      
      // 1. 最后一天的收盘价和开盘价的差距小于开盘价*0.005 三天内涨幅25%
      if (this.checkLastDayDoji(data[data.length - 1]) && this.checkPriceUpPercentWithDays(data, 0.25, 3)) {
        console.log(`卖出符合条件：${name} (${code}) - 最后一天是十字星且三天内涨幅25%`);
        return {code, name, close: lastData.close};
      }
      
      // 2. 最高价与开盘价和收盘价中高的一个的相差绝对值大于开盘价和收盘价相差绝对值的1.5倍
      // 或者最低价与开盘价和收盘价中低的一个的相差绝对值大于开盘价和收盘价相差绝对值的1.5倍
      if (this.checkPriceGapRatio(lastData, this.LOW_VOLUME_EXPANSION_PRICE_GAP_RATIO)) {
        console.log(`卖出符合条件：${name} (${code}) - 上下影线超过1.5倍`);
        return {code, name, close: lastData.close};
      }
      
      // 3. 当前价格在5交易日的收盘平均价以下
      if (!this.checkPriceHigherThanAverageWithDays(data, 5, 3)) {
        console.log(`卖出符合条件：${name} (${code}) - 当前价格低于5交易日的收盘平均价`);
        return {code, name, close: lastData.close};
      }
      
      // 4. 当天成交量是20交易日内最高，且大于前21-40交易日的最高的2倍 且不是涨停
      if (this.checkVolumeIsMaxInDays(data, 20)) {
        const previousData = data.slice(-41, -21);
        const maxVolume = Math.max(...previousData.map(item => item.volume));
        if (lastData.volume > maxVolume * 2 && !this.checkIsTop(data)) {
          console.log(`卖出符合条件：${name} (${code}) - 当天成交量是20交易日内最高，且大于前21-40交易日的最高的2倍, 且不是涨停`);
          return {code, name, close: lastData.close};
        }
      }
      
      // 5. 股票当天下跌超过5%
      if (this.checkPriceDownOverRatio(data, 0.05)) {
        console.log(`卖出符合条件：${name} (${code}) - 股票当天下跌超过5%`);
        return {code, name, close: lastData.close};
      }
      
      // 6. 当天的（收盘价-开盘价）/开盘价>=4.5%
      if (this.checkPriceOpenDiff(data, 0.045)) {
        console.log(`卖出符合条件：${name} (${code}) - 当天的（收盘价-开盘价）/开盘价>=4.5%`);
        return {code, name, close: lastData.close};
      }
      
      // 7. 当天收盘价低于2交易日前收盘价的93%
      if (this.checkPriceLowerThanPreviousDays(data, 2, 0.93)) {
        console.log(`卖出符合条件：${name} (${code}) - 当天收盘价低于2交易日前收盘价的93%`);
        return {code, name, close: lastData.close};
      }
      
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeSell_lowVolumeExpansion analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_lowVolumeExpansion analysis');
      }
    }
  }
  
  // 三红增量买入
  async quantitativeBuy_threeRedVolume(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      // 检查最近三天的数据
      const lastThreeDays = data.slice(-3);
      const previousDays = data.slice(-25, -3);
      
      // 1. 检查最近三个交易日的收盘价都大于开盘价
      for (const day of lastThreeDays) {
        if (day.close <= day.open) {
          this.selfError(`${name} (${code}) - 最近三天不都是收盘价大于开盘价`);
        }
      }
      
      // 2. 计算前22个交易日的平均成交量
      const avgVolume = previousDays.reduce((sum, day) => sum + day.volume, 0) / previousDays.length;
      
      // 检查最近三天的成交量是否都大于平均成交量的2倍
      for (const day of lastThreeDays) {
        if (day.volume <= avgVolume * this.THREE_RED_VOLUME_RATIO) {
          this.selfError(`${name} (${code}) - 最近三天成交量不都大于前22天平均成交量的2倍`);
        }
      }
      
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeBuy_threeRedVolume analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_threeRedVolume analysis');
      }
    }
  }
  
  // 三红增量卖出
  async quantitativeSell_threeRedVolume(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
    buyTime: Date,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const lastPrice = data[data.length - 1].close;
      
      // 1. 当前价格高于买入价格的1.1倍
      if (lastPrice >= buyPrice * this.THREE_RED_PROFIT_RATIO) {
        console.log(`卖出符合条件：${name} (${code}) - 当前价格高于买入价格的${this.THREE_RED_PROFIT_RATIO}倍`);
        return {code, name, close: lastPrice};
      }
      
      // 2. 当前价格低于买入价格的0.93倍
      if (lastPrice <= buyPrice * this.THREE_RED_LOSS_RATIO) {
        console.log(`卖出符合条件：${name} (${code}) - 当前价格低于买入价格的${this.THREE_RED_LOSS_RATIO}倍`);
        return {code, name, close: lastPrice};
      }
      
      // 3. 买入超过120天,不是交易日
      if (new Date(data[data.length - 1].time).getTime() - buyTime.getTime() >= this.THREE_RED_TIME_RANGE * this.ONE_DAY_TIME) {
        console.log(`卖出符合条件：${name} (${code}) - 买入时间超过120天`);
        return {code, name, close: lastPrice};
      }
      
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeSell_threeRedVolume analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_threeRedVolume analysis');
      }
    }
  }
  
  // RSI 30买入
  async quantitativeBuy_rsi(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      // 1. 最近14天的RSI值均值小于30
      const rsi14 = this.calculateRSI(data);
      if (rsi14 > this.RSI_BUY) {
        this.selfError(`${name} (${code}) - 最近14天的RSI值均值大于${this.RSI_BUY}`);
      }
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeBuy_rsi30 analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_rsi30 analysis');
      }
    }
  }
  
  // RSI 70卖出
  async quantitativeSell_rsi(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const rsi14 = this.calculateRSI(data);
      if (rsi14 >= this.RSI_SELL) {
        console.log(`卖出符合条件：${name} (${code}) - 最近14天的RSI值均值大于等于${this.RSI_SELL}`);
        return {code, name, close: data[data.length - 1].close};
      }
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeSell_rsi70 analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_rsi70 analysis');
      }
    }
  }
  
  // RSI-T买入策略
  async quantitativeBuy_rsiT(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      // 1. RSI低于10
      const rsi14 = this.calculateRSI(data, code);
      if (rsi14 > this.RSI_T_BUY) {
        this.selfError(`${name} (${code}) - RSI值${rsi14}大于${this.RSI_T_BUY}`);
      }
      console.log(`${code} ${name} ${data[data.length - 1].time} RSI值${rsi14}小于${this.RSI_T_BUY}`, rsi14);
      
      // 2. 当天是下T形态
      if (!this.checkIsDownTShape(data[data.length - 1])) {
        this.selfError(`${name} (${code}) - 当天不是下T形态`);
      }
      
      // 3. 价格在3年区间的低位
      this.checkPriceInThreeYearRange(data, code, name);
      
      // 4. 15日内不允许出现上T
      if (this.checkUpTCount(data.slice(-this.RSI_T_UP_T_DAYS), this.RSI_T_UP_T_DAYS) >= 1) {
        this.selfError(`${name} (${code}) - 15日内出现过上T`);
      }
      
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeBuy_rsiT analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_rsiT analysis');
      }
    }
  }
  
  // RSI-T卖出策略
  async quantitativeSell_rsiT(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
    buyTime: Date,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const lastPrice = data[data.length - 1].close;
      const buyDateIndex = data.findIndex(item => new Date(item.time).getTime() === buyTime.getTime());
      if (buyDateIndex === -1) {
        this.selfError(`${name} (${code}) - 未找到买入日期`);
      }
      const dataAfterBuy = data.slice(buyDateIndex);
      
      // 1. RSI大于75
      const rsi14 = this.calculateRSI(data);
      if (rsi14 >= this.RSI_T_SELL) {
        console.log(`卖出符合条件：${name} (${code}) - RSI值${rsi14}大于等于${this.RSI_T_SELL}`);
        return {code, name, close: lastPrice};
      }
      
      // 2. 价格低于买入价格的93%
      // if (lastPrice <= buyPrice * this.RSI_T_STOP_LOSS) {
      //   console.log(`卖出符合条件：${name} (${code}) - 当前价格低于买入价格的${this.RSI_T_STOP_LOSS * 100}%`);
      //   return {code, name, close: lastPrice};
      // }
      
      // 3. 价格高于买入价格的115%
      if (lastPrice >= buyPrice * this.RSI_T_TAKE_PROFIT) {
        console.log(`卖出符合条件：${name} (${code}) - 当前价格高于买入价格的${this.RSI_T_TAKE_PROFIT * 100}%`);
        return {code, name, close: lastPrice};
      }
      
      // 4. 买入后出现3个十字星
      // if (this.checkDojiCount(dataAfterBuy) >= this.RSI_T_DOJI_COUNT) {
      //   console.log(`卖出符合条件：${name} (${code}) - 买入后出现${this.RSI_T_DOJI_COUNT}个十字星`);
      //   return {code, name, close: lastPrice};
      // }
      
      // 5. 最近15交易日内出现2个上T
      if (this.checkUpTCount(data.slice(-this.RSI_T_UP_T_DAYS), this.RSI_T_UP_T_DAYS) >= this.RSI_T_UP_T_COUNT) {
        console.log(`卖出符合条件：${name} (${code}) - 最近${this.RSI_T_UP_T_DAYS}交易日内出现${this.RSI_T_UP_T_COUNT}个上T`);
        return {code, name, close: lastPrice};
      }
      
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeSell_rsiT analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_rsiT analysis');
      }
    }
  }
  
  // RSI-Low-T买入策略
  async quantitativeBuy_rsiLowT(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      
      // 0. 检查是否在阴跌
      this.checkFiveDayDeclinePeriods(data, code, name);
      
      // 1. 检查价格是否在底部阶段且时间占比符合要求
      this.checkPriceInBottomStages(data, code, name);
      
      // 2. 当天是下T形态
      if (!this.checkIsDownTShape(data[data.length - 1])) {
        this.selfError(`${name} (${code}) - 当天不是下T形态`);
      }
      
      // 3. 15日内不允许出现上T
      if (this.checkUpTCount(data.slice(-this.RSI_LOW_T_UP_T_DAYS), this.RSI_LOW_T_UP_T_DAYS) >= 1) {
        this.selfError(`${name} (${code}) - ${this.RSI_LOW_T_UP_T_DAYS}日内出现过上T`);
      }
      
      // 4. RSI低于15
      const rsi14 = this.calculateRSI(data, code);
      if (rsi14 > this.RSI_LOW_T_BUY) {
        this.selfError(`${name} (${code}) - RSI值${rsi14}大于${this.RSI_LOW_T_BUY}`);
      }
      
      return {
        code,
        name,
        lastPrice: data[data.length - 1].close,
      };
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeBuy_rsiLowT analysis:', e);
        throw new Error('Unexpected error during quantitativeBuy_rsiLowT analysis');
      }
    }
  }
  
  // RSI-Low-T卖出策略
  async quantitativeSell_rsiLowT(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
  ): Promise<QuantitativeSellResult | undefined> {
    try {
      const lastPrice = data[data.length - 1].close;
      
      // 1. RSI大于75 且当天没有涨停
      const rsi14 = this.calculateRSI(data);
      if (rsi14 >= this.RSI_LOW_T_SELL && !this.checkIsTop(data)) {
        console.log(`卖出符合条件：${name} (${code}) - RSI值${rsi14}大于等于${this.RSI_LOW_T_SELL}, 且当天没有涨停`);
        return {code, name, close: lastPrice};
      }
      
      // 2. 价格高于买入价格的120%
      if (lastPrice >= buyPrice * this.RSI_LOW_T_PROFIT_RATIO) {
        console.log(`卖出符合条件：${name} (${code}) - 当前价格高于买入价格的${this.RSI_LOW_T_PROFIT_RATIO * 100}%`);
        return {code, name, close: lastPrice};
      }
      
      // 3. 最近15交易日内出现2个上T
      // if (this.checkUpTCount(data.slice(-this.RSI_LOW_T_UP_T_DAYS), this.RSI_LOW_T_UP_T_DAYS) >= this.RSI_LOW_T_UP_T_COUNT) {
      //   console.log(`卖出符合条件：${name} (${code}) - 最近${this.RSI_LOW_T_UP_T_DAYS}交易日内出现${this.RSI_LOW_T_UP_T_COUNT}个上T`);
      //   return {code, name, close: lastPrice};
      // }
      
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
      } else {
        console.error('Unexpected error during quantitativeSell_rsiLowT analysis:', e);
        throw new Error('Unexpected error during quantitativeSell_rsiLowT analysis');
      }
    }
  }
}
