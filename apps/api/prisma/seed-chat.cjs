/**
 * Chat-сид для локальной проверки внутреннего чата (TASK-110/111, API.md §13).
 *
 * Идемпотентен (фиксированные UUID + upsert). НЕ для production. Создаёт двух
 * пользователей с email (вход по OTP-EMAIL: dev-код печатается в логи api как
 * `[DEV EMAIL → ...]`), ACTIVE-объявление продавца с RU-переводом и фото (чтобы
 * `listing_preview` гидратировался), один диалог между ними и переписку из шести
 * сообщений (последнее с каждой стороны — непрочитанное, для `unread_count`).
 *
 *   Пользователи (вход по email через модалку входа / OTP-API):
 *     • Покупатель (инициатор): chat-buyer@demo.avino.uz  — Камила Назарова
 *     • Продавец  (владелец):   chat-seller@demo.avino.uz — Тимур Сафаров
 *
 * Запуск:
 *   docker compose exec api node prisma/seed-chat.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Фиксированные UUID (v4-совместимые) для идемпотентности ─────────────────
const BUYER = 'e1111111-1111-4111-8111-111111111111'; // инициатор (покупатель)
const SELLER = 'e2222222-2222-4222-8222-222222222222'; // владелец (продавец)
const LISTING = 'e3333333-3333-4333-8333-333333333333';
const TRANSLATION = 'e4444444-4444-4444-8444-444444444444';
const MEDIA = 'e5555555-5555-4555-8555-555555555555';
const THREAD = 'e6666666-6666-4666-8666-666666666666';
const MSG = (n) => `e7000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BUYER_EMAIL = 'chat-buyer@demo.avino.uz';
const SELLER_EMAIL = 'chat-seller@demo.avino.uz';

const photoUrl = (seed) => `https://picsum.photos/seed/${seed}/1024/768`;
const thumbUrl = (seed) => `https://picsum.photos/seed/${seed}/320/240`;

async function upsertUser(id, email, first, last) {
  await prisma.user.upsert({
    where: { id },
    update: { email, isEmailVerified: true, status: 'ACTIVE' },
    create: {
      id,
      email,
      isEmailVerified: true,
      status: 'ACTIVE',
      defaultLanguage: 'RU',
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: id },
    update: {
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
    },
    create: {
      userId: id,
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      preferredLanguage: 'RU',
    },
  });
  // Базовая роль USER (как при OTP-signup) — идемпотентно. Если справочник ролей
  // ещё не засеян, просто пропускаем: чат-ручкам роль не нужна, только Bearer.
  const role = await prisma.role.findUnique({
    where: { code: 'USER' },
    select: { id: true },
  });
  if (role) {
    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: id, roleId: role.id } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
  }
}

async function main() {
  // 1) Два пользователя.
  await upsertUser(BUYER, BUYER_EMAIL, 'Камила', 'Назарова');
  await upsertUser(SELLER, SELLER_EMAIL, 'Тимур', 'Сафаров');

  // 2) ACTIVE-объявление продавца (владелец треда) + RU-перевод + фото.
  await prisma.listing.upsert({
    where: { id: LISTING },
    update: { status: 'ACTIVE' },
    create: {
      id: LISTING,
      ownerId: SELLER,
      originalLanguage: 'RU',
      transactionType: 'SALE',
      propertyType: 'APARTMENT',
      status: 'ACTIVE',
      price: '95000.00',
      currency: 'USD',
      area: '78.00',
      rooms: 3,
      floor: 7,
      totalFloors: 12,
      yearBuilt: 2022,
      address: 'Ташкент, Яккасарай, ул. Шота Руставели',
      latitude: '41.295000',
      longitude: '69.255000',
      publishedAt: new Date('2026-06-01T09:00:00Z'),
    },
  });
  await prisma.listingTranslation.upsert({
    where: { id: TRANSLATION },
    update: { title: '3-комнатная квартира в Яккасарае' },
    create: {
      id: TRANSLATION,
      listingId: LISTING,
      language: 'RU',
      title: '3-комнатная квартира в Яккасарае',
      source: 'USER',
    },
  });
  await prisma.listingMedia.upsert({
    where: { id: MEDIA },
    update: {},
    create: {
      id: MEDIA,
      listingId: LISTING,
      url: photoUrl('avino-chat-apt'),
      thumbnailUrl: thumbUrl('avino-chat-apt'),
      sortOrder: 0,
      type: 'IMAGE',
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
    },
  });

  // 3) Тред (создаём ДО сообщений — у chat_messages FK на chat_threads).
  await prisma.chatThread.upsert({
    where: { id: THREAD },
    update: {},
    create: {
      id: THREAD,
      listingId: LISTING,
      initiatorId: BUYER,
      ownerId: SELLER,
      createdAt: new Date('2026-06-13T09:59:00Z'),
    },
  });

  // 4) Диалог: инициатор — покупатель, владелец — продавец.
  // Шесть сообщений; последнее с каждой стороны оставляем непрочитанным, чтобы
  // у обоих участников был ненулевой unread_count (sender != currentUser & !is_read).
  const dialog = [
    { sender: BUYER, body: 'Здравствуйте! Квартира ещё доступна?', isRead: true },
    {
      sender: SELLER,
      body: 'Добрый день! Да, доступна. Можем организовать показ.',
      isRead: true,
    },
    { sender: BUYER, body: 'Отлично. Какая цена окончательная?', isRead: true },
    {
      sender: SELLER,
      body: 'Цена 95 000 $, возможен небольшой торг при быстрой сделке.',
      isRead: true,
    },
    {
      sender: BUYER,
      body: 'Можно посмотреть завтра в 15:00?',
      isRead: false, // непрочитано продавцом
    },
    {
      sender: SELLER,
      body: 'Да, конечно. Точный адрес и контакт отправлю здесь же.',
      isRead: false, // непрочитано покупателем
    },
  ];

  const base = new Date('2026-06-13T10:00:00Z').getTime();
  let lastAt = null;
  for (let i = 0; i < dialog.length; i += 1) {
    const m = dialog[i];
    const createdAt = new Date(base + i * 60 * 1000); // +1 минута на сообщение
    lastAt = createdAt;
    await prisma.chatMessage.upsert({
      where: { id: MSG(i + 1) },
      update: { body: m.body, isRead: m.isRead, senderId: m.sender },
      create: {
        id: MSG(i + 1),
        threadId: THREAD,
        senderId: m.sender,
        body: m.body,
        isRead: m.isRead,
        createdAt,
      },
    });
  }

  // Двигаем last_message_at треда на самое свежее сообщение (порядок списка).
  await prisma.chatThread.update({
    where: { id: THREAD },
    data: { lastMessageAt: lastAt },
  });

  const msgCount = await prisma.chatMessage.count({ where: { threadId: THREAD } });
  console.log(
    `seed-chat: ok — thread ${THREAD}, messages ${msgCount}\n` +
      `  buyer  (initiator): ${BUYER_EMAIL}\n` +
      `  seller (owner):     ${SELLER_EMAIL}`,
  );
}

main()
  .catch((e) => {
    console.error('seed-chat failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
