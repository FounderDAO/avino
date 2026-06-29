import type { LegalDoc } from "./types";

/**
 * Avino Maxfiylik siyosati — oʻzbek tili varianti.
 * Manba: privacy.ru.ts (kanonik rus tili nusxasi).
 * Oʻzbekiston Respublikasining «Shaxsga doir maʻlumotlar toʻgʻrisida»gi ZRU-547-son
 * Qonuniga muvofiq tuzilgan ishchi qoralama; rasmiy yuridik hujjat emas.
 */
export const privacyUz: LegalDoc = {
  title: "Maxfiylik siyosati",
  updatedAt: "2026-06-29",
  intro:
    "Ushbu Maxfiylik siyosati «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]» " +
    "(keyingi oʻrinlarda — «Avino», «biz», «Operator») tomonidan avino.uz xizmati " +
    "foydalanuvchilarining shaxsga doir maʻlumotlarini qanday yigʻishi, ishlatishi va " +
    "himoya qilishini tavsiflaydi. Oʻzbekiston Respublikasining «Shaxsga doir maʻlumotlar " +
    "toʻgʻrisida»gi ZRU-547-son Qonuniga muvofiq tuzilgan.",
  sections: [
    {
      id: "general",
      heading: "Umumiy qoidalar",
      blocks: [
        {
          type: "p",
          text:
            "avino.uz xizmati foydalanuvchilarining shaxsga doir maʻlumotlari operatori " +
            "«[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]» (keyingi oʻrinlarda — «Operator», " +
            "«Avino», «biz») boʻlib, u quyidagi manzil boʻyicha roʻyxatdan oʻtgan: " +
            "[ЮР. АДРЕС], INN/OGRN: [ИНН/ОГРН], roʻyxatdan oʻtgan sana: [ДАТА РЕГИСТРАЦИИ].",
        },
        {
          type: "p",
          text:
            "Ushbu Maxfiylik siyosati (keyingi oʻrinlarda — «Siyosat») Oʻzbekiston " +
            "Respublikasining «Shaxsga doir maʻlumotlar toʻgʻrisida»gi ZRU-547-son Qonuni " +
            "va boshqa amaldagi normativ hujjatlar asosida Xizmat foydalanuvchilarining " +
            "shaxsga doir maʻlumotlari qayta ishlanish tartibini tavsiflaydi.",
        },
        {
          type: "p",
          text:
            "Xizmatda roʻyxatdan oʻtish yoki undan boshqacha foydalanish orqali siz " +
            "ushbu Siyosat bilan tanishganingizni va shaxsga doir maʻlumotlaringizni " +
            "koʻrsatilgan maqsadlar hamda hajmda qayta ishlashga rozilik bildirayotganingizni " +
            "tasdiqlaysiz. Agar Siyosat shartlari bilan rozi boʻlmasangiz, Xizmatdan " +
            "foydalanishdan tiyilishingizni soʻraymiz.",
        },
      ],
    },
    {
      id: "data-collected",
      heading: "Qanday maʻlumotlar yigʻamiz",
      blocks: [
        {
          type: "subheading",
          text: "Hisob maʻlumotlari",
        },
        {
          type: "list",
          items: [
            "Telefon raqami — roʻyxatdan oʻtish, kirish va OTP-tasdiqlash uchun.",
            "Elektron pochta manzili — roʻyxatdan oʻtishda yoki OAuth orqali taqdim etilgan boʻlsa.",
            "Ism — foydalanuvchi tomonidan profilida koʻrsatilganidek.",
          ],
        },
        {
          type: "subheading",
          text: "Kirish maʻlumotlari",
        },
        {
          type: "list",
          items: [
            "Google identifikatori (Google ID) — Google orqali kirishda.",
            "Apple identifikatori (Apple ID) — Apple orqali kirishda.",
            "Telegram identifikatori (Telegram ID) — Telegram orqali kirishda.",
          ],
        },
        {
          type: "subheading",
          text: "Kontent",
        },
        {
          type: "list",
          items: [
            "Eʻlonlar — matn, fotosuratlar, obʻyekt xususiyatlari, holati va oʻzgarishlar tarixi.",
            "Eʻlon yaratishda koʻrsatilgan koʻchmas mulk obʻyektlarining geolokatsiya koordinatalari.",
            "Bulutli xotirada saqlanadigan eʻlonga yuklangan fotosuratlar.",
            "Chat xabarlari — Xizmat doirasida foydalanuvchilar oʻrtasidagi yozishmalar.",
            "Sevimlilar — foydalanuvchi tomonidan xatchoʻpga qoʻshilgan eʻlonlar.",
            "Saqlangan qidiruvlar va sozlangan bildirishnoma filtrlari.",
          ],
        },
        {
          type: "subheading",
          text: "Texnik maʻlumotlar",
        },
        {
          type: "list",
          items: [
            "Qurilma IP-manzili.",
            "Qurilma va brauzer turi, operatsion tizim versiyasi.",
            "Cookie va shunga oʻxshash texnologiyalar (batafsil — «Cookie» boʻlimida).",
            "Qurilma geolokatsiyasi — faqat «yaqin atrofda qidirish» funksiyasidan foydalanilganda va faqat foydalanuvchining aniq roziligi asosida.",
          ],
        },
      ],
    },
    {
      id: "purposes",
      heading: "Ishlov berish maqsadlari",
      blocks: [
        {
          type: "p",
          text:
            "Biz shaxsga doir maʻlumotlarni faqat qonuniy va aniq belgilangan maqsadlar " +
            "uchun qayta ishlaymiz. Asosiy ishlov berish maqsadlari:",
        },
        {
          type: "list",
          items: [
            "Xizmatni taqdim etish va uning ishlashini taʻminlash: roʻyxatdan oʻtish, autentifikatsiya, eʻlonlarni nashr etish va koʻrsatish, soʻrovlar va xabarlarni qayta ishlash.",
            "Kontentni moderatsiya qilish: eʻlonlarni nashrdan oldin va foydalanuvchilar shikoyatlari boʻyicha Qoidalarga muvofiqligini tekshirish.",
            "Bildirishnomalar: eʻlon holati oʻzgarishlari, chatdagi yangi xabarlar, saqlangan qidiruvlarga mosliklar haqida SMS (Eskiz orqali), email va push-bildirishnomalar yuborish.",
            "Firibgarlikka qarshi kurash va xavfsizlik: shubhali faoliyatni aniqlash, firibgarlik va Xizmatni suisteʻmol qilishning oldini olish.",
            "Tahlil va Xizmatni yaxshilash: sifat va qulaylikni oshirish maqsadida agregatlangan foydalanish namunalarini oʻrganish.",
            "Qonunchilik talablarini bajarish: Oʻzbekiston Respublikasining amaldagi normativ hujjatlari bilan belgilangan Operator majburiyatlarini ado etish.",
          ],
        },
        {
          type: "p",
          text:
            "Biz shaxsga doir maʻlumotlarni ularni yigʻish maqsadlari bilan mos kelmaydigan " +
            "holatlarda qayta ishlamaymiz — buning uchun subyektning qoʻshimcha roziligi talab etiladi.",
        },
      ],
    },
    {
      id: "legal-basis",
      heading: "Huquqiy asoslar",
      blocks: [
        {
          type: "p",
          text:
            "Shaxsga doir maʻlumotlarga ishlov berish Oʻzbekiston Respublikasining " +
            "«Shaxsga doir maʻlumotlar toʻgʻrisida»gi ZRU-547-son Qonuniga muvofiq " +
            "quyidagi huquqiy asoslarda amalga oshiriladi:",
        },
        {
          type: "list",
          items: [
            "Shaxsga doir maʻlumotlar subyektining roziligi — Xizmatda roʻyxatdan oʻtish yoki ushbu Siyosatni boshqa usul bilan qabul qilish orqali beriladi.",
            "Oferta shartnomasi (Xizmat qoidalari) ni bajarish — foydalanuvchi oldidagi majburiyatlarni lozim darajada bajarish uchun ishlov berish zarur.",
            "Operatorning qonuniy manfaati — Xizmat xavfsizligini taʻminlash, firibgarlikka qarshi kurash, foydalanuvchilarning huquq va qonuniy manfaatlarini himoya qilish.",
            "Qonunchilik talablarini bajarish — Oʻzbekiston Respublikasining amaldagi normativ hujjatlari bilan Operatorga yuklangan majburiyatlar.",
          ],
        },
      ],
    },
    {
      id: "sharing",
      heading: "Uchinchi shaxslarga uzatish",
      blocks: [
        {
          type: "p",
          text:
            "Biz shaxsga doir maʻlumotlarni uchinchi shaxslarga sotmaymiz. Maʻlumotlar " +
            "subprotsessorlarga faqat Xizmatning ishlashi uchun zarur boʻlgan hajmda, " +
            "tegishli maʻlumotlarni qayta ishlash shartnomalari asosida uzatiladi. " +
            "Quyida subprotsessorlar va uzatish maqsadlari roʻyxati keltirilgan:",
        },
        {
          type: "list",
          items: [
            "Eskiz (eskiz.uz) — OTP-tasdiqlash va tranzaksion bildirishnomalar uchun SMS-xabarlar yuborish.",
            "Yandex Maps (maps.yandex.ru) — interaktiv xaritalarni koʻrsatish, manzillarni geokodlash va kiritishda geomaslahatlar taqdim etish.",
            "Google Translate / Yandex Translate — eʻlon matnlarini oʻzbek, rus va ingliz tillariga avtomatik tarjima qilish.",
            "Cloudflare R2 — foydalanuvchilar eʻlonlarining fotosuratlarini bulutli saqlash.",
            "SMTP-provayder — roʻyxatdan oʻtgan foydalanuvchilarga email-bildirishnomalar yetkazish.",
            "Firebase Cloud Messaging (Google) — mobil qurilmalarga push-bildirishnomalar yetkazish.",
            "Google / Apple / Telegram — foydalanuvchi tegishli platformalar orqali kirishida OAuth-autentifikatsiya.",
          ],
        },
        {
          type: "p",
          text:
            "Davlat organlari va mansabdor shaxslarga shaxsga doir maʻlumotlar faqat " +
            "qonuniy asoslarda — qonunchilikda belgilangan tartibda rasmiy soʻrov asosida " +
            "uzatiladi. Biz shaxsga doir maʻlumotlarni reklama yoki boshqa tijorat " +
            "maqsadlarida sotmaymiz va uzatmaymiz.",
        },
      ],
    },
    {
      id: "cross-border",
      heading: "Chegaradan tashqari uzatish",
      blocks: [
        {
          type: "p",
          text:
            "Xizmatning ishlashida ishtirok etayotgan subprotsessorlarning bir qismi " +
            "Oʻzbekiston Respublikasi tashqarisida joylashgan. Xususan, server infratuzilmasi, " +
            "CDN-tugunlar va alohida bulutli xizmatlar Yevropa Ittifoqi davlatlari, AQSh va " +
            "boshqa mamlakatlarda joylashgan boʻlishi mumkin.",
        },
        {
          type: "p",
          text:
            "Xizmatdan foydalanish orqali siz shaxsga doir maʻlumotlaringizning Xizmat " +
            "ishlashi uchun zarur boʻlgan hajmda chegaradan tashqari uzatilishiga rozilik " +
            "bildirasiz. Operator maʻlumotlarni chet elga uzatishda tegishli maxfiylik " +
            "kafolatlarini nazarda tutuvchi subprotsessorlar bilan shartnomalar tuzish " +
            "orqali maʻlumotlarni himoya qilishning munosib darajasini taʻminlash uchun " +
            "oqilona tashkiliy va texnik chora-tadbirlar koʻradi.",
        },
      ],
    },
    {
      id: "cookies",
      heading: "Cookie va shunga oʻxshash texnologiyalar",
      blocks: [
        {
          type: "p",
          text:
            "Xizmat toʻgʻri ishlashini taʻminlash va foydalanuvchi tajribasini yaxshilash " +
            "maqsadida cookie fayllari va shunga oʻxshash texnologiyalardan (masalan, " +
            "localStorage) foydalanadi.",
        },
        {
          type: "list",
          items: [
            "Sessiya cookie-lari — Xizmat bilan ishlash davomida seansni (avtorizatsiyani) saqlash uchun zarur; brauzer yopilganda oʻchiriladi.",
            "Sozlamalar cookie-lari — tanlangan interfeys tili va narxlarni koʻrsatish valyutasi kabi afzalliklaringizni saqlaydi.",
            "Tahliliy cookie-lar — foydalanuvchilarning Xizmat bilan qanday muloqot qilishini agregatlangan va anonimlashtirigan shaklda tushunishimizga yordam beradi.",
          ],
        },
        {
          type: "p",
          text:
            "Siz brauzer sozlamalari orqali cookie-larni boshqarish — cheklash yoki toʻliq " +
            "taqiqlash huquqiga egasiz. Majburiy cookie-larni oʻchirib qoʻyish Xizmat " +
            "funksiyalarining bir qismiga taʻsir qilishi mumkinligini hisobga oling.",
        },
      ],
    },
    {
      id: "retention",
      heading: "Saqlash muddatlari",
      blocks: [
        {
          type: "p",
          text:
            "Biz shaxsga doir maʻlumotlarni ushbu Siyosatda koʻrsatilgan ishlov berish " +
            "maqsadlariga erishish uchun zarur boʻlgan muddat davomida, shuningdek amaldagi " +
            "qonunchilik belgilagan muddat mobaynida saqlaymiz.",
        },
        {
          type: "list",
          items: [
            "Hisob maʻlumotlari — hisob faol boʻlib, foydalanuvchi yoki Operator tomonidan oʻchirilmaguncha saqlanadi.",
            "Eʻlon maʻlumotlari — eʻlon faolligi davomida; oʻchirilgandan soʻng Oʻzbekiston Respublikasi qonunchiligida belgilangan muddat ichida.",
            "Yozishma maʻlumotlari (chat) — Oʻzbekiston Respublikasi qonunchiligining talablariga muvofiq saqlanadi.",
            "Texnik jurnallar (IP-manzillar, sessiyalar) — xavfsizlikni taʻminlash uchun zarur cheklangan muddat davomida, soʻng avtomatik ravishda oʻchiriladi.",
          ],
        },
        {
          type: "p",
          text:
            "Hisob oʻchirilgandan soʻng shaxsga doir maʻlumotlar «[…]» oqilona muddat " +
            "ichida oʻchiriladi yoki anonimlashtiradi, bundan qonunchilik bilan saqlash " +
            "talab etilgan yoki Operatorning qonuniy manfaatlarini himoya qilish zarur " +
            "boʻlgan hollar mustasno.",
        },
      ],
    },
    {
      id: "security",
      heading: "Maʻlumotlar xavfsizligi",
      blocks: [
        {
          type: "p",
          text:
            "Biz zamonaviy axborot xavfsizligi standartlari va Oʻzbekiston Respublikasi " +
            "qonunchiligi talablariga mos keladigan tashkiliy va texnik himoya choralarini " +
            "qoʻllaymiz.",
        },
        {
          type: "list",
          items: [
            "Uzatishda shifrlash: Xizmat bilan barcha ulanishlar HTTPS/TLS protokoli bilan himoyalangan.",
            "Kirishni nazorat qilish: shaxsga doir maʻlumotlarga faqat vakolatli xodimlarga faqat ularning mansab vazifalari doirasida kirish huquqi beriladi.",
            "Hisob maʻlumotlarini himoya qilish: parollar va OTP-kodlar ochiq shaklda saqlanmaydi; kriptografik usullar qoʻllaniladi; bir martalik kodlar cheklangan amal qilish muddatiga ega.",
            "Xavfsizlik monitoringi: anomaliyalar, ruxsatsiz kirish va boshqa tahdidlarni aniqlash uchun infratuzilmani uzluksiz nazorat qilish.",
          ],
        },
        {
          type: "p",
          text:
            "Koʻrilayotgan chora-tadbirlarga qaramay, internetda biron bir maʻlumot " +
            "uzatish va saqlash tizimi mutlaq xavfsizlikni kafolatlay olmaydi. Agar " +
            "xavfsizlik buzilishi haqida bilib qolsangiz, darhol support@avino.uz " +
            "manziliga xabar bering.",
        },
      ],
    },
    {
      id: "rights",
      heading: "Subyekt huquqlari",
      blocks: [
        {
          type: "p",
          text:
            "Oʻzbekiston Respublikasining «Shaxsga doir maʻlumotlar toʻgʻrisida»gi " +
            "ZRU-547-son Qonuniga muvofiq siz shaxsga doir maʻlumotlaringizga nisbatan " +
            "quyidagi huquqlarga egasiz:",
        },
        {
          type: "list",
          items: [
            "Kirish huquqi — Operator qanday shaxsga doir maʻlumotlarni qayta ishlayotgani va qanday asosda ekanligi haqida maʻlumot olish.",
            "Toʻgʻrilash huquqi — notoʻgʻri yoki toʻliq boʻlmagan maʻlumotlarga oʻzgartirish kiritish.",
            "Oʻchirish huquqi — maʻlumotlarni keyingi saqlash uchun qonuniy asos boʻlmasa ishlov berishni toʻxtatish va ularni oʻchirishni talab qilish.",
            "Blokirovka huquqi — nizoni koʻrib chiqish yoki maʻlumotlar ishonchliligini tekshirish davomida ishlov berishni vaqtincha toʻxtatish.",
            "Rozilikni qaytarib olish huquqi — siz istalgan vaqtda rozilikni qaytarib olishingiz mumkin; bu qaytarib olishdan oldin amalga oshirilgan qonuniy ishlov berishning haqiqiyligiga taʻsir qilmaydi.",
          ],
        },
        {
          type: "p",
          text:
            "Yuqorida sanab oʻtilgan huquqlardan birini amalga oshirish uchun " +
            "[EMAIL ОПЕРАТОРА ДАННЫХ] manziliga ismingizni, kontakt maʻlumotlaringizni " +
            "va murojaatingiz mohiyatini koʻrsatib yozma soʻrov yuboring. " +
            "Soʻrovni koʻrib chiqish muddati uni qabul qilgan kundan boshlab «[…]» ish kunini tashkil etadi.",
        },
      ],
    },
    {
      id: "minors",
      heading: "Voyaga yetmaganlar maʻlumotlari",
      blocks: [
        {
          type: "p",
          text:
            "Xizmat faqat 18 yoshga toʻlgan shaxslar uchun moʻljallangan. " +
            "Biz bolalarning shaxsga doir maʻlumotlarini ongli va maqsadli ravishda " +
            "yigʻmaymiz va qayta ishlamaymiz.",
        },
        {
          type: "p",
          text:
            "Agar voyaga yetmagan shaxs Xizmatda roʻyxatdan oʻtgani yoki bizga shaxsga " +
            "doir maʻlumotlarini taqdim etgani maʻlum boʻlsa, iltimos, bu haqda " +
            "support@avino.uz manziliga xabar bering. Biz bunday maʻlumotlarni " +
            "zudlik bilan oʻchirib tashlash uchun chora koʻramiz.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Siyosatga oʻzgartirishlar",
      blocks: [
        {
          type: "p",
          text:
            "Operator ushbu Siyosatga istalgan vaqtda oʻzgartirish kiritish huquqiga ega. " +
            "Joriy tahrir doimo avino.uz/privacy sahifasida mavjud. " +
            "Oxirgi yangilanish sanasi hujjat boshidagi «Oxirgi yangilanish» maydonida koʻrsatiladi.",
        },
        {
          type: "p",
          text:
            "Shaxsga doir maʻlumotlar subyektlarining huquqlarini qoʻzgʻatuvchi muhim " +
            "oʻzgartirishlar haqida Operator foydalanuvchilarni Xizmat interfeysi orqali — " +
            "axborot banneri yoki boshqa koʻzga yaqqol koʻrinadigan usul bilan — " +
            "oʻzgartirishlar kuchga kirgunga qadar xabardor qiladi.",
        },
        {
          type: "p",
          text:
            "Yangilangan Siyosat eʻlon qilinganidan soʻng Xizmatdan foydalanishni davom " +
            "ettirish kiritilgan oʻzgartirishlarni qabul qilganingizni anglatadi.",
        },
      ],
    },
    {
      id: "contacts",
      heading: "Operator bilan aloqa",
      blocks: [
        {
          type: "subheading",
          text: "Shaxsga doir maʻlumotlar operatori",
        },
        {
          type: "list",
          items: [
            "[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]",
            "Yuridik manzil: [ЮР. АДРЕС]",
            "INN/OGRN: [ИНН/ОГРН]",
            "Roʻyxatdan oʻtgan sana: [ДАТА РЕГИСТРАЦИИ]",
          ],
        },
        {
          type: "subheading",
          text: "Shaxsga doir maʻlumotlar boʻyicha savollar",
        },
        {
          type: "p",
          text:
            "Shaxsga doir maʻlumotlarga ishlov berish, huquqlaringizni amalga oshirish " +
            "yoki rozilikni qaytarib olish boʻyicha savollarda qayta ishlash uchun " +
            "masʻul shaxsga murojaat qiling: [EMAIL ОПЕРАТОРА ДАННЫХ].",
        },
        {
          type: "subheading",
          text: "Umumiy qoʻllab-quvvatlash",
        },
        {
          type: "list",
          items: [
            "Email: support@avino.uz",
            "Telegram: @avino_uz",
            "Instagram: avino.uz",
            "Facebook: avino.uz",
            "YouTube: @avino_uz",
          ],
        },
      ],
    },
  ],
};
