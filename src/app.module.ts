import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {PriceRange} from './entities/price-range.entity';
import {StockExtremeGrowthDate} from './entities/stock-extreme-growth-date.entity';
import {StockRecommend} from './entities/stock-recommend.entity';
import {SomeKey} from './entities/some-key.entity';
import {Stock} from './entities/stock.entity';
import {AllStocks} from './entities/all-stocks.entity';
import {CacheService} from './services/cache.service';
import {StockAnalysisService} from './services/stock-anlysis.service';
import {StockBackTestService} from './services/stock-back-test.service';
import {MockStockHoldingService} from './services/mock-stock-holding.service';
import {MockStockHolding} from './entities/mock-stock-holding.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '666666',
      database: 'stock_quantitative',
      entities: [
        PriceRange,
        StockExtremeGrowthDate,
        StockRecommend,
        Stock,
        SomeKey,
        AllStocks,
        MockStockHolding,
      ],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([
      PriceRange,
      StockExtremeGrowthDate,
      StockRecommend,
      Stock,
      SomeKey,
      AllStocks,
      MockStockHolding,
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, CacheService, StockAnalysisService, StockBackTestService, MockStockHoldingService],
})
export class AppModule {
}