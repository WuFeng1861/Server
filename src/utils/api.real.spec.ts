import { getStockAllQuotationMaiRui, getStock30DaysQuotationMaiRui } from './api';

describe('Real Stock API Tests', () => {
  // 设置较长的超时时间，因为实际API调用可能需要更多时间
  jest.setTimeout(30*1000);
  
  describe('MaiRui API Real Tests', () => {
    // 测试获取平安银行的所有行情数据
    it('should fetch all quotation data for Ping An Bank', async () => {
      const result = await getStockAllQuotationMaiRui('000001', '平安银行');

      // 验证返回数据结构
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // 验证第一条数据的格式
      const firstData = result[0];
      expect(firstData).toHaveProperty('time');
      expect(firstData).toHaveProperty('open');
      expect(firstData).toHaveProperty('high');
      expect(firstData).toHaveProperty('low');
      expect(firstData).toHaveProperty('close');
      expect(firstData).toHaveProperty('volume');

      // 验证数据类型
      expect(typeof firstData.time).toBe('string');
      expect(typeof firstData.open).toBe('number');
      expect(typeof firstData.high).toBe('number');
      expect(typeof firstData.low).toBe('number');
      expect(typeof firstData.close).toBe('number');
      expect(typeof firstData.volume).toBe('number');

      // 验证数据有效性
      expect(firstData.high).toBeGreaterThanOrEqual(firstData.low);
      expect(firstData.volume).toBeGreaterThan(0);

      console.log('First data point: all quotation', firstData);
    });
    
    // 测试获取平安银行的30天行情数据
    it('should fetch 30 days quotation data for Ping An Bank', async () => {
      const result = await getStock30DaysQuotationMaiRui('000001', '平安银行');
      
      // 验证返回数据结构
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(30);
      
      // 验证最新的数据
      const latestData = result[result.length - 1];
      expect(latestData).toHaveProperty('time');
      expect(latestData).toHaveProperty('open');
      expect(latestData).toHaveProperty('high');
      expect(latestData).toHaveProperty('low');
      expect(latestData).toHaveProperty('close');
      expect(latestData).toHaveProperty('volume');
      
      console.log('Latest 30-day data point: 30 days quotation', latestData);
    });
    
    // 测试获取贵州茅台的数据
    it('should fetch data for Guizhou Maotai', async () => {
      const result = await getStock30DaysQuotationMaiRui('600519', '贵州茅台');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const latestData = result[result.length - 1];
      console.log('Maotai latest data:', latestData);

      // 验证茅台股票的价格范围（应该在1000以上）
      expect(latestData.close).toBeGreaterThan(1000);
    });
    
    // 测试错误处理
    // it('should handle invalid stock code gracefully', async () => {
    //   const result = await getStockAllQuotationMaiRui('999999', '测试股票');
    //   expect(Array.isArray(result)).toBe(true);
    //   expect(result.length).toBe(0);
    // });
  });
});
