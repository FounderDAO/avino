/**
 * seed-legal — заливает вшитые тексты Правил/Политики в legal_documents
 * как version 1 (PUBLISHED), чтобы админ дальше редактировал их из
 * /admin/legal (спека 2026-07-21-seed-legal-documents, ADR-0149).
 *
 *   node prisma/seed-legal.cjs   (в контейнере api: docker compose exec api …)
 *
 * Идемпотентно per kind: если по kind уже есть ЛЮБАЯ строка (draft/published/
 * archived) — skip, работа админа не затирается. legal_consent_version НЕ
 * трогаем: текст тот же, что видели пользователи, пере-согласие не нужно.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

const prisma = new PrismaClient();

// Дата updatedAt вшитого контента — «Обновлено» на /legal/* не прыгнет.
const PUBLISHED_AT = new Date('2026-06-29T00:00:00Z');

const DOCS = {
  TERMS: {
    slug: 'terms',
    titleRu: 'Правила сервиса',
    titleUz: 'Xizmat qoidalari',
    titleEn: 'Terms of Service',
  },
  PRIVACY: {
    slug: 'privacy',
    titleRu: 'Политика конфиденциальности',
    titleUz: 'Maxfiylik siyosati',
    titleEn: 'Privacy Policy',
  },
};

function readBody(slug, locale) {
  const file = path.join(__dirname, 'legal-content', `${slug}.${locale}.md`);
  const body = fs.readFileSync(file, 'utf8');
  if (!body.trim()) throw new Error(`пустой файл контента: ${file}`);
  return body;
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { deletedAt: null, roles: { some: { role: { code: 'ADMIN' } } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, phone: true },
  });
  if (!admin) {
    console.error('seed-legal: не найден пользователь с ролью ADMIN — ничего не пишем');
    process.exitCode = 1;
    return;
  }

  for (const [kind, doc] of Object.entries(DOCS)) {
    const existing = await prisma.legalDocument.count({ where: { kind } });
    if (existing > 0) {
      console.log(`seed-legal: skip ${kind} — в legal_documents уже ${existing} строк(и)`);
      continue;
    }
    await prisma.legalDocument.create({
      data: {
        kind,
        version: 1,
        status: 'PUBLISHED',
        titleRu: doc.titleRu,
        titleUz: doc.titleUz,
        titleEn: doc.titleEn,
        bodyMdRu: readBody(doc.slug, 'ru'),
        bodyMdUz: readBody(doc.slug, 'uz'),
        bodyMdEn: readBody(doc.slug, 'en'),
        publishedAt: PUBLISHED_AT,
        createdById: admin.id,
      },
    });
    console.log(`seed-legal: seeded ${kind} v1 (PUBLISHED, createdBy ${admin.email ?? admin.phone ?? admin.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
