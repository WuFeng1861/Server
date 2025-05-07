import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Global response transformer
  app.useGlobalInterceptors(new TransformInterceptor());
  
  app.enableCors({
    origin: true, // Allow all origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  await app.listen(process.env.PORT || 3000);
  console.log('程序已启动，监听端口 3000: http://localhost:3000');
}
bootstrap();
