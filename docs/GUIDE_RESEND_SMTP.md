# GUIDE — SMTP через Resend (переиспользуемый)

> Как подключить транзакционную email-отправку через **Resend** на любом проекте:
> верификация домена, DNS, SMTP-креды, live-verify, типовые ошибки.
>
> Гайд написан по итогам реальной настройки `avino.uz` (2026-07-13) и заменяет
> `GUIDE_YANDEX_SMTP_SETUP.md` в части провайдера. Архитектура email-подсистемы
> Avino (очередь, воркер, три ветки поведения) описана там же в §1 — она
> провайдер-agnostic и не изменилась (ADR-0037).

---

## 0. Почему Resend (а не Yandex 360 / SES / SendGrid)

| Критерий | Resend |
|---|---|
| Регистрация | email/GitHub, **без юрлица, карты и телефона** (у Yandex 360 — владелец-юрлицо/ИП + оплата) |
| Ящик для From | **не нужен** — только DNS-верификация домена; From = любой адрес на домене |
| Free tier | 3 000 писем/мес, 100/день, 1 домен — с запасом для OTP + дайджестов на старте |
| Цена дальше | $20/мес за 50k (при больших объёмах смотреть Amazon SES, $0.10/1k) |
| SMTP-порты | 25, 465, 587, **2525** — обходят блокировку исходящего SMTP у Hetzner/облаков |
| Входящая почта | ❌ нет — решается отдельно (Cloudflare Email Routing / Google Workspace, см. §7) |

---

## 1. Регистрация и добавление домена

1. [resend.com](https://resend.com) → Sign up (достаточно Google/GitHub-аккаунта).
2. **Domains → Add Domain** → ввести домен (`example.uz`).
3. Выбрать **регион** (us-east-1 / eu-west-1 / sa-east-1 / ap-northeast-1).
   Регион влияет только на значение MX-записи (`feedback-smtp.<region>.amazonses.com`).

> ⚠️ **Главная гоча: добавлять домен ровно ОДИН раз.**
> Если добавить, удалить и добавить снова в другом регионе — в DNS останутся
> записи обоих регионов, и верификация упадёт с ошибкой
> **«Invalid SPF MX: Records point to multiple regions»**. Именно это случилось
> на avino.uz. Фикс — в §5.

## 2. DNS-записи

Resend после добавления домена покажет точные значения. Канонично три записи
(+ одна опциональная):

| Тип | Хост | Значение | Зачем |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGf...` (ключ из дашборда) | DKIM-подпись |
| MX | `send` | `feedback-smtp.<region>.amazonses.com`, prio 10 | bounce/feedback |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF |
| CNAME | `no-reply` (opt) | `links1.resend-dns.com` | open/click-трекинг — **опционален**; для OTP-писем лучше НЕ добавлять (перезапись ссылок трекером снижает доверие) |

Заметки:
- Записи вешаются на **поддомены** (`send.`, `resend._domainkey.`) — корневые
  SPF/MX домена не трогаются: приём почты на `@домен` (Google Workspace и т.п.)
  продолжает работать независимо.
- DMARC Resend не требует, но для доставляемости стоит иметь:
  `_dmarc TXT "v=DMARC1; p=none; rua=mailto:postmaster@<домен>"`.
- TTL любой; меньший (600–3600) удобнее — быстрее исправлять ошибки.

## 3. Верификация

1. Внести записи в DNS → в Resend домен перейдёт `Pending` → `Verified`
   (обычно минуты; кнопка **Restart** перезапускает проверку).
2. Статус **«Partially Verified»** = DKIM+SPF прошли, Pending только
   tracking-CNAME. **Отправка при этом полностью работает** — если трекинг не
   нужен, это финальное нормальное состояние.
3. Проверить из терминала, что авторитетный DNS отдаёт ровно по одной записи:

```bash
dig +short MX send.<домен>            # ровно ОДНА строка feedback-smtp...
dig +short TXT send.<домен>           # ровно ОДНА строка v=spf1...
dig +short TXT resend._domainkey.<домен>   # ровно ОДИН ключ p=...
```

## 4. API-ключ и SMTP-креды

**API keys → Create API key** (права «Sending access» достаточно). Ключ
показывается один раз — сразу передать в env целевого сервера, **не печатать в
чат/логи/репозиторий**.

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587                  # или 465 (SSL) / 2525 (если 587 закрыт)
SMTP_USER=resend               # ЛИТЕРАЛЬНО слово "resend", не email!
SMTP_PASSWORD=<API-ключ re_...>
SMTP_FROM=no-reply@<домен>     # любой адрес на ВЕРИФИЦИРОВАННОМ домене
```

Nodemailer-транспорт (если в проекте его ещё нет):

```ts
import { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465, // 465 = implicit TLS; 587/2525 = STARTTLS
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});
```

В Avino код уже такой (`apps/api/src/email/email-sender.service.ts`) — при
смене провайдера меняются **только env + рестарт api**, пересборка не нужна.

## 5. Типовые ошибки

| Симптом | Причина / фикс |
|---|---|
| **Invalid SPF MX: Records point to multiple regions** | Домен добавляли в Resend дважды в разных регионах → в DNS два MX `send` (напр. `us-east-1` и `ap-northeast-1`), два DKIM-ключа `resend._domainkey`, дубли TXT. Удалить ВСЕ записи старого региона (сверить регион в шапке домена в Resend), оставить по одной, нажать **Restart** |
| Верификация висит в Pending часами | DNS ещё не пропагировался (высокий TTL старых записей) или записи внесены с опечаткой хоста (`send.send.домен` — некоторые панели сами дописывают домен) |
| `535 Authentication failed` | В `SMTP_USER` вписан email вместо литерального `resend`, или ключ протух/отозван |
| `450/403 domain is not verified` | `From` не на верифицированном домене, или домен ещё Pending |
| Коннект висит / timeout | Хостер блокирует исходящий порт (Hetzner: 25/465 закрыты по умолчанию) → взять 587 или 2525 |
| Письмо в спаме | Нет DMARC, или прогреть репутацию: проверить через [mail-tester.com](https://www.mail-tester.com) (нужно SPF=pass, DKIM=pass, DMARC=pass) |

## 6. Live-verify (обязательный финал)

1. Прописать `SMTP_*` в env, перезапустить процесс/контейнер.
2. Дёрнуть реальный флоу (в Avino: `POST /api/v1/auth/otp/request` на тестовый
   email) → в логе воркера `SENT (messageId=...)`.
3. Письмо во «Входящих» (не в спаме); в заголовках оригинала — `dkim=pass`,
   `spf=pass`, `dmarc=pass`.
4. Прогнать через mail-tester.com → оценка ≥ 9/10.
5. В дашборде Resend **Emails** видно каждое письмо со статусом Delivered.

## 7. Входящая почта (Resend её НЕ делает)

Resend — только исходящая. Для `postmaster@`/`support@`:
- домен на Cloudflare → **Email Routing** (бесплатный форвардинг на личный ящик);
- либо Google Workspace / любой почтовый хостинг — корневые MX-записи с
  Resend не конфликтуют (у него MX только на поддомене `send.`).

## 8. Чек-лист для нового проекта

- [ ] Домен добавлен в Resend **один раз**, регион записан в доки проекта
- [ ] 3 DNS-записи внесены; `dig` показывает по одной каждого типа
- [ ] Статус Verified / Partially Verified (tracking-CNAME сознательно пропущен)
- [ ] API-ключ создан, передан в env сервера, нигде не залогирован
- [ ] `SMTP_USER=resend` (литерально), `SMTP_FROM` на верифицированном домене
- [ ] Live-verify: `SENT` в логах + письмо в инбоксе + mail-tester ≥ 9/10
- [ ] DMARC-запись есть (`p=none` для старта); входящая почта решена отдельно
- [ ] Free-лимиты записаны: 100/день, 3 000/мес — при росте план $20/50k или миграция на SES

---

## Приложение: кейс avino.uz (2026-07-13)

- Регион: **Tokyo (ap-northeast-1)**; аккаунт Resend — elcoin1001@gmail.com.
- Ошибка «multiple regions» из-за двойного добавления домена; удалены старый
  MX `send` (us-east-1), старый DKIM-ключ и дубль SPF TXT → Restart → Verified
  за ~1 минуту.
- DNS-панель ahost.uz: редактор зоны — **iframe** (`#dnsManager`), клики по
  корзинке снаружи не срабатывают; удаление делается кнопкой
  `[data-act="removeRecord"]` + Bootstrap-модалка «Подтвердить». ID строк
  перенумеровываются после каждого удаления.
- Tracking-CNAME `no-reply` сознательно не добавлен (OTP-письма).
- Приём почты на `@avino.uz` — Google Workspace (MX `@` → smtp.google.com),
  с Resend не конфликтует.
