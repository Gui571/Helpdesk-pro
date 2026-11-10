import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Load the pure policy without compiling NestJS or generating Prisma Client.
const source = readFileSync(new URL('../src/policy.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { canAssign, canWorkOn, slaDeadline, ticketScope, transitionOptions } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const employee = { id: 'requester', role: 'EMPLOYEE' };
const technician = { id: 'technician', role: 'TECHNICIAN' };
const colleague = { id: 'other', role: 'TECHNICIAN' };
const admin = { id: 'admin', role: 'ADMIN' };
const unassigned = { status: 'OPEN', requesterId: employee.id, assigneeId: null };
const assigned = { ...unassigned, assigneeId: technician.id };

test('escopo de consulta respeita o perfil', () => {
  assert.deepEqual(ticketScope(employee), { requesterId: employee.id });
  assert.deepEqual(ticketScope(technician), {
    OR: [{ requesterId: technician.id }, { assigneeId: technician.id }, { assigneeId: null }],
  });
  assert.deepEqual(ticketScope(admin), {});
});

test('técnico só pode assumir para si um chamado sem responsável', () => {
  assert.equal(canAssign(technician, unassigned, technician.id), true);
  assert.equal(canAssign(technician, unassigned, colleague.id), false);
  assert.equal(canAssign(technician, assigned, technician.id), false);
  assert.equal(canAssign(employee, unassigned, employee.id), false);
  assert.equal(canAssign(admin, assigned, colleague.id), true);
  assert.equal(canAssign(admin, { ...assigned, status: 'IN_PROGRESS' }, null), false);
  assert.equal(canAssign(admin, { ...assigned, status: 'CLOSED' }, technician.id), false);
});

test('iniciar e resolver exigem responsável ou intervenção do administrador', () => {
  assert.deepEqual(transitionOptions(admin, unassigned), []);
  assert.deepEqual(transitionOptions(technician, assigned), ['IN_PROGRESS']);
  assert.deepEqual(transitionOptions(colleague, assigned), []);
  const inProgress = { ...assigned, status: 'IN_PROGRESS' };
  assert.equal(canWorkOn(colleague, inProgress), false);
  assert.deepEqual(transitionOptions(employee, inProgress), []);
  assert.deepEqual(transitionOptions(technician, inProgress), ['RESOLVED', 'OPEN']);
});

test('solicitante pode confirmar ou reabrir, inclusive dados legados sem atribuição', () => {
  const resolved = { ...assigned, status: 'RESOLVED' };
  assert.deepEqual(transitionOptions(technician, resolved), []);
  assert.deepEqual(transitionOptions(employee, resolved), ['CLOSED', 'IN_PROGRESS']);
  assert.deepEqual(transitionOptions(employee, { ...resolved, assigneeId: null }), ['CLOSED', 'OPEN']);
  assert.deepEqual(transitionOptions(admin, { ...resolved, status: 'CLOSED' }), []);
});

test('SLA usa horas corridas e parte da abertura', () => {
  const opened = new Date('2026-11-09T12:00:00.000Z');
  assert.equal(slaDeadline(opened, 'CRITICAL').toISOString(), '2026-11-09T16:00:00.000Z');
  assert.equal(slaDeadline(opened, 'HIGH').toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(slaDeadline(opened, 'MEDIUM').toISOString(), '2026-11-10T12:00:00.000Z');
  assert.equal(slaDeadline(opened, 'LOW').toISOString(), '2026-11-12T12:00:00.000Z');
});
