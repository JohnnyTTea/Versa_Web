import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import session from 'express-session';

async function bootstrap() {
  // Load .env for start:prod (node dist/main)
  dotenv.config();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://192.168.16.31',
      'http://192.168.16.31:5173',
      'http://192.168.16.130',
      'http://192.168.16.130:5173',
    ],
    credentials: true,
  });

  app.use(
    session({
      secret: 'versa_secret_change_me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // 开发环境走同源代理时用 lax，避免 SameSite=None + 非 HTTPS 被浏览器拒绝
        sameSite: 'lax',
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();
