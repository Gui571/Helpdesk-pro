import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, HttpException,
  Injectable, Post, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { NormalizeEmail } from './validation';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { DatabaseService } from './database';
import { COOKIE_NAME, SESSION_MS, cookieOptions, generateSessionToken, hashToken, verifyOrigin } from './security';
import { Role } from './generated/prisma/client';

export type SafeUser = { id: string; name: string; email: string; role: Role };
export type AuthRequest = Request & { user: SafeUser };

export const publicUser = { id: true, name: true, email: true, role: true } as const;

export class LoginDto {
  @ApiProperty({ example: "admin@demo.local" })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: "password" })
  @IsString()
  @Length(1, 72)
  password!: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException();
    }
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { ...publicUser, active: true } } },
    });
    if (!session?.user.active || session.expiresAt <= new Date()) throw new UnauthorizedException();
    const { id, name, email, role } = session.user;
    req.user = { id, name, email, role };
    return true;
  }
}

const WINDOW_MS = 15 * 60_000;
const LIMIT = 15;

@Injectable()
export class LoginThrottle {
  private readonly attempts = new Map<string, { count: number; until: number }>();

  consume(key: string) {
    const now = Date.now();
    let entry = this.attempts.get(key);
    if (!entry || entry.until <= now) {
      if (this.attempts.size >= 10_000) {
        for (const [id, value] of this.attempts) {
          if (value.until <= now) this.attempts.delete(id);
        }
        if (this.attempts.size >= 10_000) throw new HttpException('Tente novamente em instantes.', 429);
      }
      entry = { count: 0, until: now + WINDOW_MS };
      this.attempts.set(key, entry);
    }
    if (entry.count >= LIMIT) throw new HttpException('Muitas tentativas. Tente mais tarde.', 429);
    entry.count++;
  }
}

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly db: DatabaseService, private readonly throttle: LoginThrottle) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() data: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    verifyOrigin(req.headers.origin);
    this.throttle.consume(req.ip || req.socket.remoteAddress || 'unknown');
    const user = await this.db.user.findUnique({ where: { email: data.email } });
    const fallbackHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.OFrLwm1KVLZ7X2mQl7x6cHUqQJ0yBse';
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? fallbackHash);
    if (!user?.active || !valid || Buffer.byteLength(data.password, 'utf8') > 72) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const existing: unknown = req.cookies?.[COOKIE_NAME];
    const token = generateSessionToken();
    await this.db.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ active: boolean }[]>`
        SELECT "active" FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE
      `;
      if (!current?.active) throw new UnauthorizedException('E-mail ou senha inválidos.');
      if (typeof existing === 'string') {
        await tx.session.deleteMany({ where: { tokenHash: hashToken(existing) } });
      }
      await tx.session.create({
        data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_MS) },
      });
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS });
    const { id, name, email, role } = user;
    return { user: { id, name, email, role } };
  }

  @Get('me')
  @ApiCookieAuth()
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest) {
    return { user: req.user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    verifyOrigin(req.headers.origin);
    const token: unknown = req.cookies?.[COOKIE_NAME];
    if (typeof token === 'string') await this.db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(COOKIE_NAME, cookieOptions());
  }
}
