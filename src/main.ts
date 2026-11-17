import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(AppConfigService, { strict: false });

  configureApp(app);

  const port = configService.port || 3000;

  await app.listen(port, '0.0.0.0');
  console.log(
    `Healthy MVP Backend is running on: http://localhost:${port}/api/v1`,
  );
}
bootstrap();
