import { Injectable } from "@nestjs/common";
import { CacheService } from "./cache.service";
import { StockExtremeGrowthDate } from "../entities/stock-extreme-growth-date.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PriceRange } from "../entities/price-range.entity";
import {QuantitativeBuyResult, QuantitativeSellResult} from '../interfaces/public-interface';
import {StockData} from '../interfaces/stock-data.interface';
import {dateToDayString} from '../utils/tools';

interface StockMonthMinMax {
  minPrice: number;
  maxPrice: number;
}

@Injectable()
export class StockAnalysisService {
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
  private readonly SHORT_BUY_PRICE_LOW_PERCENT = 0.7; // 短线买入价格与最高价的比例
  private readonly SHORT_BUY_TIME_RANGE = 20 * 24 * 60 * 60 * 1000; // 短线价格倍数变化的指定时间范围
  private readonly SHORT_SELL_PRICE_MIN_GAP_PERCENT = 2; // 短线流短期内价格变化最小倍数
  private readonly DO_JI_RANGE = 0.01; // 十字星开盘价和收盘价的差距

  constructor(
    private cacheService: CacheService,
    @InjectRepository(StockExtremeGrowthDate)
    private stockExtremeGrowthRepository: Repository<StockExtremeGrowthDate>,
    @InjectRepository(PriceRange)
    private priceRangeRepository: Repository<PriceRange>,
  ) {}

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
          { where: { stock_code: stockCode }, order: { date: "ASC" } },
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
        where: { id: cacheKey },
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
      const [yearNum, monthNum] = item.time.split("-");
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
      const month = item.time.split("-").slice(0, 2).join("-");
      if (!monthlyData[month]) {
        monthlyData[month] = [];
      }
      monthlyData[month].push(item);
    });

    const monthlyGrowthOverList: string[] = [];
    for (const [month, monthlyItems] of Object.entries(monthlyData)) {
      const maxPrice = Math.max(...monthlyItems.map((item) => item.high));
      const minPrice = Math.min(...monthlyItems.map((item) => item.low));
      const [yearNum, monthNum] = month.split("-");
      const [lastYearNum, lastMonthNum] =
        useData[useData.length - 1].time.split("-");
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
          where: { stock_code: code, date },
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
  ): void
  {
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
  ): {maxPrice: number, minPrice: number} {
    const useData = data
      .filter((item) =>
          new Date(item.time).getTime() >= new Date(data[data.length - 1].time).getTime() - rangeDays * this.ONE_DAY_TIME,
      );
    const minPrice = Math.min(...useData.map((item) => item.low));
    const maxPrice = Math.max(...useData.map((item) => item.high));

    if (maxPrice / minPrice <= multiple) {
      this.selfError(
        `${name} (${code}) - 最近${rangeDays}天最高价和最低价的差距不超过${multiple}倍`,
      );
    }
    return {maxPrice, minPrice};
  }
  
  private checkPriceNow(
    data: StockData[],
    code: string,
    name: string,
    priceTarget: number,
    compareType: "less" | "greater" = "less",
  ): void {
    const useData = data[data.length - 1];
    if (useData.close < priceTarget && compareType === "greater") {
      this.selfError(`${name} (${code}) - 当前价格低于目标价格`);
    }
    if (useData.close > priceTarget && compareType === "less") {
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
  
  private checkHasDayUp(data: StockData[], code: string, name: string, startDay: number|Date|null = null): void {
    let useData = data;
    if(startDay) {
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
    if (Math.abs(data.open - data.close) > this.DO_JI_RANGE * data.open) {
      return false;
    }
    return true;
  }
  
  async quantitativeBuyWithType(type: number, stockData: StockData[], code: string, name: string): Promise<QuantitativeBuyResult | undefined> {
    // 1: 简单回测策略
    if(type === 1) {
      return await this.quantitativeBuy(stockData, code, name);
    }
    // 2. 妖股反弹策略
    if(type === 2) {
      return await this.quantitativeBuy_shorttime(stockData, code, name);
    }
  }
  
  async quantitativeSellWithType(type: number, stockData: StockData[], code: string, name: string, buyPrice: number, buyTime: string): Promise<QuantitativeSellResult | undefined> {
    if(type === 1) {
      return await this.quantitativeSell(stockData, code, name, buyPrice);
    }
    if(type === 2) {
      return await this.quantitativeSell_shorttime(stockData, code, name, buyPrice, new Date(buyTime));
    }
  }

  async quantitativeBuy (
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
        console.error("Unexpected error during quantitative buy analysis:", e);
        throw new Error("Unexpected error during quantitative buy analysis");
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
      const { close, volume, open } = data[data.length - 1];

      const isVolume150Percent = volume > 1.5 * averageVolumeLast5Days;
      const isVolume400Percent = volume > 4 * averageVolumeLast5Days;
      const isBelow85PercentTarget = close < buyPrice * 0.93;
      const isPriceDown = close < open;
      const isPriceUp = close > open;

      if (isPriceDown && isVolume150Percent) {
        console.log(
          code,
          name,
          "条件1满足：今天价格下跌且交易量大于过去5日平均成交量150%",
        );
        return { code, name, close };
      } else if (isPriceUp && isVolume400Percent) {
        console.log(
          code,
          name,
          "条件2满足：今天价格上涨且成交量大于过去5日平均成交量400%",
        );
        return { code, name, close };
      } else if (isBelow85PercentTarget) {
        console.log(code, name, "条件3满足：今天的收盘价低于目标价格的93%");
        return { code, name, close };
      }
    } catch (e) {
      if ((e as any).errorSelfType === true) {
        // Silently handle expected errors
        // console.log(`${name} (${code}) - ${e.message}`);
      } else {
        console.error("Unexpected error during quantitativeSell analysis:", e);
        throw new Error("Unexpected error during quantitativeSell analysis");
      }
    }
  }
  
  async quantitativeBuy_shorttime(
    data: StockData[],
    code: string,
    name: string,
  ): Promise<QuantitativeBuyResult | undefined> {
    try {
      const { maxPrice } = this.checkPriceRange(data, code, name, this.SHORT_SELL_PRICE_MIN_GAP_PERCENT, this.SHORT_BUY_TIME_RANGE);
      this.checkPriceNow(data, code, name, maxPrice * this.SHORT_BUY_PRICE_LOW_PERCENT, "less");
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
        console.error("Unexpected error during quantitativeBuy_shorttime analysis:", e);
        throw new Error("Unexpected error during quantitativeBuy_shorttime analysis");
      }
    }
  }
  
  async quantitativeSell_shorttime(
    data: StockData[],
    code: string,
    name: string,
    buyPrice: number,
    buyTime: number|Date,
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
        console.error("Unexpected error during quantitativeSell_shorttime analysis:", e);
        throw new Error("Unexpected error during quantitativeSell_shorttime analysis");
      }
    }
  }
  
  
}
