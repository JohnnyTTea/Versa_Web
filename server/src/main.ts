import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import session from 'express-session';
import { json, type NextFunction, type Request, type Response } from 'express';

async function bootstrap() {
  // Load .env for start:prod (node dist/main)
  dotenv.config();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
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

  const fitmentUpload = json({ limit: '2mb' });
  app.use('/api/report/data/analyze', (req: Request, res: Response, next: NextFunction) => {
    fitmentUpload(req, res, next);
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, process.env.VERSA_BIND_HOST || '0.0.0.0');
}
bootstrap();
