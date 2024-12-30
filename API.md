# 股票分析系统API文档

## 基础URL
`http://localhost:3000`

## 响应格式
所有接口返回的数据格式如下：
```json
{
  "code": number,    // HTTP状态码
  "message": string, // 成功或错误信息
  "data": any,      // 响应数据
  "timestamp": number // 时间戳
}
```

## 接口列表

### 获取推荐股票
获取基于分析系统推荐的股票列表。

- **接口**: `/recommendStocks`
- **方法**: `GET`
- **返回数据**:
```typescript
{
  id: number;        // 记录ID
  code: string;      // 股票代码
  name: string;      // 股票名称
  lastPrice: number; // 最新价格
  date: string;      // 推荐日期
}[]
```

### 开始股票推荐分析
启动股票推荐分析流程。

- **接口**: `/startStockRecommend`
- **方法**: `GET`
- **查询参数**:
  - `update` (可选): 是否更新股票数据
  - `recommendType` (可选): 推荐类型（默认: 1）
- **返回**: 分析启动状态的文本信息

### 启动回测
启动交易策略回测。

- **接口**: `/startBackTest`
- **方法**: `GET`
- **查询参数**:
  - `startDate`: 回测开始日期（必填）
  - `backTestType` (可选): 回测策略类型（默认: 1）
- **返回**: 回测启动状态的文本信息

### 获取模拟持仓
获取特定测试轮次的模拟持仓记录。

- **接口**: `/getMockStockHolding`
- **方法**: `GET`
- **查询参数**:
  - `times`: 测试轮次号（必填）
- **返回数据**:
```typescript
{
  id: number;         // 记录ID
  stockId: string;    // 股票代码
  stockName: string;  // 股票名称
  buyPrice: number;   // 买入价格
  amount: number;     // 持仓数量
  buyDate: Date;      // 买入日期
  sellDate?: Date;    // 卖出日期
  sellPrice?: number; // 卖出价格
  profit?: number;    // 盈亏金额
  profitRate?: number;// 盈亏比例
  fee?: number;       // 交易费用
  times: number;      // 测试轮次
}[]
```

### 获取任务状态
获取当前运行任务的状态。

- **接口**: `/taskStatus`
- **方法**: `GET`
- **返回**: 当前任务状态的文本描述

### 获取回测次数
获取已执行的回测总次数。

- **接口**: `/getBackTestTimes`
- **方法**: `GET`
- **返回**: 回测总次数（数字）

### 设置Cookie
设置API请求认证所需的Cookie。

- **接口**: `/setCookie`
- **方法**: `POST`
- **请求体**:
```typescript
{
  cookie: string; // 认证Cookie
}
```
- **返回**: 成功状态响应

### 获取回测策略类型
获取可用的回测策略列表。

- **接口**: `/getBackTestTypes`
- **方法**: `GET`
- **返回**: 策略名称数组
```typescript
string[] // 例如：["成交量策略", "妖股回弹策略"]
```

### 获取回测结果列表
获取所有回测结果记录。

- **接口**: `/getBacktestResults`
- **方法**: `GET`
- **返回数据**:
```typescript
{
  ID: number;           // 记录ID
  StrategyTypeID: number; // 策略类型ID
  BacktestStartDate: Date; // 回测开始时间
  BacktestEndDate: Date;   // 回测结束时间
  TransactionCount: number; // 交易次数
  TotalProfit: number;     // 总盈利
  BacktestTimes: number;   // 回测次数
}[]
```

## 错误处理
- 所有接口都返回适当的HTTP状态码
- 错误响应包含标准格式的详细错误信息
- 常见错误码：
  - 401: 未授权（如：缺少Cookie）
  - 400: 请求参数错误
  - 500: 服务器内部错误
