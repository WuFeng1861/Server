import {StockData} from '../interfaces/stock-data.interface';
/**
 * Formats raw stock data string into structured array
 * @param dataStr - Raw stock data string
 * @returns Array of formatted stock data
 */

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
 * Fetches all stock quotation data from Baidu Finance API
 * @param code - Stock code
 * @param name - Stock name
 * @param cookie - Authentication cookie
 * @returns Stock market data as string
 */
export async function getStockAllQuotation(
  code: string,
  name: string,
  cookie: string,
): Promise<StockData[]> {
  try {
    const response = await fetch(
      `https://finance.pae.baidu.com/vapi/v1/getquotation?srcid=5353&pointType=string&group=quotation_kline_ab&query=${code}&code=${code}&market_type=ab&newFormat=1&name=${encodeURI(
        name,
      )}&is_kc=0&ktype=day&finClientType=pc&finClientType=pc`,
      {
        headers: {
          accept: 'application/vnd.finance-web.v1+json',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'acs-token':
            '1734786102557_1734832253764_erJiF3PHzGqP7DiEv0VuT2/CsFVQ07z9LNKl9o8XiBeOrq0RCsCXeCsWrmtW+4X7qaYZGRv9WTeEjNjDwpynvfo2eDtpAEjDF+So+1bNAdvQnHBOV2VmXwT8yLyK4iFZiaR1QAWG/gQxWbcooM1Oz5BIbU9kZucFomqXV7EO/SGTU8y9voKsz4PeR+vrHPQzOadProvrxDC/N+Q0lRZQFham3O8+yzEVgZBxWkjrBJ0WJnA1ciWRMhXOxaKqUBVk6aCv52g50fRHK/JkZ9hXqu22ssDwDniUf9eZO3d/RO44oEezTT6aWDHmBBkmom0SFNx3zpwTdRm48DSLYScAaf81MPc8Oxpg/OqOcH92XhVRDa0qpsgBYvzNNNNvLuvsgZd7T1A7LuWvCWR/xCmaW3N4vHghw/0t8XuyQxuSpWqTIDo6V55u3Azkb0mKkDcCzalmZ0etB2JyeL5mY9PTlbvbQ7zSV20s0p//jS+bV5A=',
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
 * @returns Stock market data as string
 */
export async function getStock30DaysQuotation(
  code: string,
  name: string,
  cookie: string,
): Promise<StockData[]> {
  const today = new Date();
  let todayStr = today.toLocaleDateString().replace(/\//g, '-');

  if (today.getHours() > 10) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    todayStr = tomorrow.toLocaleDateString().replace(/\//g, '-');
  }

  try {
    const response = await fetch(
      `https://finance.pae.baidu.com/vapi/v1/getquotation?srcid=5353&pointType=string&group=quotation_kline_ab&query=${code}&code=${code}&market_type=ab&newFormat=1&name=${encodeURI(
        name,
      )}&is_kc=0&ktype=day&finClientType=pc&end_time=${todayStr}&count=30&finClientType=pc`,
      {
        headers: {
          accept: 'application/vnd.finance-web.v1+json',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'acs-token':
            '1734958914343_1734974407635_qXYbCHxPpFDlp2Y3RrQ5INgFYwuUmbaofwPGiLCzEUhUHUb0JrQ0shxPnkxLGzKiNa+IXDxHFu091gvUueiafMdYfxLyPOho35abjJyBzLWrI37P7TE2K1fGhoOHqOYt4GCB9eCF/IAkmURpfQoeQhjOFg5LHHonkmART4YE+ZN+iOYHr+oVujM7tK/7p9Lbp4SRDnZ6oXvRpV6Ww8UfSz92qGq2zpftvyCZLr0zmOeYVqczxLXvlI7k/rtGeG8yUO90d3BC2YgUrYER9vl66BaTHjag4FGSno9WyQFHH57u2gfGLPbsvIpoNdZjc/4fyZs5OiQiiQsSPBdK4PT9J+VfGMlzKmZFyZY9kKyycdZeKZZjzrZjOq+2mU8XTUh3zS9vr2Fycw6/IuVe9bxwWVmTLTfbxwvAIUQMNi88HQrleUVyCUg+E/jA/BXfklyEAV/b7N9tuRBKq9ogVb5nSCK4LS/gkECxYpSKrtvl1V0=',
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
