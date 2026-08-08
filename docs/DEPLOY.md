# Bitimax — Deploy qo'llanmasi

Arxitektura ikki qismdan iborat va ular **alohida** joylashtiriladi:

| Qism | Qayerda | Nega |
|---|---|---|
| `backend/` | **Render** (Docker, `starter` plan) | Doimiy ishlaydigan process: bot long-polling + scheduler |
| `web/` | **Vercel** | Statik + SSR katalog |

> ⚠️ Backend'ni Vercel'ga qo'yib bo'lmaydi. Vercel funksiyalari so'rov tugagach o'ladi — Telegraf long-polling va `setInterval` sweeplar ishlamaydi.

---

## 0. Deploydan OLDIN: sirlarni rotatsiya qiling

Eski MongoDB paroli hujjatlarda ochiq bo'lgan (`docs/TZ-v2.md` §11.1). Deploy qilishdan oldin:

1. **Atlas → Database Access** → parolni o'zgartiring
2. **Atlas → Network Access** → `0.0.0.0/0` ni o'chiring, Render statik IP'larini qo'shing
3. **@BotFather → /revoke** → yangi BOT_TOKEN oling

## 1. Sirlarni generatsiya qiling

```bash
# Har biri uchun alohida ishga tushiring
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Kerak bo'ladigan uchta qiymat:

| O'zgaruvchi | Vazifasi |
|---|---|
| `WEBHOOK_SECRET` | SMS-gateway shu bilan autentifikatsiya qiladi |
| `INTERNAL_API_KEY` | Ichki API himoyasi |
| `ENCRYPTION_KEY` | **Akkaunt parollarini shifrlaydi** |

> 🔑 `ENCRYPTION_KEY` yo'qolsa — barcha saqlangan login/parollar **abadiy o'qib bo'lmas** holga keladi. Uni parol menejeriga yoki qog'ozga yozib, Render'dan tashqarida saqlang. Hech qachon o'zgartirmang (avval mavjud yozuvlarni qayta shifrlamasdan).

## 2. Migratsiyani ishga tushiring — backend deploydan OLDIN

Bu eng muhim qadam. Yangi kod v2 sxemasini kutadi; migratsiya qilinmagan bazada:

- eski TTL indeks tranzaksiyalarni o'chirishda **davom etadi**
- eski parollar ochiq matnda qoladi
- `EscrowHold` da `autoReleaseAt` bo'lmagani uchun avtomatik settlement ishlamaydi

```bash
# 0) MAJBURIY zaxira nusxa
mongodump --uri="<YANGI_MONGODB_URI>" --out=./backup-$(date +%F)

# 1) .env ni to'ldiring (backend/.env.example dan nusxa oling)
cd backend
cp .env.example .env
#   → MONGODB_URI, ENCRYPTION_KEY, BOT_TOKEN, ADMIN_CHAT_ID, ... ni yozing

# 2) Migratsiya (bir necha marta ishga tushirish xavfsiz)
npm run migrate
```

Kutilayotgan natija:

```
▶ Bitimax v1 → v2 migration
  ✓ Dropped TTL index "expireAt_1" — expired transactions are now retained
  ✓ Encrypted credentials for N product(s)
  ✓ Backfilled deadlines for N escrow hold(s)
  ✓ Generated referral codes for N user(s)
  ✓ Marked N stale pending transaction(s) as expired
  ✓ Seeded opening balances for N user(s)
✓ Ledger and cached balances agree
```

Oxirgi qator `⚠ N account(s) still drift` bo'lsa — **deploy qilmang**, avval sababni toping.

## 3. Backend → Render

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. `dilb3k/Bitimax-backend` repozitoriyasini tanlang
3. Render `render.yaml` ni topadi va `bitimax-backend` servisini taklif qiladi
4. `sync: false` belgilangan har bir o'zgaruvchi uchun qiymat so'raydi:

| O'zgaruvchi | Qiymat |
|---|---|
| `MONGODB_URI` | Yangi (rotatsiya qilingan) Atlas URI |
| `BOT_TOKEN` | @BotFather dan yangi token |
| `ADMIN_CHAT_ID` | `5583276966` |
| `WEBHOOK_SECRET` | 1-qadamda generatsiya qilingan |
| `INTERNAL_API_KEY` | 1-qadamda generatsiya qilingan |
| `ENCRYPTION_KEY` | 1-qadamda generatsiya qilingan (migratsiyada ishlatilgani bilan **bir xil**) |
| `PAYMENT_CARDS` | `[{"id":"c1","number":"8600...","holder":"ISM F","bank":"Kapitalbank","active":true}]` |
| `SITE_URL` | Vercel domeni, masalan `https://bitimax.vercel.app` |
| `CORS_ORIGINS` | Xuddi shu domen |
| `BOT_USERNAME` | `bitimax_bot` |
| `SUPPORT_USERNAME` | `bitimax_admin` |

5. **Apply** → Render Docker image'ni build qiladi va ishga tushiradi

Tekshirish:

```bash
curl https://bitimax-backend.onrender.com/health
# {"status":"ok","service":"bitimax-api","version":"1.0.0"}
```

Render logida ko'rinishi kerak:

```
[DB] MongoDB connected successfully
[Server] Bitimax API running on port 3001
[Bot] Bitimax bot started (long polling)
[Jobs] Scheduler started with 5 jobs
```

> 💡 **`free` planni tanlamang.** Bepul servis ~15 daqiqa harakatsizlikdan keyin uxlaydi: bot javob bermay qoladi, to'lov oynalari muddati o'tmaydi, escrow o'z vaqtida yopilmaydi.

## 4. Web → Vercel

Web allaqachon Vercel loyihasiga ulangan (`web/.vercel/project.json`).

```bash
cd web
npx vercel env add BACKEND_URL production
#   → https://bitimax-backend.onrender.com

npx vercel --prod
```

Yoki Vercel dashboard → Settings → Environment Variables:

| O'zgaruvchi | Qiymat |
|---|---|
| `BACKEND_URL` | `https://bitimax-backend.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | Vercel domeningiz |
| `NEXT_PUBLIC_BOT_USERNAME` | `bitimax_bot` |

## 5. SMS-Gateway sozlash

Android telefonda SMS-forwarder ilovasini o'rnating (masalan *SMS Forwarder* yoki *SMS Gateway*) va webhook sozlang:

```
URL:    https://bitimax-backend.onrender.com/api/sms-webhook
Metod:  POST
Body:   {"secret":"<WEBHOOK_SECRET>","text":"%message%","sender":"%from%","received_at":"%sentStamp%"}
```

Tekshirish (haqiqiy pul harakatlanmaydi — mos keladigan buyurtma bo'lmasa `unmatched` bo'ladi):

```bash
curl -X POST https://bitimax-backend.onrender.com/api/sms-webhook \
  -H "Content-Type: application/json" \
  -d '{"secret":"<WEBHOOK_SECRET>","text":"Hisobingizga 1 234 som tushdi","sender":"TEST"}'
```

Kutilgan javob: `{"success":false,"message":"No matching pending transaction found","reason":"no_match",...}` — va admin Telegram'ga "Egasi topilmagan to'lov" xabari keladi. Bu **to'g'ri** ishlayotganini bildiradi.

Ishlagach `SMS_ALLOWED_SENDERS` ga bankingiz shortcode'ini qo'shing.

## 6. Birinchi bitimni sinash

Deploydan keyin, real pul bilan **eng arzon** test bitimini o'tkazing:

1. Ikkita Telegram akkaunt: biri sotuvchi, biri xaridor
2. Sotuvchi 1 000 so'mlik e'lon qo'yadi → admin moderatsiyada tasdiqlaydi
3. Xaridor sotib oladi → **aniq summa** ni o'tkazadi
4. Bot 1–2 daqiqada "To'lov qabul qilindi" xabarini yuborishi kerak
5. "🔑 Ma'lumotlarni ochish" → login/parol chiqadi
6. "✅ Tasdiqlayman" → sotuvchi balansiga 930 so'm tushadi
7. Admin botda **📊 Statistika** → `Platforma daromadi: 70 UZS`

Har bir qadam ishlasa — tizim to'liq ishlayapti.

## 7. Deploydan keyin kuzatish

Har kuni admin botda tekshiring:

| Ko'rsatkich | Bo'lishi kerak | Bo'lmasa |
|---|---|---|
| 📥 Egasi topilmagan to'lovlar | **0** | SMS parsing yoki oyna muddati muammosi |
| Balans drifti (avtomatik xabar) | **hech qachon kelmasligi** | Kod pulni ledgerdan tashqari ko'chiryapti |
| 🛡 Moderatsiya navbati | bo'sh | Sotuvchilar kutmoqda |
| 💸 To'lov so'rovlari | 24 soat ichida yopilgan | Foydalanuvchi ishonchi |

---

## Muammolarni bartaraf qilish

| Belgi | Sabab | Yechim |
|---|---|---|
| Bot javob bermaydi | Render `free` planda uxlab qolgan | `starter` ga o'ting |
| `Credential could not be decrypted` | `ENCRYPTION_KEY` migratsiyadagidan farq qiladi | To'g'ri kalitni qaytaring |
| To'lov tasdiqlanmayapti | SMS matni regexga mos emas | Render logida `[SMS Webhook]` ni ko'ring; `PaymentInbox` da xom matn saqlangan |
| Muddati o'tgan tranzaksiyalar yo'qolyapti | TTL indeks hali o'chirilmagan | `npm run migrate` ni ishga tushiring |
| `Missing required environment variable` | Render'da sir kiritilmagan | Blueprint'dagi `sync: false` ro'yxatini tekshiring |
