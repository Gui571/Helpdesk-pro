import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards, NotFoundException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import bcrypt from 'bcryptjs';
import { AuthGuard, AuthRequest, publicUser } from './auth';
import { DatabaseService } from './database';
import { Prisma, Role } from './generated/prisma/client';
import { strongPassword, verifyOrigin } from './security';
import { NormalizeEmail, Trim } from './validation';

const userSummary = { ...publicUser, active: true, createdAt: true } as const;

class CreateUserDto {
  @ApiProperty()
  @Trim() @IsString() @Length(2, 100) name!: string;
  @ApiProperty()
  @NormalizeEmail() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ format: "password" })
  @IsString() @Length(12, 72) password!: string;
  @ApiProperty({ enum: [Role.EMPLOYEE, Role.TECHNICIAN] })
  @IsIn([Role.EMPLOYEE, Role.TECHNICIAN]) role!: 'EMPLOYEE' | 'TECHNICIAN';
}

class UserQuery {
  @ApiPropertyOptional()
  @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}

class UserStatusDto {
  @ApiProperty()
  @IsBoolean() active!: boolean;
}

@ApiTags('Usuários')
@ApiCookieAuth()
@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly db: DatabaseService) {}

  private admin(req: AuthRequest) {
    if (req.user.role !== Role.ADMIN) throw new ForbiddenException();
  }

  @Get()
  async list(@Query() query: UserQuery, @Req() req: AuthRequest) {
    this.admin(req);
    const where: Prisma.UserWhereInput = query.search ? {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {};
    const pageSize = 20;
    const [users, total] = await this.db.$transaction([
      this.db.user.findMany({
        where, select: userSummary, orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: pageSize, skip: (query.page - 1) * pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { users, total, pageSize };
  }

  @Get('technicians')
  async technicians(@Req() req: AuthRequest) {
    this.admin(req);
    return this.db.user.findMany({
      where: { role: { in: [Role.TECHNICIAN, Role.ADMIN] }, active: true },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  @Post()
  async create(@Body() data: CreateUserDto, @Req() req: AuthRequest) {
    this.admin(req);
    verifyOrigin(req.headers.origin);
    if (!strongPassword(data.password)) throw new BadRequestException('A senha precisa ter pelo menos 12 caracteres e até 72 bytes.');
    const { name, email, role } = data;
    try {
      return await this.db.user.create({
        data: { name, email, role, passwordHash: await bcrypt.hash(data.password, 12) },
        select: userSummary,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      throw error;
    }
  }

  @Patch(':id/active')
  async setActive(@Param('id', ParseUUIDPipe) id: string, @Body() data: UserStatusDto, @Req() req: AuthRequest) {
    this.admin(req);
    verifyOrigin(req.headers.origin);
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { role: true } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (user.role === Role.ADMIN) throw new ForbiddenException('A conta de administração não pode ser desativada.');
      const updated = await tx.user.update({ where: { id }, data: { active: data.active }, select: userSummary });
      if (!data.active) await tx.session.deleteMany({ where: { userId: id } });
      return updated;
    });
  }
}
