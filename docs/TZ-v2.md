# Bitimax — Texnik Topshiriq v2.0

**P2P Escrow (kafil) va raqamli mahsulotlar bozori**

| | |
|---|---|
| **Versiya** | 2.0 (v1.0 TZ asosida qayta ishlangan) |
| **Sana** | 2026-08-08 |
| **Holat** | Kritik qismlar implement qilingan — quyida "Bajarilgan ishlar" bo'limiga qarang |
| **Stek** | Node.js + TypeScript · Express · MongoDB (Mongoose) · Telegraf · Next.js 14 |

---

## 0. Nima uchun v2.0 kerak bo'ldi

v1.0 TZ yaxshi mahsulot g'oyasini tasvirlaydi, lekin uni to'g'ridan-to'g'ri implement qilish platformani **birinchi haftada bankrot qiladi**. Sabab bitta emas — sanab o'tilgan biznes-qoidalar bir-biriga qarama-qarshi.

Eng muhim qarama-qarshilik:

> v1.0 TZ, 1-bo'lim: *"Xaridorga aytiladi: **Akkaunt ma'lumotlarini darhol o'zingizga to'liq o'zgartirib oling!**"*
>
> v1.0 TZ, 3-bo'lim: *"0–10 minut oralig'ida qaytarilsa — xaridorga puli **to'liq** qaytariladi."*

Bu ikki qoida birgalikda quyidagi bepul hujumni yaratadi:

```
1. Xaridor akkauntni sotib oladi        →  pul escrow'ga tushadi
2. Login/parolni oladi                  →  TZ o'zi "darhol o'zgartir" deydi
3. Emailni, parolni, tiklash kodini      →  akkaunt endi butunlay xaridorda,
   o'ziga o'zgartiradi (2 daqiqa)           sotuvchi kira olmaydi
4. "Qaytarish" tugmasini bosadi          →  100% pul qaytariladi
5. Natija: akkaunt xaridorda, pul ham xaridorda. Sotuvchi 0 oladi.
6. Takrorlash: cheksiz.
```

Bu xato "bug" emas — **TZ darajasidagi loyihalash xatosi**. Uni kod bilan tuzatib bo'lmaydi, biznes-mantiqni o'zgartirish kerak. v2.0 ning asosiy vazifasi shu.

---

## 1. v1.0 TZ dagi kritik kamchiliklar

### 1.1 Moliyaviy: va'da qilingan summa ≠ to'langan summa

v1.0 mantiqiga ko'ra platforma komissiyasi xaridorning qaytarilishidan **ham** ushlanadi. Natijada bot xaridorga bir summani aytadi, kassa boshqasini to'laydi:

| Vaziyat | v1.0 xabari xaridorga | v1.0 aslida to'laydi | Farq |
|---|---|---|---|
| 0–10 daqiqa | "To'liq qaytariladi" (100%) | **93%** | −7% |
| 10 daq – 2 soat | "Qolgan 90% qaytariladi" | **83%** | −7% |
| 2 – 24 soat | "Qolgan 50% qaytariladi" | **43%** | −7% |

1 000 000 so'mlik bitimda bu har bir qaytarishda 70 000 so'm "yo'qolgan pul" — va xaridor uchun bu aldov. Marketplace uchun ishonchni yo'qotishning eng tez usuli.

**v2.0 yechimi:** xaridorning ulushi — **buzilmas va'da**. Platforma komissiyasini faqat xaridor yo'qotgan (jarima) qismidan oladi. Batafsil: § 3.3.

### 1.2 Pul yo'qoladi: mos kelmagan SMS o'chib ketadi

v1.0 webhook mantiqi: SMS keldi → summa bo'yicha kutayotgan tranzaksiya izlanadi → topilmasa `{success: false}` qaytariladi va **xabar tashlab yuboriladi**.

Lekin pul allaqachon bankka tushgan. Quyidagi har bir holatda mijozning puli izsiz yo'qoladi:

- xaridor 11-daqiqada o'tkazdi (10 daqiqalik oyna yopilgan)
- xaridor summani noto'g'ri kiritdi (50 247 emas, 50 240)
- SMS-gateway internet uzilishi tufayli 20 daqiqa kechikib yubordi
- bank SMS matn formatini o'zgartirdi va regex mos kelmadi

Bundan yomoni: **hech kim buni bilib ham olmaydi.** Log ham, yozuv ham qolmaydi.

**v2.0 yechimi:** `PaymentInbox` — har bir kelgan SMS saqlanadi (mos kelgan, dublikat, tanilmagan). Tanilmaganlar admin navbatiga tushadi va scheduler 15 daqiqada bir eslatib turadi. Batafsil: § 4.2.

### 1.3 Pul mangu yo'qoladi: TTL indeks tranzaksiyani o'chiradi

v1.0 `Transaction` sxemasida:

```ts
expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
```

Bu MongoDB'ga *"muddati o'tgan tranzaksiya hujjatini o'chir"* deydi. Ya'ni 10 daqiqa o'tgach buyurtma haqidagi **barcha ma'lumot yo'qoladi**: kim, nimani, qancha summaga kutgan edi. § 1.2 dagi kechikkan to'lovni endi hech qachon tiklab bo'lmaydi.

**v2.0 yechimi:** TTL indeks olib tashlandi; scheduler statusni `expired` ga o'zgartiradi, yozuv qoladi. Migratsiya indeksni aniq `dropIndex` qiladi (Mongoose o'zi o'chirmaydi).

### 1.4 Xavfsizlik: `toJSON` teskari ishlaydi

v1.0 `Product` modelida:

```ts
ProductSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (this.status !== 'sold' && this.status !== 'refunded') {
    delete obj.sensitiveData;   // ❌ faqat sotilmaganlarda o'chiradi
  }
  return obj;
};
```

Shart teskari yozilgan: mahsulot **sotilgan** bo'lsa `sensitiveData` **saqlanadi**. Ya'ni sotilgan mahsulotni qaytaradigan har qanday endpoint login va parolni ochiq beradi. Hozircha route'larda `.select('-sensitiveData')` bor, lekin bu bitta unutilgan `select` narxi — barcha akkauntlar oqib ketishi.

### 1.5 Xavfsizlik: parollar ochiq matnda

Login, parol va tiklash kodlari MongoDB'da **shifrlanmagan** saqlanadi. Bazaning bir dumpi = har bir sotuvchining tirik akkaunti. O'zbekistonda hosting va DB kirish nazorati odatda kuchsiz — bu real risk, nazariy emas.

### 1.6 Buxgalteriya yo'q: balans `$inc` bilan boshqariladi

v1.0 pulni `User.findByIdAndUpdate(id, { $inc: { balance: x } })` bilan ko'chiradi. Bu quyidagilarni imkonsiz qiladi:

- balans nega shunday ekanini tushuntirish (audit)
- nizoda "bu pul qayerdan keldi" savoliga javob berish
- xatoni topish — noto'g'ri raqam shunchaki noto'g'ri raqam bo'lib qoladi
- moliyaviy hisobot (platforma daromadi qancha? escrow'da qancha pul turibdi?)

Bundan tashqari `totalSpent: -refundToBuyer` — xarid vaqtida `totalSpent` **hech qachon oshirilmaydi**, shuning uchun qaytarishda u **manfiy** bo'lib ketadi.

**v2.0 yechimi:** ikki yozuvli (double-entry) o'zgarmas ledger. Batafsil: § 4.

### 1.7 Qaytarish — pul emas, "do'kon krediti"

v1.0 da "xaridorga pul qaytariladi" = `balance` maydoni oshadi. **Pulni yechish mexanizmi yo'q.** Ya'ni xaridor pulini hech qachon qaytarib ola bilmaydi. Bu qonuniy va reputatsion muammo.

**v2.0 yechimi:** `Payout` modeli va to'liq yechish oqimi. Batafsil: § 5.

### 1.8 TZ da yozilgan, lekin implement qilinmagan qoidalar

| v1.0 TZ qoidasi | v1.0 kodda |
|---|---|
| "10 daqiqalik `pending_payment` taymeri" | Taymer yo'q — hech narsa muddatni tekshirmaydi |
| "1 kundan o'tsa pul sotuvchining balansiga o'tkaziladi" | Hech narsa avtomatik o'tkazmaydi |
| Sotuvchi bloklash | `isBlocked` maydoni bor, lekin **hech qayerda o'qilmaydi** |

Ya'ni bloklangan firibgar bloklanmagandek ishlashda davom etadi.

### 1.9 UX xatosi: xaridor ko'rmasdan tasdiqlashi kerak

v1.0 buyer oqimi: `confirm_escrow_<id>` tugmasi **bir vaqtda** (a) pulni sotuvchiga o'tkazadi va (b) login/parolni ko'rsatadi.

Ya'ni xaridor nima sotib olganini ko'rish uchun **avval pulni berishi** kerak. Escrow'ning butun ma'nosi shu bilan yo'qoladi.

**v2.0 yechimi:** "Ochish" va "Tasdiqlash" — ikkita alohida qadam. Batafsil: § 3.2.

### 1.10 Boshqa aniqlangan xatolar

| Muammo | Ta'sir |
|---|---|
| Bir mahsulotni ikki xaridor bir vaqtda sotib olishi mumkin (rezervatsiya yo'q) | Ikkisi ham to'laydi, biri qoladi |
| `admin_ban_` regexi `admin_ban_seller_` ni yutib yuboradi | Bloklash tugmasi hech qachon ishlamaydi |
| SMS summa regexi `\d{1,6}` — 999 999 dan katta summalar | 1 mln+ sotuvlar tasdiqlanmaydi |
| Telegraf sessiyasi xotirada | Deploy = barcha yarim to'ldirilgan e'lonlar yo'qoladi |
| SMS dublikat tekshiruvi yo'q | Gateway qayta yuborsa — ikki marta ishlov |
| `Math.random()` unikal summa uchun | Bashorat qilinadigan → boshqa buyurtmani "o'zlashtirish" |
| Kategoriya — erkin matn | "Instagram", "instagram", "Инстаграм" — 3 xil filtr |
| Moderatsiya yo'q | Soxta e'lon darhol katalogda |
| Xaridorga sotuvchining `telegramId` si ko'rsatiladi | Platformadan tashqariga chiqib ketish + PII oqishi |
| Test yo'q | Pul ko'chiradigan kod 0% qoplangan |
| **MongoDB paroli TZ matnida ochiq** | **Darhol rotatsiya kerak** — § 11.1 |

---

## 2. Mahsulot strategiyasi: nima ustunlik beradi

Escrow bozorida g'olib eng arzon komissiya emas, **eng kam firibgarlik** bo'lgan platforma bo'ladi. Xaridor uchun ham, sotuvchi uchun ham. v2.0 ning barcha qarorlari shu o'qqa qurilgan.

### 2.1 Asosiy differensiatorlar

| # | Ustunlik | Nega raqobatchilarda yo'q |
|---|---|---|
| 1 | **"Ko'r tasdiqlash" yo'q** — avval ko'rasiz, keyin tasdiqlaysiz | Telegram guruh-bozorlarida odatda pul oldin |
| 2 | **Vaqt ochilgandan boshlanadi** — to'lovdan emas | Xaridor uxlab yotganida jarima o'sib ketmaydi |
| 3 | **Va'da qilingan foiz = to'langan foiz** | Yashirin komissiyalar yo'q |
| 4 | **Ochilmagan buyurtma 100% qaytariladi** — muddatsiz | Ishonch signali |
| 5 | **Sotuvchi ham himoyalangan** — dalil bilan nizo ochadi | Faqat xaridorni himoya qiladigan tizim sotuvchini qochiradi |
| 6 | **Har bir tiyin ledger'da** — balansni tushuntirib berish mumkin | Nizoda dalil |
| 7 | **Ishonch darajalari** — yangi sotuvchiga limit | "Dump-and-run" iqtisodiy jihatdan foydasiz |
| 8 | **Moderatsiya** — e'lon avval ko'rikdan o'tadi | Bitta soxta e'lon 100 ta halolining ishonchini yeydi |
| 9 | **Pul yechish real ishlaydi** | Ko'p mahalliy loyihalarda "balans" — chiqib ketmaydigan raqam |
| 10 | **Ma'lumotlar shifrlangan + muddatdan keyin o'chiriladi** | GDPR-uslub gigiena, mahalliy bozorda kamdan-kam |

### 2.2 Ikki tomonlama ishonch: eng muhim g'oya

Ko'pchilik escrow loyihasi faqat **xaridorni** himoya qiladi. Natija: halol sotuvchilar ketadi, faqat firibgarlar qoladi, bozor o'ladi.

v2.0 ikkalasini ham himoya qiladi:

**Xaridor himoyasi**
- pul escrow'da, tasdiqlamaguncha sotuvchiga o'tmaydi
- ochishdan oldin cheksiz kutish mumkin
- ochilmagan buyurtma har qachon 100% qaytariladi
- 24 soatlik siyosat oynasi

**Sotuvchi himoyasi**
- xaridor ma'lumotni ochgani **vaqt bilan qayd etiladi** (`credentialsRevealedAt`, `credentialRevealCount`)
- xaridor qaytargan bo'lsa ham, sotuvchi dalil bilan **nizo ochib** pulni qaytarib olishi mumkin
- 3+ qaytarish/30 kun qilgan xaridor **avtomatik qaytarishni yo'qotadi** — arbitrajga tushadi
- jarima pulining asosiy qismi (93%) sotuvchiga kompensatsiya bo'lib boradi

Ya'ni § 0 dagi hujum endi ishlamaydi: xaridor akkauntni o'zlashtirib qaytarsa, sotuvchi dalil (parol o'zgargani, kirish loglari) bilan nizo ochadi va pulni oladi; xaridor esa "refund farmer" sifatida belgilanadi.

---

## 3. Biznes-mantiq v2.0

### 3.1 Buyurtma holatlar mashinasi

```mermaid
stateDiagram-v2
    [*] --> pending_payment: xaridor "Sotib olish"<br/>(mahsulot rezerv qilinadi)

    pending_payment --> paid: bank SMS mos keldi
    pending_payment --> expired: 10 daqiqa o'tdi<br/>(rezerv bo'shatiladi)

    paid --> holding: EscrowHold yaratildi<br/>pul kafilda

    state holding {
        [*] --> yopiq: ma'lumot ochilmagan
        yopiq --> ochiq: xaridor "Ochish" bosdi<br/>⏱ VAQT SHU YERDA BOSHLANADI
    }

    holding --> completed: xaridor tasdiqladi<br/>yoki 24 soat o'tdi
    holding --> refunded: siyosat bo'yicha qaytarish
    holding --> refunded: 72 soat ochilmadi<br/>→ 100% qaytariladi
    holding --> disputed: nizo ochildi

    disputed --> completed: arbitraj sotuvchi foydasiga
    disputed --> refunded: arbitraj xaridor foydasiga

    completed --> [*]
    refunded --> [*]
    expired --> [*]
```

**Muhim:** `holding` ichidagi `yopiq → ochiq` o'tishi — butun tizimning yuragi. Qaytarish taymeri **shu daqiqadan** boshlanadi, to'lovdan emas.

### 3.2 Xaridor oqimi: "Ochish" va "Tasdiqlash" ajratilgan

v1.0 da bitta tugma ikki ishni qilardi. v2.0 da uchta aniq qadam:

```mermaid
sequenceDiagram
    participant X as Xaridor
    participant B as Bot
    participant E as Escrow
    participant S as Sotuvchi

    X->>B: "Sotib olish"
    B->>B: mahsulotni rezerv qiladi (atomik)
    B-->>X: aniq summa + karta + 10 daq taymer

    Note over X: bank orqali o'tkazma

    B->>E: SMS mos keldi → escrow yaratildi
    B-->>X: ✅ To'lov qabul qilindi<br/>[🔑 Ma'lumotlarni ochish]

    Note over X: shoshilmasa, kutishi mumkin<br/>ochilmaguncha jarima yo'q

    X->>B: [🔑 Ochish]
    B->>E: credentialsRevealedAt = now()<br/>⏱ taymer boshlandi
    B-->>X: login / parol / tiklash kodi<br/>+ "avval TEKSHIRING, o'zgartirmang"
    B-->>S: 👀 xaridor ma'lumotni ochdi

    Note over X: akkauntni tekshiradi

    alt Hammasi joyida
        X->>B: [✅ Tasdiqlayman]
        B->>E: escrow → sotuvchiga
        B-->>X: "endi parolni o'zgartiring"
        B-->>S: 💰 balansga tushdi
    else Muammo bor
        X->>B: [🔄 Qaytarish]
        B-->>X: aniq hisob-kitob ko'rsatiladi
        X->>B: sabab + tasdiq
        B->>E: siyosat bo'yicha taqsimlash
        B-->>S: kompensatsiya + nizo ochish havolasi
    end
```

Xaridorga ko'rsatiladigan matn ketma-ketligi ham muhim:

> 1️⃣ Avval akkauntga **kiring va tekshiring** (hech narsani o'zgartirmang)
> 2️⃣ Hammasi joyida bo'lsa — **"Tasdiqlayman"** ni bosing
> 3️⃣ **Faqat shundan keyin** parol/emailni o'zingizga o'zgartiring
>
> *Agar tasdiqlashdan oldin ma'lumotlarni o'zgartirsangiz va keyin qaytarish so'rasangiz, sotuvchi dalil taqdim etib nizoni yutib olishi mumkin.*

Bu bitta paragraf § 0 dagi hujumni iqtisodiy jihatdan xatarli qiladi.

### 3.3 Qaytarish matematikasi (tuzatilgan)

**Formula:**

```
jarimaPuli    = summa × jarimaFoizi
xaridorgaQaytadi = summa − jarimaPuli          ← xabardagi foiz AYNAN shu
platformaOladi   = jarimaPuli × komissiya      ← faqat jarimadan!
sotuvchiOladi    = jarimaPuli − platformaOladi
```

**1 000 000 so'm uchun jadval (komissiya 7%):**

| Davr | Jarima | **Xaridorga** | Sotuvchiga | Platformaga | Jami |
|---|---:|---:|---:|---:|---:|
| Ochilmagan (muddatsiz) | 0% | **1 000 000** | 0 | 0 | 1 000 000 |
| 0–10 daqiqa | 0% | **1 000 000** | 0 | 0 | 1 000 000 |
| 10 daq – 2 soat | 10% | **900 000** | 93 000 | 7 000 | 1 000 000 |
| 2 – 24 soat | 50% | **500 000** | 465 000 | 35 000 | 1 000 000 |
| 24 soatdan keyin | ✕ | **0** | 930 000 | 70 000 | 1 000 000 |
| Muvaffaqiyatli bitim | — | 0 | 930 000 | 70 000 | 1 000 000 |

**Bu modelning uch xossasi:**

1. **Xabar = haqiqat.** "90% qaytariladi" deyilsa, aynan 900 000 keladi.
2. **Platforma bekor qilingan bitimdan ko'proq daromad qilmaydi.** Muvaffaqiyatli bitim 70 000 beradi; hech bir qaytarish undan oshmaydi. Ya'ni platformaning manfaati foydalanuvchiga qarshi qaratilmagan. Bu test bilan qat'iy tekshiriladi.
3. **Pul yaratilmaydi va yo'qolmaydi.** To'rtta ulush har doim aniq summaga teng — bu ham test bilan har bir davr va har xil summalar uchun tekshiriladi.

### 3.4 Vaqt hisobi: nega ochilgandan boshlanadi

To'lov **avtomatik** tasdiqlanadi — bank SMS keladi, tizim ishlaydi. Xaridor bu paytda uxlab yotgan bo'lishi mumkin.

Agar taymer to'lovdan boshlansa: xaridor tunda 23:00 da o'tkazma qildi, SMS 23:02 da keldi, ertalab 09:00 da botni ochdi → allaqachon **10 soat** o'tgan, ya'ni "2–24 soat" darajasi, **50% jarima**. Hech narsa qilmagan odam uchun.

Shuning uchun v2.0 da:

| Hodisa | Vaqt maydoni | Rol |
|---|---|---|
| To'lov tasdiqlandi | `boughtAt` | Buxgalteriya, hisobot |
| Ma'lumot ochildi | `credentialsRevealedAt` | **Qaytarish taymeri** |
| Ochilmagan holat muddati | `autoReleaseAt` = boughtAt + 72s | 100% qaytariladi |
| Ochilgan holat muddati | `autoReleaseAt` = revealedAt + 24s | Sotuvchiga o'tadi |

### 3.5 Firibgarlikka qarshi qatlamlar

| Qatlam | Mexanizm | Nimani to'sadi |
|---|---|---|
| **Rezervatsiya** | Atomik `findOneAndUpdate` | Ikki xaridor bir mahsulotga to'lashi |
| **Unikal summa** | CSPRNG + DB unique indeks | Boshqa buyurtmani "o'zlashtirish" |
| **Moderatsiya** | `pending_review` → `active` | Soxta e'lon katalogga chiqishi |
| **Ishonch darajalari** | Narx chegarasi + e'lon limiti | Yangi akkauntdan mass-dump |
| **Reveal audit** | `credentialsRevealedAt`, `credentialRevealCount` | Nizoda dalil |
| **Refund farming detektori** | 30 kunlik oyna, 3+ → arbitraj | Takroriy "sotib ol → o'zlashtir → qaytar" |
| **Nizo tizimi** | Dalil + arbitraj + SLA | Bir tomonlama qaror |
| **Bloklash amalda** | Har bir kirishda tekshiriladi + e'lonlar arxivlanadi | Bloklangan firibgar ishlashda davom etishi |
| **Debit SMS filtri** | Kirim/chiqim markerlari | O'z kartamiz yechilganini "to'lov" deb hisoblash |
| **SMS dublikat** | sha256 fingerprint | Bir SMS ikki marta ishlov ko'rishi |

**Ishonch darajalari jadvali:**

| Daraja | Narx chegarasi | Faol e'lon | Qanday olinadi |
|---|---:|---:|---|
| `new` | 300 000 | 3 | Ro'yxatdan o'tish |
| `verified` | 1 500 000 | 25 | 5 muvaffaqiyatli bitim, nizosiz |
| `trusted` | 5 000 000 | 100 | 25 bitim, <5% qaytarish |
| `partner` | cheksiz | 500 | Qo'lda tasdiqlash |

### 3.6 Nizo (arbitraj) oqimi

```mermaid
flowchart LR
    A[Nizo ochildi] --> B[Qarshi tomonga xabar<br/>responseDueAt]
    B --> C{Dalil keldimi?}
    C -->|Ha| D[under_review]
    C -->|Yo'q, muddat o'tdi| D
    D --> E{Arbitr qarori}
    E -->|Xaridor haq| F[resolved_buyer<br/>100% xaridorga]
    E -->|Sotuvchi haq| G[resolved_seller<br/>sotuvchiga + komissiya]
    E -->|Ikkisi ham qismann| H[resolved_split<br/>qo'lda taqsimlash]
    F --> I[settleByArbitration]
    G --> I
    H --> I
```

Nizo kategoriyalari: `not_working`, `wrong_info`, `already_recovered` (asl egasi qaytarib oldi), `seller_fraud`, `buyer_fraud`, `other`.

Har bir arbitraj qarori `settleByArbitration()` orqali o'tadi — ya'ni ledger'da qayd etiladi va summalar balanslanishi majburiy.

---

## 4. Moliyaviy arxitektura: ikki yozuvli ledger

### 4.1 Nega kerak

Pul ko'chiradigan tizimda balans **hisoblanadigan fakt** bo'lishi kerak, o'zgaruvchi raqam emas. `LedgerEntry` — o'zgarmas jurnal: hech qachon `update` yoki `delete` qilinmaydi, tuzatish — yangi teskari yozuv.

**Hisob nomlari:**

| Hisob | Ma'nosi |
|---|---|
| `user:<id>:available` | Foydalanuvchining yechib olinadigan balansi |
| `escrow:<holdId>` | Aniq bir buyurtma uchun bloklangan pul |
| `platform:revenue` | Platforma daromadi (komissiya + ushlangan jarima) |
| `external:bank` | Tashqi dunyo (bank). Pul kirsa debet, chiqsa kredit |

Har bir yozuv postinglari **aniq nolga teng** bo'lishi shart — bu sxema darajasida validator bilan majburlangan.

### 4.2 Misol: 1 000 000 so'mlik bitim

**To'lov tushdi:**

| Hisob | Summa |
|---|---:|
| `external:bank` | −1 000 000 |
| `escrow:<hold>` | +1 000 000 |

**Xaridor tasdiqladi:**

| Hisob | Summa |
|---|---:|
| `escrow:<hold>` | −1 000 000 |
| `user:<seller>:available` | +930 000 |
| `platform:revenue` | +70 000 |

**Yoki 10% jarima bilan qaytardi:**

| Hisob | Summa |
|---|---:|
| `escrow:<hold>` | −1 000 000 |
| `user:<buyer>:available` | +900 000 |
| `user:<seller>:available` | +93 000 |
| `platform:revenue` | +7 000 |

### 4.3 Idempotentlik

Har bir yozuvda **unikal `key`** bor: `payment:<txId>`, `release:<holdId>`, `refund:<holdId>`, `payout_reserve:<payoutId>`. Bir xil biznes-hodisa ikki marta kelsa (dublikat webhook, qayta ishga tushgan job) — `key` da to'qnashuv bo'ladi va operatsiya **no-op** bo'ladi, pul ikki marta ko'chmaydi.

### 4.4 Reconciliation (moslashtirish)

`User.balance` — ledger'ning **keshi**, tezkor o'qish uchun. Har soatda `reconcileBalances()` jobi ikkisini solishtiradi. Farq topilsa — admin darhol ogohlantiriladi.

> Bu platformaning yong'in signalizatsiyasi. Farq bor degani: qaysidir kod pulni jurnaldan tashqari ko'chirgan. Bunday narsani mijoz shikoyatidan bilib olish — payments tizimi uchun eng yomon holat.

---

## 5. To'lov tizimi

### 5.1 Kiruvchi to'lov (SMS gateway)

```mermaid
flowchart TD
    A[Bank SMS] --> B[Android SMS-Gateway]
    B -->|HTTPS POST + secret| C[/api/sms-webhook]
    C --> D{Secret to'g'rimi?<br/>timing-safe}
    D -->|Yo'q| Z[403]
    D -->|Ha| E[PaymentInbox: fingerprint yozish]
    E --> F{Dublikatmi?}
    F -->|Ha| Y[200 duplicate — no-op]
    F -->|Yo'q| G{Kirim SMS mi?}
    G -->|Chiqim/debit| X[status: ignored]
    G -->|Kirim| H[Summani ajratish]
    H --> I{Summa topildimi?}
    I -->|Yo'q| X
    I -->|Ha| J[Atomik claim:<br/>pending + summa + muddat ichida]
    J --> K{Mos keldimi?}
    K -->|Ha| L[escrow yaratish + ledger<br/>xaridorga xabar 🔑]
    K -->|Yo'q| M[status: unmatched<br/>⚠️ ADMIN NAVBATI]
```

**Kritik qoida:** hech bir SMS tashlab yuborilmaydi. `unmatched` — bu operatsion vazifa, xato emas.

### 5.2 Xavfsizlik choralari

| Chora | Nima uchun |
|---|---|
| `timingSafeEqual` secret uchun | Javob vaqti bo'yicha secret'ni topib bo'lmaydi |
| 20 so'rov/daqiqa limit | Brute-force |
| `SMS_ALLOWED_SENDERS` allowlist | Faqat bank shortcode'laridan |
| sha256 fingerprint | Dublikat yuborish |
| Kirim/chiqim marker filtri | O'z kartamizdan yechilgani "to'lov" bo'lib qolmaydi |
| CSPRNG unikal summa | Bashorat qilib bo'lmaydi |
| DB partial unique indeks | Ikki `pending` bir summani baham ko'rmaydi |

**SMS parsing** uch tilni qo'llaydi — o'zbek, rus (kirill) va rus (lotin transliteratsiya), chunki O'zbekiston banklari kartaning til sozlamasiga qarab uchchalasini ham yuboradi (`списан` / `Spisano` / `yechildi`).

### 5.3 Karta rotatsiyasi

`PAYMENT_CARDS` — JSON ro'yxat. Har bir buyurtma tasodifiy kartaga yo'naltiriladi. Sabab: bitta shaxsiy kartaning kunlik aylanmasi bank limitidan oshsa — karta muzlatiladi va butun platforma to'xtaydi.

### 5.4 Kelajak: pluggable provayderlar

`PaymentProvider` interfeysi orqali keyinchalik Payme / Click / Uzum qo'shiladi. SMS-gateway — bootstrap yechim (rasmiy merchant talab qilmaydi), lekin oxirgi maqsad emas. Interfeys bir xil bo'lgani uchun escrow mantiqi o'zgarmaydi.

### 5.5 Chiquvchi to'lov (pul yechish)

```mermaid
flowchart LR
    A[Karta saqlash<br/>AES-256-GCM] --> B[Yechish so'rovi]
    B --> C{balance >= summa?<br/>shartli dekrement}
    C -->|Yo'q| D[Rad: yetarli emas]
    C -->|Ha| E[Pul REZERV qilinadi<br/>ledger: payout_reserved]
    E --> F[Admin navbati]
    F --> G{Admin qarori}
    G -->|To'landi| H[status: paid<br/>audit yoziladi]
    G -->|Rad| I[payout_reverted<br/>pul balansga qaytadi]
```

**Nega rezerv so'rov vaqtida:** aks holda foydalanuvchi bitta balansga o'nta so'rov yuborishi va admin navbatni tez ishlasa — o'ntasi ham to'lanishi mumkin.

Karta raqami shifrlangan saqlanadi; admin uni ko'rsa — `payout.destination_revealed` audit yoziladi.

---

## 6. Ma'lumotlar modeli

| Kolleksiya | Vazifasi | v2.0 da qo'shildi |
|---|---|---|
| `User` | Foydalanuvchi, balans keshi, ishonch, statistika | trustLevel, sellerStats, buyerStats, payoutCard, refundAutoDisabled, referralCode, language |
| `Product` | E'lon + **shifrlangan** ma'lumotlar | moderationStatus, reservedBy/Until, attributes, credentialsPurgedAt, viewCount |
| `Transaction` | To'lov kutish yozuvi | cardId, paidAt, cancelReason · **TTL o'chirildi** |
| `EscrowHold` | Kafildagi pul | **credentialsRevealedAt**, credentialRevealCount, autoReleaseAt, refundDeadlineAt, disputeId, buyerRating |
| `LedgerEntry` 🆕 | O'zgarmas ikki yozuvli jurnal | — |
| `PaymentInbox` 🆕 | Har bir kelgan SMS (yo'qolmasligi uchun) | — |
| `Payout` 🆕 | Pul yechish so'rovi | — |
| `Dispute` 🆕 | Nizo + dalillar + arbitraj | — |
| `AuditLog` 🆕 | Imtiyozli amallar jurnali | — |
| `BotSession` 🆕 | Telegraf sessiyasi (Mongo'da) | — |

**Indekslar** — har biri aniq so'rov shakli uchun:

```
Product:      {status, category, createdAt} · {status, price} · text(title,description,tags)
              {status, reservedUntil}          ← rezerv tozalash jobi
Transaction:  {uniqueAmount} unique partial(pending) · {status, expireAt}
EscrowHold:   {status, autoReleaseAt}           ← avtomatik settlement jobi
LedgerEntry:  {key} unique · {postings.account, createdAt}
PaymentInbox: {hash} unique · {status, receivedAt}
```

---

## 7. Xavfsizlik

### 7.1 Ma'lumotlarni shifrlash

`login`, `password`, `recoveryCode`, `additionalInfo` va payout kartalari **AES-256-GCM** bilan shifrlanadi.

Format: `v1:<iv>:<tag>:<ciphertext>` — versiya prefiksi kelajakda algoritm/kalit rotatsiyasini big-bang migratsiyasiz qilish imkonini beradi.

GCM tanlanganining sababi: **autentifikatsiya tegi**. O'zgartirilgan yozuv shifrdan chiqmaydi — ya'ni buzilgan record xaridorga "login" sifatida axlat berib qo'ymaydi.

> ⚠️ `ENCRYPTION_KEY` yo'qolsa — barcha saqlangan ma'lumotlar o'qib bo'lmas holga keladi. Repodan tashqarida zaxira nusxa saqlang.

### 7.2 Ma'lumotlarni o'chirish

Bitim yopilganidan `CREDENTIAL_RETENTION_DAYS` (default 30) kun keyin ma'lumotlar butunlay o'chiriladi. Sotuvchining tirik parolini abadiy saqlash — foydasi yo'q, riski katta.

### 7.3 Boshqa choralar

| Chora | Holat |
|---|---|
| `toJSON` — `sensitiveData` **har doim** o'chiriladi | ✅ tuzatildi |
| Ma'lumotni o'qishning yagona yo'li — `getCredentials()` | ✅ |
| Callback_data ownership tekshiruvi | ✅ har bir pul handler'ida |
| `escapeHtml` foydalanuvchi matni uchun | ✅ HTML injection |
| Internal API `x-internal-key` bilan | ✅ |
| Rate limiting (global + webhook) | ✅ |
| `helmet`, CORS allowlist | ✅ |
| Xato xabarlari prod'da umumlashtirilgan | ✅ |
| Sotuvchining `telegramId` si public API'da yo'q | ✅ tuzatildi |
| Audit log imtiyozli amallar uchun | ✅ |
| Bloklangan foydalanuvchi kirishda to'siladi | ✅ tuzatildi |

---

## 8. Texnik arxitektura

### 8.1 Hozirgi holat (Faza 1 — 1 process)

```
┌──────────────────────────────────────────┐
│  bitimax-backend  (bitta process)        │
│                                          │
│  Express API  ──┐                        │
│  Telegraf bot ──┼── bitta Mongo ulanish  │
│  Scheduler    ──┘                        │
└──────────────────────────────────────────┘
         ▲                    ▲
         │                    │
   Next.js (Vercel)    Android SMS-Gateway
```

Bitta deploy — MVP uchun to'g'ri qaror: arzon, oddiy, kuzatish oson.

### 8.2 Scale yo'li (Faza 3+)

```
                    ┌── API replikalari (JOBS_ENABLED=false)
Load balancer ──────┤
                    └── Bot (webhook rejimi)

                    ┌── Worker (JOBS_ENABLED=true, bitta)
                    └── Redis (session, rate limit, queue)
```

Kod allaqachon shunga tayyor:
- `JOBS_ENABLED` — faqat bitta instans sweeplarni bajaradi
- Sessiya Mongo'da — replikalar baham ko'radi
- Barcha pul operatsiyalari atomik va idempotent — bir necha instans xavfsiz

### 8.3 Kod strukturasi

```
backend/src/
├── config/          # env, refund siyosati jadvali, kartalar
├── models/          # 10 ta Mongoose modeli
├── services/
│   ├── paymentService    # rezerv, SMS, reveal, settlement
│   ├── refundEngine      # siyosat + matematika (toza funksiyalar)
│   ├── ledgerService     # ikki yozuvli jurnal
│   ├── payoutService     # pul yechish
│   └── notificationService
├── jobs/scheduler    # muddat, avtomatik settlement, reconciliation
├── routes/           # public catalog + internal API + webhook
├── bot/              # handlers, keyboards, wizards
├── utils/            # crypto, helpers (+ testlar)
└── scripts/migrate   # v1 → v2 migratsiya
```

**Ajratish printsipi:** `refundEngine` — toza funksiyalar, DB'ga tegmaydi. Shuning uchun butun pul matematikasi mock'siz test qilinadi. Barcha escrow settlement bitta `settleEscrow()` orqali o'tadi — ya'ni ledger va status o'zgarishi har doim bitta tranzaksiyada va har doim balanslangan.

---

## 9. Web platforma (Next.js)

### 9.1 Rollar taqsimoti

| Kanal | Uchun |
|---|---|
| **Telegram bot** | Tranzaksiya: sotib olish, ochish, tasdiqlash, sotish |
| **Web katalog** | Kashfiyot: SEO, filtrlash, taqqoslash, sotuvchi profili |
| **Mini App** | Bot ichida boy UI: katalog, buyurtmalar, hamyon |

Sabab: Telegram bot ichida 500 ta e'lonni filtrlash noqulay; web'da to'lov qilish esa Telegram identifikatsiyasidan ayriladi. Ikkisi bir-birini to'ldiradi.

### 9.2 API endpointlari

| Endpoint | Vazifa |
|---|---|
| `GET /api/products` | Katalog: sahifalash, kategoriya, **text search**, narx oralig'i |
| `GET /api/products/categories` | Kategoriyalar + har biridagi son |
| `GET /api/products/stats` | Landing sahifa raqamlari |
| `GET /api/products/:id` | Bitta e'lon + sotuvchi reytingi (`viewCount` oshadi) |

`$regex` dan **text indeks**ga o'tildi — `$regex` har bir qidiruvda butun kolleksiyani skan qiladi, katalog o'sishi bilan ishlamay qoladi.

### 9.3 Rejalashtirilgan (Faza 2)

- Telegram Mini App `initData` HMAC validatsiyasi → to'liq autentifikatsiya
- Sotuvchi profil sahifasi (reyting, tarix, ishonch darajasi)
- SEO: har bir e'lon uchun SSR + JSON-LD
- Bir martalik "credential reveal" havolasi (TTL bilan) — Telegram chat tarixida parol qolmasligi uchun

---

## 10. Operatsion panel (admin bot)

| Bo'lim | Ko'rsatadi |
|---|---|
| 📊 Statistika | Ledger'dan: daromad, escrow'dagi pul + e'tibor talab qiladigan navbatlar |
| 🛡 Moderatsiya | Ko'rikdagi e'lonlar + sotuvchi tarixi → tasdiq/rad |
| 💸 To'lov so'rovlari | Yechish navbati, karta ko'rsatish (audit bilan), to'landi/rad |
| 📥 To'lov inbox | **Egasi topilmagan to'lovlar** — eng muhim navbat |
| ⚖️ Nizolar | SLA bo'yicha tartiblangan, dalillar bilan |
| 👥 Foydalanuvchilar | Statistika, bloklash |

Bloklash tugmasi endi **haqiqatan ishlaydi** va e'lonlarni ham arxivlaydi — aks holda bloklangan firibgarning akkauntlari katalogda sotilishda davom etadi.

---

## 11. Deploy va migratsiya

### 11.1 ⚠️ DARHOL: sirlarni rotatsiya qilish

v1.0 TZ matnida **MongoDB parolining ochiq nusxasi** bor edi:

```
mongodb+srv://dilbekshermatov_db_user:CJJcux5O6RxpSQvL@bitimax.ueqfgj1.mongodb.net/...
```

Bu parol chat, hujjat va (ehtimol) git tarixidan o'tgan. **Bajarilishi kerak:**

1. MongoDB Atlas → Database Access → parolni o'zgartiring
2. Atlas → Network Access → faqat server IP'sini qoldiring (`0.0.0.0/0` emas)
3. Yangi `MONGODB_URI` ni faqat `.env` da saqlang (`.gitignore` da allaqachon)
4. BOT_TOKEN ni ham @BotFather orqali yangilang (bir joyda oqqan sirlar odatda birga oqadi)
5. `git log -p | grep -i "mongodb+srv"` bilan tarixni tekshiring

### 11.2 Migratsiya qadamlari

```bash
# 0. ZAXIRA NUSXA (majburiy — migratsiya ma'lumotlarni joyida qayta yozadi)
mongodump --uri="$MONGODB_URI" --out=./backup-$(date +%F)

# 1. Yangi env o'zgaruvchilari
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
# .env ga: ENCRYPTION_KEY, PAYMENT_CARDS, MIN_PAYOUT_AMOUNT, ...

# 2. Migratsiya (bir necha marta xavfsiz ishga tushirish mumkin)
cd backend && npm run migrate

# 3. Tekshirish
npm run typecheck && npm test

# 4. Ishga tushirish
npm run dev
```

**Migratsiya nima qiladi:**

| Qadam | Amal |
|---|---|
| 1 | `transactions.expireAt` TTL indeksini **o'chiradi** (Mongoose o'zi o'chirmaydi) |
| 2 | Barcha ochiq matndagi ma'lumotlarni shifrlaydi |
| 3 | `EscrowHold` uchun `autoReleaseAt` / `refundDeadlineAt` ni to'ldiradi |
| 4 | Referal kodlar generatsiya qiladi |
| 5 | Muddati o'tgan `pending` tranzaksiyalarni `expired` qiladi |
| 6 | Mavjud balanslar uchun ledger'da "opening balance" yozuvlari yaratadi |
| 7 | Reconciliation tekshiruvini ishga tushiradi |

6-qadam muhim: aks holda reconciliation jobi barcha mavjud foydalanuvchini "drift" deb hisoblaydi.

---

## 12. Bajarilgan ishlar (bu sessiyada)

| # | Ish | Fayl(lar) |
|---|---|---|
| 1 | Refund matematikasi tuzatildi + siyosat jadvali config'ga chiqarildi | `services/refundEngine.ts`, `config/index.ts` |
| 2 | Ikki yozuvli ledger + reconciliation | `models/LedgerEntry.ts`, `services/ledgerService.ts` |
| 3 | AES-256-GCM shifrlash; `toJSON` oqishi tuzatildi | `utils/crypto.ts`, `models/Product.ts` |
| 4 | `PaymentInbox` — pul yo'qolmaydi; TTL o'chirildi | `models/PaymentInbox.ts`, `models/Transaction.ts` |
| 5 | Atomik rezervatsiya + scheduler (muddat, avto-settlement, reconciliation, purge) | `services/paymentService.ts`, `jobs/scheduler.ts` |
| 6 | Payout, Dispute, AuditLog, BotSession modellari + payoutService | `models/*`, `services/payoutService.ts` |
| 7 | Reveal/Confirm ajratildi; vaqt ochilgandan boshlanadi | `bot/handlers/buyer.ts`, `models/EscrowHold.ts` |
| 8 | Moderatsiya, ishonch darajalari, reyting, refund-farming detektori | `bot/handlers/*`, `models/User.ts` |
| 9 | Bloklash amalda ishlaydi; `admin_ban` regex xatosi tuzatildi | `bot/index.ts`, `bot/handlers/admin.ts` |
| 10 | SMS: 3 tilda parsing, debit filtri, dublikat fingerprint, CSPRNG | `utils/helpers.ts` |
| 11 | Katalog: text indeks, PII olib tashlandi, narx filtri | `routes/products.ts` |
| 12 | **28 ta test** — refund invariantlari, SMS parsing, kriptografiya | `*.test.ts` |
| 13 | v1 → v2 migratsiya skripti | `scripts/migrate.ts` |

**Holat:** `npm run typecheck` → 0 xato · `npm test` → 28/28 o'tdi

---

## 13. Roadmap

### Faza 2 — Ishonch va konversiya (2–3 hafta)

| Ish | Nega |
|---|---|
| Nizo oqimini botda to'liq ulash (dalil yuklash, arbitraj UI) | Model bor, interfeys kerak |
| Telegram Mini App + `initData` auth | Web'da to'lov qilish imkoniyati |
| Bir martalik reveal havolasi (TTL) | Parol Telegram tarixida qolmasligi |
| Sotuvchi profil sahifasi + reyting | Konversiya |
| Rus tili (i18n) | Bozorning ~40% |
| Sotuvchi depoziti (kafolat puli) | Yuqori narxli e'lonlar uchun |

### Faza 3 — Miqyos (1–2 oy)

| Ish | Nega |
|---|---|
| Payme / Click / Uzum integratsiyasi | SMS-gateway — vaqtinchalik yechim |
| Redis (session, rate limit, queue) | Bir necha instans |
| Bot webhook rejimi | Long-polling gorizontal scale qilmaydi |
| Sentry + strukturalangan loglar + metrikalar | Kuzatuvchanlik |
| Avtomatik akkaunt tekshiruvi (login botlari) | Soxta e'lonni oldindan aniqlash |
| Referal programma | O'sish |

### Faza 4 — Bozorni kengaytirish

| Ish |
|---|
| Boshqa kategoriyalar: obuna, gift-card, o'yin ichidagi buyumlar |
| Sotuvchilar uchun API |
| Ommaviy e'lon yuklash (CSV/API) |
| Mobil ilova (React Native) |
| Ko'p valyutali qo'llash |

---

## 14. Unit ekonomika

**Faraz:** o'rtacha bitim 400 000 so'm, komissiya 7%, qaytarish darajasi 8%.

| Ko'rsatkich | Qiymat |
|---|---:|
| O'rtacha bitim | 400 000 so'm |
| Platforma daromadi (muvaffaqiyatli) | 28 000 so'm |
| Qaytarishlarning aralash daromadi | ~1 500 so'm |
| **Effektiv daromad / bitim** | **~25 900 so'm** |

**Oylik proyeksiya:**

| Kunlik bitim | Oylik aylanma | Oylik daromad |
|---:|---:|---:|
| 10 | 120 mln | ~7.8 mln |
| 50 | 600 mln | ~38.9 mln |
| 200 | 2.4 mlrd | ~155 mln |

**Xarajatlar (oylik, taxminan):** server ~300k · MongoDB Atlas ~400k · SMS-gateway telefon ~100k · moderator/support (50+ bitim/kun dan) ~4 mln

**Break-even:** ~kuniga 2–3 bitim.

### 14.1 Ehtiyot bo'lish kerak bo'lgan raqam

**Qaytarish darajasi** — eng muhim metrika. 15% dan oshsa, muammo texnik emas, **sotuvchi sifati**da: moderatsiyani qattiqlashtirish va ishonch darajalarini pasaytirish kerak.

---

## 15. KPI va monitoring

| Metrika | Maqsad | Nima signal beradi |
|---|---:|---|
| Qaytarish darajasi | < 8% | Sotuvchi sifati |
| Nizo darajasi | < 2% | Moderatsiya samaradorligi |
| Arbitraj o'rtacha vaqti | < 12 soat | Support yuklamasi |
| **Egasi topilmagan to'lovlar** | **0** | SMS parsing / oyna muddati |
| **Balans drifti** | **0** | Ledger integratsiyasi buzilgan |
| To'lov tasdiqlash vaqti | < 2 daqiqa | Gateway ishonchliligi |
| Reveal → tasdiq konversiyasi | > 85% | Akkaunt sifati |
| Muddati o'tgan to'lovlar | < 20% | Oyna juda qisqa yoki UX chalkash |

Oxirgi ikkitasi (`unmatched = 0`, `drift = 0`) — **qattiq invariantlar**. Nolga teng bo'lmasa, pul yo'qolgan yoki hisob-kitob buzilgan degani; qolgan hammasidan muhimroq.

---

## 16. Xulosa

v1.0 TZ to'g'ri mahsulotni tasvirlaydi. v2.0 uni **ishlaydigan** qiladi:

1. **§ 0 hujumi yopildi** — reveal audit + nizo tizimi + refund-farming detektori
2. **Moliyaviy halollik** — va'da qilingan foiz aynan to'lanadi; platforma bekor bitimdan ko'p daromad qilmaydi
3. **Pul yo'qolmaydi** — har bir SMS saqlanadi, TTL o'chirildi, ledger + reconciliation
4. **Escrow ma'noga ega bo'ldi** — avval ko'rasiz, keyin tasdiqlaysiz
5. **Adolatli vaqt** — taymer siz ma'lumotni ochganda boshlanadi
6. **Pul chiqib ketadi** — real yechish oqimi
7. **Ikki tomonlama himoya** — sotuvchi ham dalil bilan kurashishi mumkin
8. **Ma'lumot xavfsizligi** — shifrlash + avtomatik o'chirish + audit

---

*Bitimax TZ v2.0 · 2026-08-08*
