import 'reflect-metadata';
import 'dotenv/config';
import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { DatabaseService } from './database';
import { AuthController, AuthGuard, LoginThrottle } from './auth';
import { CategoryController, TicketController, TicketService } from './tickets';
import { UserController } from './users';
import { COOKIE_NAME } from './security';

@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  controllers: [AuthController, TicketController, CategoryController, UserController, HealthController],
  providers: [DatabaseService, AuthGuard, LoginThrottle, TicketService],
})
class AppModule {}

async function bootstrap() {
  const production = process.env.NODE_ENV === 'production';
  if (production && (process.env.SESSION_COOKIE_SECURE !== 'true' || !process.env.WEB_ORIGIN?.startsWith('https://'))) {
    throw new Error('Em produção, configure HTTPS em WEB_ORIGIN e SESSION_COOKIE_SECURE=true.');
  }
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (!production) {
    const options = new DocumentBuilder()
      .setTitle('HelpDesk Pro API')
      .setDescription('A API usa o cookie criado no login. Envie o Origin configurado nas requisições de escrita.')
      .setVersion('1.0')
      .addCookieAuth(COOKIE_NAME)
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, options));
  }

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000), process.env.API_HOST || '127.0.0.1');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
