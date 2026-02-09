import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import session from 'express-session';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://192.168.16.31',
      'http://192.168.16.31:5173',
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
        sameSite: 'lax',
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();
