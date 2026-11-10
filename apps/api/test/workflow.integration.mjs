import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_API_URL ?? 'http://localhost:4000/api';
const origin = process.env.TEST_WEB_ORIGIN ?? 'http://localhost:3000';
const password = process.env.TEST_ADMIN_PASSWORD;
const adminEmail = process.env.TEST_ADMIN_EMAIL ?? 'admin@demo.local';

async function request(path, { method = 'GET', body, cookie, requestOrigin = origin } = {}) {
  const headers = { Origin: requestOrigin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + path, { method, headers, body: JSON.stringify(body) });
  return {
    status: response.status,
    setCookie: response.headers.get('set-cookie'),
    data: response.status === 204 ? null : await response.json(),
  };
}

function status(result, code) {
  assert.equal(result.status, code, JSON.stringify(result.data));
  return result.data;
}

async function login(email, credential) {
  const response = await request('/auth/login', { method: 'POST', body: { email, password: credential } });
  status(response, 200);
  assert.match(response.setCookie, /HttpOnly/i);
  assert.match(response.setCookie, /SameSite=Lax/i);
  return response.setCookie.split(';')[0];
}

test('integração HTTP: acesso, isolamento, atendimento, auditoria e encerramento de sessão', async () => {
  assert.ok(password, 'Defina TEST_ADMIN_PASSWORD com a senha do seed de um banco de teste.');
  status(await request('/health'), 200);
  status(await request('/tickets'), 401);
  status(await request('/auth/login', {
    method: 'POST', requestOrigin: 'https://origem-invalida.example',
    body: { email: adminEmail, password },
  }), 403);

  const admin = await login(adminEmail, password);
  const credential = 'Teste-Somente-' + randomUUID();
  const suffix = randomUUID();
  async function createUser(role, prefix) {
    const email = `${prefix}-${suffix}@demo.local`;
    const user = status(await request('/users', {
      method: 'POST', cookie: admin, body: { name: prefix, email, password: credential, role },
    }), 201);
    assert.equal(Object.hasOwn(user, 'passwordHash'), false);
    return { ...user, cookie: await login(email, credential) };
  }
  const requester = await createUser('EMPLOYEE', 'solicitante');
  const colleague = await createUser('EMPLOYEE', 'colega');
  const technician = await createUser('TECHNICIAN', 'tecnico');

  status(await request('/users', { cookie: requester.cookie }), 403);
  const categories = status(await request('/categories', { cookie: requester.cookie }), 200);
  const ticket = status(await request('/tickets', {
    method: 'POST', cookie: requester.cookie,
    body: {
      title: 'Impressora em teste de integração',
      description: 'A impressora não responde no setor de atendimento.',
      categoryId: categories[0].id, priority: 'HIGH',
    },
  }), 201);
  assert.ok(ticket.dueAt);
  const path = '/tickets/' + ticket.id;
  status(await request(path, { cookie: colleague.cookie }), 404);
  status(await request(path + '/status', { method: 'PATCH', cookie: requester.cookie, body: { status: 'RESOLVED' } }), 403);

  async function update(endpoint, body, expected = 200) {
    status(await request(path + endpoint, { method: 'PATCH', cookie: technician.cookie, body }), expected);
  }
  await update('/assignee', { assigneeId: technician.id });
  await update('/status', { status: 'IN_PROGRESS' });
  await update('/status', { status: 'RESOLVED' }, 400);
  status(await request(path + '/comments', { method: 'POST', cookie: technician.cookie, body: { content: 'Ajuste de rede em andamento.' } }), 201);
  await update('/status', { status: 'RESOLVED', resolution: 'A configuração de rede da impressora foi corrigida.' });

  status(await request(path + '/status', { method: 'PATCH', cookie: requester.cookie, body: { status: 'CLOSED' } }), 200);
  const detail = status(await request(path, { cookie: requester.cookie }), 200);
  assert.equal(detail.status, 'CLOSED');
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.history.filter(({ action }) => action === 'STATUS_CHANGED').length, 3);
  assert.match(detail.resolution, /rede/);
  status(await request(path + '/comments', { method: 'POST', cookie: requester.cookie, body: { content: 'Chamado encerrado.' } }), 409);
  status(await request('/tickets/overview', { cookie: requester.cookie }), 200);

  status(await request(`/users/${technician.id}/active`, {
    method: 'PATCH', cookie: admin, body: { active: false },
  }), 200);
  status(await request('/auth/me', { cookie: technician.cookie }), 401);
  status(await request('/auth/logout', { method: 'POST', cookie: requester.cookie }), 204);
  status(await request('/auth/me', { cookie: requester.cookie }), 401);
});
