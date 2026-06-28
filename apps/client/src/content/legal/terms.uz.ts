import type { LegalDoc } from './types';

/**
 * Xizmat qoidalari Avino — o'zbek tili varianti.
 * Manba: terms.ru.ts (kanonik rus tili nusxasi).
 * Bu rasmiy huquqiy hujjat emas; keyingi yuridik tahrir uchun ishchi qoralama.
 */
export const termsUz: LegalDoc = {
  title: "Xizmat qoidalari",
  updatedAt: "2026-06-29",
  intro:
    "Ushbu Qoidalar Oʻzbekistondagi koʻchmas mulk eʻlonlari onlayn platformasi — Avino " +
    "xizmatidan foydalanishni tartibga soladi. Iltimos, xizmatdan foydalanishni boshlashdan " +
    "oldin ularni diqqat bilan oʻqib chiqing.",
  sections: [
    {
      id: "general",
      heading: "Umumiy qoidalar",
      blocks: [
        {
          type: "p",
          text:
            "Avino — avino.uz domenida mavjud boʻgan koʻchmas mulk eʻlonlarini joylashtirish " +
            "va qidirish onlayn xizmatidir. Xizmat foydalanuvchilarga Oʻzbekiston Respublikasi " +
            "hududida turar-joy va tijorat koʻchmas mulkini sotish, ijaraga berish va sotib " +
            "olish boʻyicha eʻlonlar joylashtirish imkonini beradi.",
        },
        {
          type: "p",
          text:
            "Xizmat operatori «[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]» " +
            "(keyingi oʻrinlarda — «Avino», «Operator», «biz») boʻlib, u quyidagi manzil " +
            "boʻyicha roʻyxatdan oʻtgan: [ЮР. АДРЕС], INN/OGRN: [ИНН/ОГРН], " +
            "roʻyxatdan oʻtgan sana: [ДАТА РЕГИСТРАЦИИ].",
        },
        {
          type: "subheading",
          text: "Atamalar",
        },
        {
          type: "list",
          items: [
            "«Foydalanuvchi» — Xizmatda roʻyxatdan oʻtgan yoki undan foydalanadigan har qanday jismoniy yoki yuridik shaxs.",
            "«Eʻlon» — Foydalanuvchi tomonidan Xizmatda joylashtiriladigan koʻchmas mulk obʻyekti haqidagi tuzilgan maʻlumot.",
            "«Xizmat» — avino.uz va bogʻliq mobil ilovalar orqali mavjud boʻgan dasturiy taʻminot, kontent, interfeyslar va infratuzilma majmui.",
            "«Moderatsiya» — Operatorning eʻlonni ochiq nashrdan oldin yoki shikoyatdan keyin tekshirish jarayoni.",
          ],
        },
        {
          type: "p",
          text:
            "Ushbu Qoidalar ommaviy taklif (oferta) hisoblanadi. Xizmatda roʻyxatdan oʻtish, " +
            "eʻlon joylashtirish yoki Xizmatdan boshqa har qanday foydalanish Qoidalarni " +
            "toʻliq va soʻzsiz qabul qilishni anglatadi. Agar siz biron-bir shartga rozi " +
            "boʻlamasangiz — iltimos, Xizmatdan foydalanmang.",
        },
      ],
    },
    {
      id: "account",
      heading: "Hisob va rollar",
      blocks: [
        {
          type: "p",
          text:
            "Eʻlon joylashtirish va kengaytirilgan funksiyalarga kirish uchun roʻyxatdan oʻtish " +
            "talab etiladi. Foydalanuvchi quyidagi usullardan biri bilan hisob yaratishi mumkin: " +
            "SMS-kod orqali tasdiqlangan telefon raqami (Eskiz provayderi), shuningdek Google, " +
            "Apple yoki Telegram orqali OAuth-avtorizatsiya.",
        },
        {
          type: "subheading",
          text: "Foydalanuvchi rollari",
        },
        {
          type: "p",
          text: "Faoliyatning xarakteriga qarab foydalanuvchiga quyidagi rollardan biri beriladi:",
        },
        {
          type: "list",
          items: [
            "USER — asosiy rol; roʻyxatdan oʻtgandan keyin mavjud.",
            "OWNER — oʻz nomidan eʻlon joylashtiradigan koʻchmas mulk egasi.",
            "AGENT — mijozlar manfaatlarini ifodalovchi xususiy riyeltor.",
            "AGENCY — bir nechta agentlarni boshqarish imkoniyatiga ega koʻchmas mulk agentligi hisobi.",
            "LANDLORD — obʻyektlarni muntazam ijaraga beradigan ijaraberuvchi.",
            "PROPERTY_MANAGER — mulk boshqaruvchi kompaniya yoki mulk egasining ishonchli vakili.",
          ],
        },
        {
          type: "p",
          text:
            "Foydalanuvchi roʻyxatdan oʻtishda toʻliq maʻlumot taqdim etishi va oʻzgarganda " +
            "yangilashi shart. Foydalanuvchi hisob maʻlumotlarining (login va parol/OTP) " +
            "xavfsizligi uchun toʻliq javobgar. Hisobga ruxsatsiz kirish holatlari haqida " +
            "support@avino.uz manziliga darhol xabar berish kerak.",
        },
        {
          type: "p",
          text:
            "Har bir shaxs faqat bitta shaxsiy hisob yuritishi mumkin. Hisobga uchinchi " +
            "shaxslarga kirish huquqini berish, hisoblarni sotish yoki sotib olish, shuningdek " +
            "soxta yoki avtomatlashtirilgan (bot) hisoblar yaratish taqiqlanadi. Ushbu " +
            "talablarni buzish hisobni bloklashga olib keladi.",
        },
      ],
    },
    {
      id: "listings",
      heading: "Eʻlonlar joylashtirish va moderatsiya",
      blocks: [
        {
          type: "p",
          text:
            "Foydalanuvchi ushbu Qoidalarga rioya qilgan holda eʻlonlar joylashtirish huquqiga " +
            "ega. Eʻlon qoʻllab-quvvatlanadigan tillardan birida (oʻzbek, rus yoki ingliz) " +
            "yaratiladi va Xizmat tomonidan avtomatik ravishda qolgan ikki tilga tarjima " +
            "qilinadi. Foydalanuvchi avtomatik tarjimani qoʻlda tahrirlashi mumkin.",
        },
        {
          type: "subheading",
          text: "Moderatsiya jarayoni",
        },
        {
          type: "p",
          text: "Har bir eʻlon nashrdan soʻng majburiy moderatsiyadan oʻtadi. Mumkin boʻgan holatlar:",
        },
        {
          type: "list",
          items: [
            "NEW — Eʻlon tekshiruvga yuborilgan va moderator qarorini kutmoqda.",
            "ACTIVE — Eʻlon moderatsiyadan oʻtgan va qidiruvda koʻrsatiladi.",
            "DRAFT — Eʻlon qoralama sifatida saqlangan va nashr etilmagan.",
            "REJECTED — Eʻlon Qoidalar buzilganligi sababli rad etilgan.",
            "DELETED — Eʻlon Operator yoki Foydalanuvchi tomonidan oʻchirilgan.",
          ],
        },
        {
          type: "p",
          text:
            "Operator ushbu Qoidalar buzilgan taqdirda istalgan vaqtda eʻlonni rad etish yoki " +
            "olib tashlash huquqiga ega. Asoslangan tushuntirish soʻrov boʻyicha taqdim etiladi, " +
            "ammo Operator tekshiruv jarayonining ichki tafsilotlarini oshkor qilishga majbur emas.",
        },
        {
          type: "subheading",
          text: "Eʻlonga qoʻyiladigan talablar",
        },
        {
          type: "list",
          items: [
            "Maʻlumot ishonchli boʻlishi va haqiqatan mavjud koʻchmas mulk obʻyektiga tegishli boʻlishi kerak.",
            "Fotosuratlar aynan eʻlonda taʻriflangan obʻyektni aks ettirishi kerak.",
            "Narx joriy va haqiqiy taklifga mos kelishi kerak.",
            "Joylashuv (manzil, koordinatlar) aniq koʻrsatilishi kerak.",
            "Bir xil obʻyekt haqida takroriy eʻlonlar joylashtirish taqiqlanadi.",
          ],
        },
      ],
    },
    {
      id: "prohibited",
      heading: "Taqiqlangan kontent va xatti-harakatlar",
      blocks: [
        {
          type: "p",
          text:
            "Jamiyat xavfsizligi va ishonchini taʻminlash maqsadida Xizmatda quyidagi " +
            "harakatlar va kontent turlari qatʻiyan taqiqlanadi:",
        },
        {
          type: "list",
          items: [
            "Yolgʻon, chalgʻituvchi yoki firibgarlik eʻlonlari joylashtirish.",
            "Huquq egasining ruxsatisiz boshqalarning fotosuratlarini yoki boshqa himoyalangan kontentidan foydalanish.",
            "Fotosuratlar ustida bevosita kontakt maʻlumotlarini (telefon raqamlari, elektron pochta manzillari) joylashtirish.",
            "Bir xil obʻyekt haqida takroriy eʻlonlar nashr etish.",
            "Chat yoki Xizmatning boshqa funksiyalari orqali boshqa foydalanuvchilarga spam yuborish.",
            "Boshqa foydalanuvchilarga haqorat qilish, kamsituvchi bayonotlar berish yoki taʻqib qilish.",
            "Oʻzbekiston Respublikasi qonunchiligiga koʻra bitimlar taqiqlangan obʻyektlarni taklif qilish.",
            "Obʻyekt maʻlumotlarini ataylab buzib koʻrsatish orqali moderatsiya tizimini chetlab oʻtishga yoki aldashga urinish.",
            "Operatorning yozma ruxsatisiz Xizmatdan maʻlumotlarni avtomatlashtirilgan ravishda toʻplash (scraping).",
            "Xizmatdan zararli dasturlarni tarqatish yoki fishing hujumlarini amalga oshirish uchun foydalanish.",
          ],
        },
        {
          type: "p",
          text:
            "Yuqoridagi taqiqlarni buzish eʻlonning zudlik bilan olib tashlanishiga olib keladi. " +
            "Tizimli yoki qoʻpol buzishlar sodir boʻlganda Operator oldindan ogohlantirmasdan " +
            "Foydalanuvchi hisobini vaqtincha yoki butunlay bloklash, shuningdek qonun koʻzda " +
            "tutgan hollarda qonunni muhofaza qiluvchi organlarni xabardor qilish huquqiga ega.",
        },
      ],
    },
    {
      id: "promotion",
      heading: "Pullik reklamalashtirish",
      blocks: [
        {
          type: "p",
          text:
            "Xizmat eʻlonlarni qidiruv natijalarida va bosh sahifada koʻrinarliroq qilish " +
            "imkonini beruvchi pullik reklamalashtirish xizmatlarini taqdim etishi mumkin. " +
            "Xizmatning hozirgi rivojlanish bosqichida reklamalashtirish cheklangan tarzda " +
            "mavjud va Foydalanuvchining soʻroviga koʻra Operator tomonidan qoʻlda " +
            "faollashtirilishi mumkin.",
        },
        {
          type: "list",
          items: [
            "VIP — qidiruv natijalari roʻyxatida eʻlonni maxsus ajratib koʻrsatish.",
            "TOP — eʻlonni kategoriya tepasida mustahkamlash.",
          ],
        },
        {
          type: "p",
          text:
            "Reklamalashtirish faqat eʻlonning koʻrinuvchanligiga va koʻrsatilish " +
            "ustuvorligiga taʻsir qiladi. Reklamalashtirish toʻlovi majburiy moderatsiyani " +
            "almashtirmaydi: eʻlon toʻliq faktidan qatʻi nazar ushbu Qoidalarga mos kelishi kerak.",
        },
        {
          type: "p",
          text:
            "Reklamalashtirning foydalanilmagan davri uchun mablagʻlarni qaytarish tartibi " +
            "Xizmatga ulanganda toʻliq sahifasida eʻlon qilinadigan alohida shartlar bilan " +
            "tartibga solinadi. Bunday shartlar eʻlon qilinmaguncha qaytarish support@avino.uz " +
            "manziliga murojaat asosida individual tartibda koʻrib chiqiladi.",
        },
      ],
    },
    {
      id: "chat",
      heading: "Chat va muloqot",
      blocks: [
        {
          type: "p",
          text:
            "Xizmat foydalanuvchilar — potentsial xaridor/ijarachilar va eʻlon mualliflari " +
            "oʻrtasida toʻliq muloqot uchun oʻrnatilgan messenjer (chat) taqdim etadi. " +
            "Chat faqat muayyan obʻyekt boʻyicha bitim shartlarini muhokama qilish uchun moʻljalangan.",
        },
        {
          type: "subheading",
          text: "Chatdan foydalanish qoidalari",
        },
        {
          type: "list",
          items: [
            "Chatda reklama, spam yoki obʻyektga aloqador boʻlmagan xabarlar yuborish taqiqlanadi.",
            "Chatni firibgarlik maqsadlarida, jumladan rasmiy rasmiylashtirilgan kelishuvlardan tashqari oldindan toʻlovlarni soʻrash uchun ishlatish taqiqlanadi.",
            "Ruxsatisiz uchinchi shaxslarning shaxsiy maʻlumotlarini chatda nashr qilish taqiqlanadi.",
            "Haqorat, tahdid va muloqotning boshqa tajovuzkor shakllari taqiqlanadi.",
          ],
        },
        {
          type: "p",
          text:
            "Avino chat texnik infratuzilmasining provayderi boʻlib, yozishmalar tomoniga " +
            "kirmaydi va Foydalanuvchilar xabarlari mazmuni uchun javobgar emas. Nomaqbul " +
            "xabarlar olganda «Shikoyat qilish» funksiyasidan foydalaning yoki " +
            "support@avino.uz manziliga murojaat qiling.",
        },
        {
          type: "p",
          text:
            "Avino qonunchilik talablariga muvofiq yozishmalarni saqlash va ularni rasmiy " +
            "soʻrov asosida vakolatli organlarga taqdim etish huquqini oʻzida saqlab qoladi.",
        },
      ],
    },
    {
      id: "content-rights",
      heading: "Kontent huquqlari",
      blocks: [
        {
          type: "p",
          text:
            "Fotosuratlar, matnlar, tavsiflar va boshqa materiallarni eʻlon tarkibida " +
            "joylashtirish orqali Foydalanuvchi koʻrsatilgan materiallarning mualliflik huquqi " +
            "egasi ekanligini yoki ulardan ushbu kontekstda foydalanish uchun barcha zarur " +
            "ruxsatlarga ega ekanligini kafolatlaydi.",
        },
        {
          type: "p",
          text:
            "Xizmatda kontent joylashtirish orqali Foydalanuvchi Operatorga eʻlon mavjud " +
            "boʻlgan muddatning butun davri uchun quyidagilarni amalga oshirish boʻyicha " +
            "eksklyuziv boʻlmagan, bepul litsenziya beradi:",
        },
        {
          type: "list",
          items: [
            "Materiallarni Operator serverlari va bulutli infratuzilmasida saqlash.",
            "Materiallarni Xizmatda va bogʻliq tarqatish kanallarida (mobil ilovalar, hamkor vidjetlari) koʻrsatish.",
            "Eʻlon matniy tavsifini oʻzbek, rus va ingliz tillariga avtomatik tarjima qilish.",
            "Qidiruv natijalari roʻyxatida foydalanish uchun rasmlar kichik koʻrinishini (preview) yaratish.",
          ],
        },
        {
          type: "p",
          text:
            "Ushbu litsenziya Operatorga Foydalanuvchining alohida roziligisiz tijorat " +
            "maqsadlarida uchinchi shaxslarga kontent sotish yoki oʻtkazish huquqini bermaydi. " +
            "Eʻlon oʻchirilgandan soʻng Operator qonunchilikda belgilangan muddat davomida " +
            "texnik nusxalarni saqlash huquqiga ega.",
        },
      ],
    },
    {
      id: "liability",
      heading: "Tomonlarning javobgarligi",
      blocks: [
        {
          type: "p",
          text:
            "Avino axborot vositachi boʻlib: Xizmat eʻlonlarni joylashtirish va qidirish uchun " +
            "texnik platforma taqdim etadi, ammo Foydalanuvchilar oʻrtasidagi hech qanday " +
            "bitimning tomoni hisoblanmaydi. Operator koʻchmas mulk obʻyektlarining huquqiy " +
            "tozaligini tekshirmaydi va Foydalanuvchilar tomonidan eʻlonlarda koʻrsatilgan " +
            "maʻlumotlarning toʻliqligini kafolatlamaydi.",
        },
        {
          type: "p",
          text: "Operator quyidagi holatlar natijasida yuzaga kelgan zarar uchun javobgar emas:",
        },
        {
          type: "list",
          items: [
            "Uchinchi shaxslarning, jumladan boshqa Xizmat foydalanuvchilarining harakatlari yoki harakatsizligi.",
            "Foydalanuvchilar tomonidan eʻlonlarda notoʻliq yoki toʻliq boʻlmagan maʻlumot taqdim etilishi.",
            "Foydalanuvchilar tomonidan noqulay shartlarda bitimlar tuzilishi yoki shartnomalarning lozim darajada bajarilmasligi.",
            "Texnik sabablarga koʻra, shuningdek Operatordan bogʻliq boʻlmagan sabablarga koʻra (force majeure) Xizmatning vaqtincha mavjud boʻlmasligi.",
          ],
        },
        {
          type: "subheading",
          text: "Xavfsiz bitim boʻyicha tavsiyalar",
        },
        {
          type: "list",
          items: [
            "Shartnomani imzolashdan oldin koʻchmas mulk obʻyektiga oid huquq belgilash hujjatlarini doimo tekshiring.",
            "Pul oʻtkazishdan oldin obʻyektni shaxsan koʻrishni tashkil qiling.",
            "Oldindan toʻlov soʻrovlariga ehtiyot boʻling: qonuniy koʻchmas mulk bitimlari rasmiy shartnoma tuzilmaguncha avans talab qilmaydi.",
            "Shubha tugʻlilganda yurist yoki litsenziyalangan riyeltorga murojaat qiling.",
          ],
        },
        {
          type: "p",
          text:
            "Xizmat «xuddi shundayligicha» (as-is) asosida taqdim etiladi. Operator Xizmatning " +
            "uzluksiz ishlashi, muayyan maqsadlarga yaroqliligi yoki xatolardan xoliligi " +
            "boʻyicha aniq yoki nazarda tutilgan kafolatlar bermaydi.",
        },
      ],
    },
    {
      id: "ip",
      heading: "Avino intellektual mulki",
      blocks: [
        {
          type: "p",
          text:
            "«Avino» savdo belgisi, logotipi, korporativ uslubi, interfeys dizayni, manba kodi, " +
            "eʻlonlar maʻlumotlar bazasi tuzilmasi, qidiruv va tavsiya algoritmlari, shuningdek " +
            "Operator tomonidan yaratilgan intellektual mulkning boshqa obʻyektlari " +
            "«[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]» ga tegishli yoki qonuniy asosda foydalaniladi.",
        },
        {
          type: "p",
          text: "Operatorning yozma ruxsatisiz quyidagilar taqiqlanadi:",
        },
        {
          type: "list",
          items: [
            "Korporativ uslubning, interfeysning yoki Xizmat kontentining har qanday elementlarini nusxalash, koʻpaytirish yoki tarqatish.",
            "«Avino» brendini reklama, tijorat yoki boshqa maqsadlarda ishlatish.",
            "Xizmatdan avtomatlashtirilgan maʻlumot toʻplash (parsing, scraping) amalga oshirish.",
            "Xizmat materiallaridan aniq ruxsatsiz hosilat asarlar yaratish.",
          ],
        },
        {
          type: "p",
          text:
            "Foydalanuvchilar shaxsiy, notijorat maqsadlarda ijtimoiy tarmoqlar va " +
            "messenjerlarda Xizmat sahifalariga havolalar ulashish huquqiga ega. Har qanday " +
            "boshqa foydalanish support@avino.uz manzilida Operator bilan oldindan yozma " +
            "kelishuvni talab qiladi.",
        },
      ],
    },
    {
      id: "termination",
      heading: "Bloklash va oʻchirish",
      blocks: [
        {
          type: "p",
          text:
            "Operator quyidagi hollarda Foydalanuvchining Xizmatga kirishini cheklash, " +
            "toʻxtatish yoki bekor qilish huquqiga ega:",
        },
        {
          type: "list",
          items: [
            "Ushbu Qoidalarni, jumladan «Taqiqlangan kontent va xatti-harakatlar» boʻlimini buzish.",
            "Firibgarlik faoliyatiga shubha yoki boshqa foydalanuvchilarga zarar etkazish.",
            "Roʻyxatdan oʻtishda ataylab yolgʻon maʻlumot taqdim etish.",
            "Vakolatli organ tomonidan rasmiy soʻrov olish.",
            "Avval qayd etilgan qoidabuzarliklar mavjud boʻlganda hisobdan uzoq muddat foydalanmaslik.",
          ],
        },
        {
          type: "p",
          text:
            "Bloklash qoidabuzarlik ogʻirligiga qarab vaqtincha (Operator belgilagan muddatga) " +
            "yoki doimiy boʻlishi mumkin. Bloklash fakti va uning sabablari haqida Foydalanuvchi " +
            "hisobdagi kontakt maʻlumotlari orqali qonunchilik talablariga zid boʻlmagan " +
            "taqdirda xabardor qilinadi.",
        },
        {
          type: "p",
          text:
            "Foydalanuvchi istalgan vaqtda profil sozlamalari orqali yoki support@avino.uz " +
            "manziliga murojaat qilib hisobini oʻchirishga haqlidir. Hisob oʻchirilgandan soʻng " +
            "eʻlonlar nashrdan olinadi. Maʻlumotlar amaldagi qonunchilikda belgilangan muddatda " +
            "saqlanib, keyin yoʻq qilinadi.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Qoidalar oʻzgarishi",
      blocks: [
        {
          type: "p",
          text:
            "Operator ushbu Qoidalarga istalgan vaqtda bir tomonlama oʻzgartishlar kiritish " +
            "huquqiga ega. Joriy tahrir doimo avino.uz/terms manzilida mavjud.",
        },
        {
          type: "p",
          text:
            "Oxirgi yangilanish sanasi hujjat boshidagi «Oxirgi yangilanish» maydonida " +
            "koʻrsatiladi. Xizmatdan foydalanishning muhim shartlarini oʻzgartirishlar " +
            "kiritilishidan kamida 7 kun oldin Operator roʻyxatdan oʻtgan Foydalanuvchilarni " +
            "mavjud kontakt maʻlumotlari orqali xabardor qiladi.",
        },
        {
          type: "p",
          text:
            "Oʻzgartirishlar kuchga kirganidan soʻng Xizmatdan foydalanishni davom ettirish " +
            "Foydalanuvchining Qoidalarning yangi tahririni toʻliq qabul qilishini anglatadi. " +
            "Agar Foydalanuvchi oʻzgartirishlar bilan rozi boʻlmasa, u oʻzgartirishlar kuchga " +
            "kirish sanasigacha Xizmatdan foydalanishni toʻxtatishi va hisobini oʻchirishi kerak.",
        },
      ],
    },
    {
      id: "law",
      heading: "Qoʻllaniladigan huquq va nizolar",
      blocks: [
        {
          type: "p",
          text:
            "Ushbu Qoidalar Oʻzbekiston Respublikasi qonunchiligiga, xususan «Elektron tijorat " +
            "toʻgʻrisida»gi Qonun, «Shaxsga doir maʻlumotlar toʻgʻrisida»gi Qonun va " +
            "Oʻzbekiston Respublikasi Fuqarolik Kodeksiga muvofiq tartibga solinadi va talqin qilinadi.",
        },
        {
          type: "p",
          text:
            "Ushbu Qoidalardan yoki Xizmatdan foydalanish bilan bogʻliq barcha kelishmovchiliklar " +
            "muzokaralar yoʻli bilan hal etiladi. Buning uchun Foydalanuvchi " +
            "[EMAIL ОПЕРАТОРА ДАННЫХ] manziliga talablar mohiyati va kontakt maʻlumotlarini " +
            "koʻrsatgan holda yozma daʻvo yuboradi. Operator daʻvoni qabul qilgan kundan boshlab " +
            "30 (oʻttiz) kalendar kun ichida koʻrib chiqadi.",
        },
        {
          type: "p",
          text:
            "Agar nizo sudgacha tartibda hal etilmasa, u Oʻzbekiston Respublikasining " +
            "protsessual qonunchiligiga muvofiq Operator joylashgan yerdagi vakolatli " +
            "sudga oʻtkaziladi.",
        },
      ],
    },
    {
      id: "contacts",
      heading: "Rekvizitlar va kontaktlar",
      blocks: [
        {
          type: "subheading",
          text: "Xizmat operatori",
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
          text: "Qoʻllab-quvvatlash xizmati",
        },
        {
          type: "p",
          text:
            "Xizmat ishlashi, Qoidalar buzilishi, eʻlonlarga shikoyatlar va boshqa murojaatlar " +
            "boʻyicha bizga yozing:",
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
        {
          type: "p",
          text:
            "Biz murojaatlarga bir ish kuni ichida javob berishga harakat qilamiz. " +
            "Shaxsga doir maʻlumotlar bilan bogʻliq savollar uchun quyidagi manzildan " +
            "foydalaning: [EMAIL ОПЕРАТОРА ДАННЫХ].",
        },
      ],
    },
  ],
};
