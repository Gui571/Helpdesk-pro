import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get,
  Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { AuthGuard, AuthRequest, SafeUser } from './auth';
import { DatabaseService } from './database';
import { Prisma, Priority, Role, TicketStatus } from './generated/prisma/client';
import { canAssign, canWorkOn, slaDeadline, ticketScope, transitionOptions } from './policy';
import { verifyOrigin } from './security';
import { Trim } from './validation';

class CreateTicketDto {
  @ApiProperty()
  @Trim() @IsString() @Length(5, 120) title!: string;
  @ApiProperty()
  @Trim() @IsString() @Length(10, 5000) description!: string;
  @ApiProperty({ format: "uuid" })
  @IsUUID() categoryId!: string;
  @ApiPropertyOptional({ enum: Priority })
  @IsOptional() @IsEnum(Priority) priority?: Priority;
}

class TicketQuery {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @ApiPropertyOptional({ enum: Priority })
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional()
  @IsOptional() @Trim() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}

class ChangeStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus) status!: TicketStatus;
  @ApiPropertyOptional()
  @IsOptional() @Trim() @IsString() @Length(10, 4000) resolution?: string;
}

class AssignDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true })
  @ValidateIf((_, value) => value !== null) @IsUUID() assigneeId!: string | null;
}

class PriorityDto {
  @ApiProperty({ enum: Priority })
  @IsEnum(Priority) priority!: Priority;
}

class CommentDto {
  @ApiProperty()
  @Trim() @IsString() @Length(1, 2000) content!: string;
}

const person = { select: { id: true, name: true } } as const;
const ticketInclude = { category: true, requester: person, assignee: person } as const;
const pending: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];
const pageSize = 15;

@Injectable()
export class TicketService {
  constructor(private readonly db: DatabaseService) {}

  async list(query: TicketQuery, user: SafeUser) {
    const { page, search, status, priority, categoryId } = query;
    const where: Prisma.TicketWhereInput = {
      ...ticketScope(user), status, priority, categoryId,
      ...(search && { AND: [{ OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ] }] }),
    };
    const [tickets, total] = await this.db.$transaction([
      this.db.ticket.findMany({
        where, include: ticketInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize, skip: (page - 1) * pageSize,
      }),
      this.db.ticket.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { tickets, total, page, pageSize };
  }

  async overview(user: SafeUser) {
    const scope = ticketScope(user);
    const byStatus = this.db.ticket.groupBy({
      by: ['status'], where: scope, orderBy: { status: 'asc' }, _count: { _all: true },
    });
    const byPriority = this.db.ticket.groupBy({
      by: ['priority'], where: scope, orderBy: { priority: 'asc' }, _count: { _all: true },
    });
    const overdueCount = this.db.ticket.count({
      where: { ...scope, status: { in: pending }, dueAt: { lt: new Date() } },
    });
    const [grouped, priorities, overdue] = await this.db.$transaction(
      [byStatus, byPriority, overdueCount], { isolationLevel: 'RepeatableRead' },
    );
    return {
      total: grouped.reduce((sum, item) => sum + item._count._all, 0),
      byStatus: Object.fromEntries(grouped.map((item) => [item.status, item._count._all])),
      byPriority: Object.fromEntries(priorities.map((item) => [item.priority, item._count._all])),
      overdue,
    };
  }

  async detail(id: string, user: SafeUser) {
    const ticket = await this.db.ticket.findFirst({
      where: { id, ...ticketScope(user) },
      include: {
        ...ticketInclude,
        comments: { include: { author: person }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 },
        history: { include: { actor: person }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 },
      },
    });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    return {
      ...ticket,
      actions: {
        statuses: transitionOptions(user, ticket),
        assign: canAssign(user, ticket, user.id),
        setPriority: canWorkOn(user, ticket) && pending.includes(ticket.status),
        comment: ticket.status !== 'CLOSED',
      },
    };
  }

  async create(data: CreateTicketDto, user: SafeUser) {
    const priority = data.priority ?? Priority.MEDIUM;
    if (user.role === Role.EMPLOYEE && priority === Priority.CRITICAL) {
      throw new ForbiddenException('A equipe de TI pode definir a prioridade crítica.');
    }
    const category = await this.db.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new BadRequestException('Categoria não encontrada.');
    const createdAt = new Date();
    return this.db.ticket.create({
      data: {
        ...data, priority, createdAt, dueAt: slaDeadline(createdAt, priority),
        requesterId: user.id,
        history: { create: { actorId: user.id, action: 'CREATED' } },
      },
    });
  }

  private async mutate(
    id: string,
    user: SafeUser,
    operation: (tx: Prisma.TransactionClient, ticket: Awaited<ReturnType<TicketService['lockedTicket']>>) => Promise<void>,
  ) {
    await this.db.$transaction(async (tx) => {
      const ticket = await this.lockedTicket(tx, id, user);
      await operation(tx, ticket);
    });
    return { success: true };
  }

  private async lockedTicket(tx: Prisma.TransactionClient, id: string, user: SafeUser) {
    const ticket = await tx.ticket.findFirst({ where: { id, ...ticketScope(user) } });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    const result = await tx.ticket.updateMany({
      where: { id, version: ticket.version },
      data: { version: { increment: 1 } },
    });
    if (!result.count) throw new ConflictException('O chamado foi atualizado. Recarregue e tente novamente.');
    return ticket;
  }

  status(id: string, data: ChangeStatusDto, user: SafeUser) {
    return this.mutate(id, user, async (tx, ticket) => {
      if (!transitionOptions(user, ticket).includes(data.status)) {
        throw new ForbiddenException('Esta transição não está disponível para o seu perfil ou para o status atual.');
      }
      const resolving = data.status === 'RESOLVED';
      if (resolving && !data.resolution) throw new BadRequestException('Descreva a solução em pelo menos 10 caracteres.');
      const reopening = ticket.status === 'RESOLVED' && data.status !== 'CLOSED';
      const returning = ticket.status === 'IN_PROGRESS' && data.status === 'OPEN';
      const detail = `${ticket.status} → ${data.status}`;
      const events = [{
        actorId: user.id,
        action: 'STATUS_CHANGED',
        detail: resolving ? `${detail} · ${data.resolution}` : detail,
      }];
      if (returning && ticket.assigneeId) {
        events.push({ actorId: user.id, action: 'ASSIGNEE_CHANGED', detail: 'Sem responsável' });
      }
      await tx.ticket.update({
        where: { id },
        data: {
          status: data.status,
          ...(resolving ? { resolution: data.resolution, resolvedAt: new Date() } : {}),
          ...(reopening ? { resolution: null, resolvedAt: null } : {}),
          ...(returning ? { assigneeId: null } : {}),
          history: { create: events },
        },
      });
    });
  }

  assign(id: string, targetId: string | null, user: SafeUser) {
    return this.mutate(id, user, async (tx, ticket) => {
      if (!canAssign(user, ticket, targetId)) throw new ForbiddenException('Atribuição não permitida.');
      if (targetId === ticket.assigneeId) return;
      const target = targetId && await tx.user.findFirst({
        where: { id: targetId, active: true, role: { in: [Role.ADMIN, Role.TECHNICIAN] } },
        select: { name: true },
      });
      if (targetId && !target) throw new BadRequestException('Selecione um integrante ativo da equipe de TI.');
      await tx.ticket.update({
        where: { id },
        data: {
          assigneeId: targetId,
          history: { create: { actorId: user.id, action: 'ASSIGNEE_CHANGED', detail: target ? target.name : 'Sem responsável' } },
        },
      });
    });
  }

  priority(id: string, priority: Priority, user: SafeUser) {
    return this.mutate(id, user, async (tx, ticket) => {
      if (!canWorkOn(user, ticket) || !pending.includes(ticket.status)) throw new ForbiddenException();
      if (priority === ticket.priority) return;
      await tx.ticket.update({
        where: { id },
        data: {
          priority, dueAt: slaDeadline(ticket.createdAt, priority),
          history: { create: { actorId: user.id, action: 'PRIORITY_CHANGED', detail: `${ticket.priority} → ${priority}` } },
        },
      });
    });
  }

  comment(id: string, content: string, user: SafeUser) {
    return this.mutate(id, user, async (tx, ticket) => {
      if (ticket.status === 'CLOSED') throw new ConflictException('O chamado está fechado.');
      await tx.comment.create({ data: { ticketId: id, authorId: user.id, content } });
    });
  }
}

@ApiTags('Chamados')
@ApiCookieAuth()
@Controller('tickets')
@UseGuards(AuthGuard)
export class TicketController {
  constructor(private readonly service: TicketService) {}

  @Get()
  list(@Query() query: TicketQuery, @Req() req: AuthRequest) {
    return this.service.list(query, req.user);
  }

  @Get('overview')
  overview(@Req() req: AuthRequest) {
    return this.service.overview(req.user);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.detail(id, req.user);
  }

  @Post()
  create(@Body() data: CreateTicketDto, @Req() req: AuthRequest) {
    verifyOrigin(req.headers.origin);
    return this.service.create(data, req.user);
  }

  @Patch(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() data: ChangeStatusDto, @Req() req: AuthRequest) {
    verifyOrigin(req.headers.origin);
    return this.service.status(id, data, req.user);
  }

  @Patch(':id/assignee')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() data: AssignDto, @Req() req: AuthRequest) {
    verifyOrigin(req.headers.origin);
    return this.service.assign(id, data.assigneeId, req.user);
  }

  @Patch(':id/priority')
  priority(@Param('id', ParseUUIDPipe) id: string, @Body() data: PriorityDto, @Req() req: AuthRequest) {
    verifyOrigin(req.headers.origin);
    return this.service.priority(id, data.priority, req.user);
  }

  @Post(':id/comments')
  comment(@Param('id', ParseUUIDPipe) id: string, @Body() data: CommentDto, @Req() req: AuthRequest) {
    verifyOrigin(req.headers.origin);
    return this.service.comment(id, data.content, req.user);
  }
}

@ApiTags('Categorias')
@ApiCookieAuth()
@Controller('categories')
@UseGuards(AuthGuard)
export class CategoryController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  list() {
    return this.db.category.findMany({ orderBy: { name: 'asc' } });
  }
}
