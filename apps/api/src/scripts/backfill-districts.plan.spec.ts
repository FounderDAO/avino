import {
  assignDistrictSql,
  reassignDistrictSql,
  reconcileCandidatesSql,
  runDistrictReconcile,
  type ReconcileDeps,
  candidatesSql,
  parseBackfillArgs,
  runDistrictBackfill,
  type BackfillCandidate,
  type BackfillDeps,
} from './backfill-districts.plan';

describe('backfill-districts', () => {
  describe('parseBackfillArgs', () => {
    it('по умолчанию — dry-run без лимита', () => {
      expect(parseBackfillArgs([])).toEqual({ apply: false, limit: undefined });
    });
    it('--apply и --limit=N', () => {
      expect(parseBackfillArgs(['--apply', '--limit=50'])).toEqual({ apply: true, limit: 50 });
    });
    it('мусорный лимит → ошибка', () => {
      expect(() => parseBackfillArgs(['--limit=abc'])).toThrow(/limit/);
    });
    it('--reconcile', () => {
      expect(parseBackfillArgs(['--reconcile', '--apply'])).toEqual({ apply: true, limit: undefined, reconcile: true });
    });
    it('неизвестный флаг → ошибка (опечатка в --apply не должна тихо стать dry-run)', () => {
      expect(() => parseBackfillArgs(['--aply'])).toThrow(/--aply/);
    });
  });

  describe('SQL выборки и записи', () => {
    it('кандидаты: без района, с точкой, не DELETED', () => {
      const sql = candidatesSql().sql;
      expect(sql).toMatch(/district_id IS NULL/);
      expect(sql).toMatch(/location IS NOT NULL/);
      expect(sql).toMatch(/status <> 'DELETED'/);
      expect(sql).not.toMatch(/LIMIT/);
      expect(candidatesSql(10).sql).toMatch(/LIMIT/);
    });
    it('запись идемпотентна: только пока район пустой, updated_at не трогаем', () => {
      const q = assignDistrictSql('L1', 'd1');
      expect(q.text).toMatch(/SET district_id = \$1::uuid/);
      expect(q.sql).toMatch(/AND district_id IS NULL/);
      expect(q.sql).not.toMatch(/updated_at/);
      expect(q.values).toEqual(['d1', 'L1']);
    });
  });

  describe('runDistrictBackfill', () => {
    const candidates: BackfillCandidate[] = [
      { id: 'L1', latitude: '41.30', longitude: '69.24', status: 'ACTIVE' },
      { id: 'L2', latitude: '41.35', longitude: '69.28', status: 'NEW' },
      { id: 'L3', latitude: '41.20', longitude: '69.10', status: 'ACTIVE' },
    ];
    let deps: jest.Mocked<BackfillDeps>;

    beforeEach(() => {
      deps = {
        findCandidates: jest.fn().mockResolvedValue(candidates),
        resolveDistrictId: jest
          .fn()
          .mockResolvedValueOnce({ districtId: 'd-chil' })
          .mockResolvedValueOnce({ districtId: 'd-yun' })
          .mockResolvedValueOnce({ districtId: null }),
        assignDistrict: jest.fn().mockResolvedValue(true),
        sleep: jest.fn().mockResolvedValue(undefined),
      };
    });

    it('dry-run: считает, но ничего не пишет', async () => {
      const summary = await runDistrictBackfill(deps, { apply: false });
      expect(deps.assignDistrict).not.toHaveBeenCalled();
      expect(summary).toMatchObject({
        candidates: 3,
        resolved: 2,
        unresolved: 1,
        failed: 0,
        updated: 0,
        aborted: false,
        byStatus: { ACTIVE: 2, NEW: 1 },
        byDistrict: { 'd-chil': 1, 'd-yun': 1 },
        unresolvedIds: ['L3'],
      });
      expect(deps.resolveDistrictId).toHaveBeenCalledWith('41.30', '69.24', null);
    });

    it('--apply: пишет только распознанные районы', async () => {
      const summary = await runDistrictBackfill(deps, { apply: true });
      expect(deps.assignDistrict).toHaveBeenCalledTimes(2);
      expect(deps.assignDistrict).toHaveBeenCalledWith('L1', 'd-chil');
      expect(deps.assignDistrict).toHaveBeenCalledWith('L2', 'd-yun');
      expect(summary.updated).toBe(2);
    });

    it('строку успели заполнить параллельно → не считается обновлённой', async () => {
      deps.assignDistrict.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const summary = await runDistrictBackfill(deps, { apply: true });
      expect(summary.updated).toBe(1);
    });

    it('геокодер недоступен подряд N раз → остановка, без записи', async () => {
      deps.resolveDistrictId.mockReset().mockResolvedValue(null);
      const summary = await runDistrictBackfill(deps, { apply: true, maxConsecutiveFailures: 2 });
      expect(deps.resolveDistrictId).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({ failed: 2, aborted: true, updated: 0 });
      expect(deps.assignDistrict).not.toHaveBeenCalled();
    });

    it('пауза между запросами к геокодеру (лимиты тарифа)', async () => {
      await runDistrictBackfill(deps, { apply: false, pauseMs: 300 });
      expect(deps.sleep).toHaveBeenCalledWith(300);
    });

    it('лимит передаётся в выборку', async () => {
      await runDistrictBackfill(deps, { apply: false, limit: 5 });
      expect(deps.findCandidates).toHaveBeenCalledWith(5);
    });
  });

  describe('--reconcile: сверка заполненных районов с адресом', () => {
    it('SQL: кандидаты с районом и адресом; смена только со старого района', () => {
      const sql = reconcileCandidatesSql().sql;
      expect(sql).toMatch(/district_id IS NOT NULL/);
      expect(sql).toMatch(/address IS NOT NULL/);
      expect(sql).toMatch(/status <> 'DELETED'/);
      const q = reassignDistrictSql('L1', 'old', 'new');
      expect(q.text).toMatch(/AND district_id = \$3::uuid/);
      expect(q.sql).not.toMatch(/updated_at/);
      expect(q.values).toEqual(['new', 'L1', 'old']);
    });

    const deps = (): jest.Mocked<ReconcileDeps> => ({
      findCandidates: jest.fn().mockResolvedValue([
        { id: 'L1', districtId: 'tash-tumani', address: 'г.Ташкент, Юнусабадский 16-квартал' },
        { id: 'L2', districtId: 'chilonzor', address: 'Ташкент, Чиланзар' },
      ]),
      reconcile: jest.fn((districtId: string, address: string) =>
        Promise.resolve(address.includes('Юнусабад') ? 'yunusobod' : districtId),
      ),
      reassign: jest.fn().mockResolvedValue(true),
    });

    it('dry-run: печатает замену, ничего не пишет', async () => {
      const d = deps();
      const summary = await runDistrictReconcile(d, { apply: false });
      expect(summary).toMatchObject({ candidates: 2, changed: 1, updated: 0 });
      expect(summary.changes).toEqual([
        { id: 'L1', address: 'г.Ташкент, Юнусабадский 16-квартал', from: 'tash-tumani', to: 'yunusobod' },
      ]);
      expect(d.reassign).not.toHaveBeenCalled();
    });

    it('--apply: меняет только расходящиеся', async () => {
      const d = deps();
      const summary = await runDistrictReconcile(d, { apply: true });
      expect(summary.updated).toBe(1);
      expect(d.reassign).toHaveBeenCalledWith('L1', 'tash-tumani', 'yunusobod');
    });
  });
});
