import {StockData} from '../interfaces/stock-data.interface';
import {MaiRuiToken} from './MaiRuiToken';

interface MaiRuiStockData {
  d: string;  // 交易时间
  o: number;  // 开盘价
  h: number;  // 最高价
  l: number;  // 最低价
  c: number;  // 收盘价
  v: number;  // 成交量
  e: number;
  zf: number;
  hs: number;
  zd: number;
  zde: number;
  ud: string;
}
/**
 * Formats raw stock data string into structured array
 * @param dataStr - Raw stock data string
 * @returns Array of formatted stock data
 */
const tokenReset = '1735563692377_1735634105533_69xQMoXbQMeqyleAPo5Vatj3iFT1VCGap6VKI1zeE3/Rvoqwmv2YmiXcE4C1S2gc2QeObIJU6kZgbrtP1fGoxFAnGZ+TqH03zav53LPiiqDBJrn/ee0ToMoD17M0lrI9VBMENt+vBj/ngDn8EbTqQ1RLkWHdN7jVkGm9p5SNjTs8Aqny98E4oHDLEdimGr+hiv/KHqbj1Py3G/rkaCQIai525CGgAvkICUJ3edy2urYeAzuMXEg/FzKnmW5hMIK/tSyw05Hple1UTUex/gWalLoN71CApDP266ykG+LlQD1XZwxhEFoo6I1cRITORCQ9TWdwN3e70SSxuNCxagux24igX2FJ3aU0xOECmy5Y+LhXPiMS/fR8MZ7UDRcamayodjoD5CeqDBIr7LaHo39oFQ==';

function formatData(dataStr: string): StockData[] {
  if (!dataStr) {
    return [];
  }

  const dataList = dataStr.split(';');
  const list = dataList.map((item) =>
    item.split(',').filter((it) => it !== '--'),
  );

  return list.map((item) => ({
    time: item[1],
    open: Number(item[2]),
    high: Number(item[5]),
    low: Number(item[6]),
    close: Number(item[3]),
    volume: Number(item[4]),
  }));
}

/**
 * Formats MaiRui API response data into standard StockData format
 * @param data - Raw MaiRui API response data
 * @returns Array of formatted stock data
 */
function formatMaiRuiData(data: MaiRuiStockData[]): StockData[] {
  return data.map(item => ({
    time: item.d,
    open: item.o,
    high: item.h,
    low: item.l,
    close: item.c,
    volume: item.v * 100, // Convert from hands (手) to shares
  }));
}

/**
 * Gets the current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * Gets the date N days ago in YYYY-MM-DD format
 */
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Fetches all stock quotation data from Baidu Finance API
 * @param code - Stock code
 * @param name - Stock name
 * @param cookie - Authentication cookie
 * @param token
 * @returns Stock market data as string
 */
export async function getStockAllQuotation(
  code: string,
  name: string,
  cookie: string,
  token: string,
): Promise<StockData[]> {
  console.log(`获取 ${name}(${code}) 的所有日K线数据`);
  try {
    const response = await fetch(
      `https://finance.pae.baidu.com/vapi/v1/getquotation?srcid=5353&pointType=string&group=quotation_kline_ab&query=${code}&code=${code}&market_type=ab&newFormat=1&name=${encodeURI(
        name,
      )}&is_kc=0&ktype=day&finClientType=pc&finClientType=pc`,
      {
        headers: {
          accept: 'application/vnd.finance-web.v1+json',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'acs-token':token || tokenReset,
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          'sec-ch-ua':
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          cookie,
          Referer: 'https://gushitong.baidu.com/',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
        method: 'GET',
      },
    );
    const data = await response.json();
    return formatData(data.Result.newMarketData.marketData);
  } catch (error) {
    console.error('Request failed:', error.message, code, name);
    return [];
  }
}

/**
 * Fetches 30 days of stock quotation data from Baidu Finance API
 * @param code - Stock code
 * @param name - Stock name
 * @param cookie - Authentication cookie
 * @param token
 * @returns Stock market data as string
 */
export async function getStock30DaysQuotation(
  code: string,
  name: string,
  cookie: string,
  token: string,
): Promise<StockData[]> {
  const today = new Date();
  let todayStr = today.toLocaleDateString().replace(/\//g, '-');

  if (today.getHours() > 10) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    todayStr = tomorrow.toLocaleDateString().replace(/\//g, '-');
  }
  console.log(`获取 ${name}(${code}) 的近30日K线数据`);
  try {
    const response = await fetch(
      `https://finance.pae.baidu.com/vapi/v1/getquotation?srcid=5353&pointType=string&group=quotation_kline_ab&query=${code}&code=${code}&market_type=ab&newFormat=1&name=${encodeURI(
        name,
      )}&is_kc=0&ktype=day&finClientType=pc&end_time=${todayStr}&count=30&finClientType=pc`,
      {
        headers: {
          accept: 'application/vnd.finance-web.v1+json',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'acs-token': token || tokenReset,
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          'sec-ch-ua':
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          cookie,
          Referer: 'https://gushitong.baidu.com/',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
        method: 'GET',
      },
    );
    const data = await response.json();
    return formatData(data.Result.newMarketData.marketData);
  } catch (error) {
    console.error('Request failed:', error.message, code, name);
    return [];
  }
}


/**
 * Fetches all stock quotation data from MaiRui API
 * @param code - Stock code
 * @returns Formatted stock data array
 */
export async function getStockAllQuotationMaiRui(
  code: string,
  name: string,
): Promise<StockData[]> {
  console.log(`获取 ${name}(${code}) 的所有日K线数据 (MaiRui API)`);
  let response: Response;
  try {
    const startDate = '2015-10-10';
    const endDate = getCurrentDate();
    const token = MaiRuiToken.getCurrentToken();
    const url = `http://api.mairui.club/hszbc/fsjy/${code}/dn/${startDate}/${endDate}/${token}`;
    // console.log(url, 'MaiRui API url');
    response = await fetch(url, {method: 'GET'});
    if (response.status === 429) {
      console.log('MaiRui API rate limit exceeded, updating token...');
      MaiRuiToken.updateToken();
      return await getStockAllQuotationMaiRui(code, name);
    }
    const data: MaiRuiStockData[] = await response.json();
    return formatMaiRuiData(data);
  } catch (error) {
    console.error('MaiRui Request failed:', error.message, code, response?.status);
    return [];
  }
}

/**
 * Fetches 30 days of stock quotation data from MaiRui API
 * @param code - Stock code
 * @returns Formatted stock data array
 */
export async function getStock30DaysQuotationMaiRui(
  code: string,
  name: string,
): Promise<StockData[]> {
  console.log(`获取 ${name}(${code}) 的近30日K线数据 (MaiRui API)`);
  let response: Response;
  try {
    const startDate = getDateDaysAgo(30);
    const endDate = getCurrentDate();
    const token = MaiRuiToken.getCurrentToken();
    const url = `http://api.mairui.club/hszbc/fsjy/${code}/dn/${startDate}/${endDate}/${token}`;
    // console.log(url, 'MaiRui API url');
    response = await fetch(url, {method: 'GET'});
    if (response.status === 429) {
      console.log('MaiRui API rate limit exceeded, updating token...');
      MaiRuiToken.updateToken();
      return await getStock30DaysQuotationMaiRui(code, name);
    }
    const data: MaiRuiStockData[] = await response.json();
    return formatMaiRuiData(data);
  } catch (error) {
    console.error('MaiRui Request failed:', error.message, code, response?.status);
    return [];
  }
}
