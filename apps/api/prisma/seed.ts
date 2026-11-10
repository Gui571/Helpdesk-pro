import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Role, Priority, TicketStatus } from '../src/generated/prisma/client';
import { slaDeadline } from '../src/policy';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const url = process.env.DATABASE_URL;
  const demo = process.env.SEED_DEMO_DATA === 'true';

  if (!email || !url || !password || password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72 || password === 'CHANGE_THIS_STRONG_PASSWORD') {
    throw new Error('Preencha DATABASE_URL, SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (12 caracteres a 72 bytes).');
  }
  if (demo && process.env.NODE_ENV === 'production') {
    throw new Error('Dados de demonstração só podem ser criados fora de produção.');
  }
  if (demo && [ 'tecnico@demo.local', 'solicitante@demo.local' ].includes(email)) {
    throw new Error('Use um e-mail de administrador diferente dos e-mails de demonstração.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      async function account(address: string, name: string, role: Role) {
        const user = await tx.user.upsert({
          where: { email: address }, update: {},
          create: { email: address, name, role, passwordHash },
        });
        if (user.role !== role) throw new Error(`O perfil da conta ${address} é incompatível com o seed.`);
        return user;
      }

      const admin = await account(email, 'Administração de TI', 'ADMIN');
      const categories = [];
      for (const name of ['Hardware', 'Software', 'Redes', 'Acessos']) {
        categories.push(await tx.category.upsert({ where: { name }, create: { name }, update: {} }));
      }
      if (!demo) return;

      const technician = await account('tecnico@demo.local', 'Lucas Ribeiro', 'TECHNICIAN');
      const requester = await account('solicitante@demo.local', 'Camila Santos', 'EMPLOYEE');
      const examples: Array<{
        title: string; description: string; category: number; status: TicketStatus;
        priority: Priority; hours: number; resolution?: string;
      }> = [
        { title: 'Impressora do financeiro sem conexão', description: 'A impressora aparece como offline em todas as estações do financeiro.', category: 0, status: 'OPEN', priority: 'HIGH', hours: 16 },
        { title: 'Oscilação no Wi-Fi da sala de reuniões', description: 'A conexão cai durante chamadas de vídeo na sala principal.', category: 2, status: 'IN_PROGRESS', priority: 'MEDIUM', hours: 6 },
        { title: 'Acesso à pasta compartilhada', description: 'Preciso consultar a pasta de modelos de documentos do setor.', category: 3, status: 'RESOLVED', priority: 'MEDIUM', hours: 10, resolution: 'O acesso ao grupo de leitura foi concedido e validado.' },
        { title: 'Atualização do pacote de escritório', description: 'A estação do atendimento precisa da versão homologada do pacote de escritório.', category: 1, status: 'CLOSED', priority: 'LOW', hours: 30, resolution: 'Pacote atualizado e abertura de planilhas validada.' },
        { title: 'Monitor da recepção sem imagem', description: 'O equipamento liga, mas informa ausência de sinal de vídeo.', category: 0, status: 'OPEN', priority: 'LOW', hours: 1 },
      ];

      for (const [index, example] of examples.entries()) {
        const id = `b408c660-5f32-4601-92d5-50000000000${index}`;
        const createdAt = new Date(Date.now() - example.hours * 3_600_000);
        await tx.ticket.upsert({
          where: { id }, update: {},
          create: {
            id, createdAt, dueAt: slaDeadline(createdAt, example.priority),
            title: example.title, description: example.description, priority: example.priority,
            status: example.status, categoryId: categories[example.category].id,
            requesterId: requester.id, assigneeId: example.status === 'OPEN' ? null : technician.id,
            resolution: example.resolution, resolvedAt: example.resolution ? new Date() : null,
            history: { create: { actorId: requester.id, action: 'CREATED', createdAt } },
            ...(example.status === 'IN_PROGRESS' && {
              comments: { create: { authorId: technician.id, content: 'Vou verificar a cobertura do Wi-Fi e testar o ponto de acesso.' } },
            }),
          },
        });
      }
      console.log(`Contas locais de demonstração: ${admin.email}, ${technician.email}, ${requester.email}`);
    }, { timeout: 20_000 });
    console.log('Seed concluído. Senhas existentes foram preservadas.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
