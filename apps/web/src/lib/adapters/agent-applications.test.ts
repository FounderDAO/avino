import { describe, expect, it } from 'vitest';
import type { AgentApplication } from '@/store/api/adminTypes';
import {
  AGENT_APPLICATION_STATUS_MAP,
  agentApplicationToRow,
} from './agent-applications';

const base: AgentApplication = {
  id: 'aa1',
  status: 'PENDING',
  agency_name: 'Ideal Estate',
  about: '10 лет на рынке',
  reject_reason: null,
  moderator_id: null,
  created_at: '2026-07-12T10:00:00Z',
  resolved_at: null,
  user: {
    id: 'u1',
    name: 'Алишер Усманов',
    phone: '+998901234567',
    avatar_url: 'https://cdn.avino.uz/u1.webp',
  },
};

describe('agentApplicationToRow', () => {
  it('маппит заполненную PENDING-заявку', () => {
    const row = agentApplicationToRow(base);
    expect(row).toEqual({
      id: 'aa1',
      userId: 'u1',
      userName: 'Алишер Усманов',
      userPhone: '+998901234567',
      avatarUrl: 'https://cdn.avino.uz/u1.webp',
      agency: 'Ideal Estate',
      about: '10 лет на рынке',
      status: 'PENDING',
      rejectReason: null,
      created: row.created,
      resolved: '—',
    });
    // Дата в ru-RU формате «дд.мм.гггг, чч:мм» (таймзона машины — проверяем шаблон).
    expect(row.created).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  });

  it('null-поля: имя/телефон → «—», агентство → «Частный маклер», аватар null', () => {
    const row = agentApplicationToRow({
      ...base,
      agency_name: null,
      user: { id: 'u2', name: null, phone: null, avatar_url: null },
    });
    expect(row.userName).toBe('—');
    expect(row.userPhone).toBe('—');
    expect(row.agency).toBe('Частный маклер');
    expect(row.avatarUrl).toBeNull();
  });

  it('решённая заявка: resolved отформатирован, причина проброшена', () => {
    const row = agentApplicationToRow({
      ...base,
      status: 'REJECTED',
      reject_reason: 'Недостаточно данных',
      resolved_at: '2026-07-13T08:30:00Z',
    });
    expect(row.status).toBe('REJECTED');
    expect(row.rejectReason).toBe('Недостаточно данных');
    expect(row.resolved).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  });

  it('невалидная дата → «—»', () => {
    const row = agentApplicationToRow({ ...base, created_at: 'not-a-date' });
    expect(row.created).toBe('—');
  });
});

describe('AGENT_APPLICATION_STATUS_MAP', () => {
  it('покрывает все статусы RU-метками', () => {
    expect(AGENT_APPLICATION_STATUS_MAP.PENDING[0]).toBe('Ожидает');
    expect(AGENT_APPLICATION_STATUS_MAP.APPROVED[0]).toBe('Одобрена');
    expect(AGENT_APPLICATION_STATUS_MAP.REJECTED[0]).toBe('Отклонена');
  });
});
