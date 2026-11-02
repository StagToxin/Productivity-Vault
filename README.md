# ✅ Verim Asistanı

(Eski adı Productivity Vault.) Notion "Productivity Vault" şablonundan esinlenen, **offline çalışan** ve **internet gelince otomatik eşitlenen** alışkanlık / görev / proje / odak uygulaması.

| Platform | Nasıl çalışır | Güncelleme |
|---|---|---|
| Windows / macOS / Linux | Gerçek kurulum dosyası (Tauri, ~3–8 MB) | Açılışta kendisi kontrol eder, tek tıkla günceller |
| Android | Chrome → "Uygulamayı yükle" (PWA) | Otomatik, "Yeni sürüm hazır → Güncelle" |
| iPhone / iPad | Safari → Paylaş → "Ana Ekrana Ekle" (PWA) | Otomatik |

Arkadaşın için basit anlatım: **[KURULUM.md](KURULUM.md)**

---

## Özellikler

- **Bölümlü alışkanlıklar** — günde birkaç kez onaylanan alışkanlıklar (5 vakit namaz, 3 öğün, 8 bardak su, ilaç hazır şablonları); her bölümün planlanan saati ve onaylandığı saat kaydedilir, saatinde bildirim gelir
- **Geçmiş** — alışkanlık detayında yıl yıl ısı haritası, aylık başarı %, bölüm başına başarı ve ortalama saat, tarih+saatli kayıt listesi; kartlarda geçmiş aylara/haftalara gezinme
- **Kaçırılanlar** — planlı olup yapılmayan gün/bölüm/haftalar tarih ve planlanan saatleriyle; "Telafi et" ile geç olarak işaretlenir
- **Hedefli görevler** — "9 Kasım'a kadar 3 kez çalış": her tik ayrı kaydedilir, yüzde + tempo (yolunda/geride/önde); şartlar: günde 1 (takvim günü), her X saatte bir (son tikten itibaren, 1–24 sa), pomodoro şartı (göreve bağlı odak dolunca tik otomatik atılır)
- **Tekrarlayan görevler ve alt adımlar** — bitince bir sonraki aynı kimlikle oluşturulur (iki cihaz aynısını üretir, çift kayıt olmaz)
- **Proje detayı** — aktif / biten / yapılamayan görevler, 12 aylık şerit (her ay gün sayısı kadar kutu; çakışan günler koyulaşır veya renklere bölünür), Gantt planı (düzenleme modunda sürükle-bırak), **hızlı plan** (`Literatür 10g`, `Ara rapor !`, `Prototip 3hf x5`, `# Aşama`)
- **Takvimde sürükleyerek seçim** — fareyle boş alanda sürükle, telefonda yarım saniye basılı tut; seçime art arda görev/alışkanlık eklenir; mevcut etkinliklerin üstünden başlayan hareket seçim yapmaz
- **Odak planı** — toplam süre ver, dersler (20–60 dk) ve kısa/uzun molalar otomatik yerleşsin; molasız tek parça; "molalar dahil / net çalışma"; kayıtlı planlar; molayı geç; ⏱ kronometre
- **Küçük zamanlayıcı** — masaüstünde her zaman üstte duran, sürüklenebilir pencere (`mini.html`); Chrome/Edge'de "resim içinde resim"
- **Yenilikler penceresi** — güncellemeden sonra `src/lib/changelog.ts`'teki notlar bir kez gösterilir
- **Alışkanlıklar** — haftalık hedef (haftada 1–7 gün) veya belirli günler (Pzt/Çar/Cum…), aylık mini takvim, gün×hafta ızgarası (geçmiş günlere tıklayarak işaretleme), gün/hafta bazlı seri + maksimum seri, hatırlatma saati, arşiv, renk & emoji
- **Duolingo tarzı seri** — günlük XP hedefi, 🔥 günlük seri, her 7 günde 1 🧊 seri dondurma (en fazla 2, kaçırılan günde otomatik harcanır), 3/7/14/30/50/100… gün kutlamaları, akşam "serin tehlikede" bildirimi
- **Oyunlaştırma** — XP (alışkanlık +10, görev +10/15/25 önceliğe göre, odak 5 dk başına +2), seviyeler, 13 rozet
- **Görevler** — Bugün / Dün / Gecikmiş / Yaklaşan / Projesiz / Gelen kutusu / Tamamlanan sekmeleri, öncelik, durum, hatırlatıcı
- **Projeler** — ilgili/tamamlanan görev sayısı, ilerleme çubuğu, "X gün kaldı / gecikti"
- **Takvim** — gün / hafta / saatli hafta / ay / yıl görünümleri; saatli görünümde görevler (saat + süre), alışkanlık bölümleri, odak oturumları ve "şu an" çizgisi; boş saate tıklayınca o saate görev eklenir
- **Pomodoro** — odak/kısa/uzun mola, alışkanlığa veya göreve bağlama (süre alışkanlığa yazılır), sayfa değişse de devam eder
- **İstatistik & grafikler** — 30 günlük XP, alışkanlık başarı oranı, haftanın günleri, günlük odak, haftalık görev, yıllık ısı haritası, rozetler
- **Kişiselleştirme** — Gece / Gündüz / Sistem / Saate göre tema, gece ve gündüz için ayrı tema (zemin) rengi + özel renk, vurgu rengi, sürükle-bırak pano (gizle/daralt), TR/EN, hafta başlangıcı, gece kuşları için gün bitiş saati
- **Veri** — JSON yedek indir / geri yükle

## Mimari

```
React + TypeScript + Vite
 ├─ IndexedDB (Dexie)          ← tüm veri önce cihazda; internet şart değil
 ├─ Eşitleme motoru (src/lib/sync.ts)
 │    dirty kayıtlar → push_records RPC (sunucuda "son yazan kazanır")
 │    server_ts > imleç → pull → yereldekinden yeniyse uygula
 │    silmeler "tombstone" olarak taşınır, mantıksal saat ile saat kaymasına dayanıklı
 ├─ Supabase (ücretsiz) — tek genel tablo: yeni özellik eklemek SQL değişikliği gerektirmez
 ├─ PWA (vite-plugin-pwa)      ← telefon + tarayıcı, offline önbellek, otomatik güncelleme
 └─ Tauri 2                    ← masaüstü kurulum + imzalı otomatik güncelleyici
```

XP, seviye, seriler ve rozetler kayıtlardan **türetilir**, ayrıca saklanmaz → cihazlar arası çakışma olamaz.

---

## Tek seferlik kurulum (Stag için, ~20 dk)

### 1. GitHub deposu
```bash
git remote add origin https://github.com/<kullanici>/productivity-vault.git
git push -u origin main
```
Depo > **Settings > Pages > Source: GitHub Actions** seç.

### 2. Supabase (eşitleme)
1. [supabase.com](https://supabase.com) → ücretsiz proje oluştur (bölge: Frankfurt).
2. **SQL Editor** → `supabase/schema.sql` içeriğini yapıştır → **Run**.
3. **Authentication > Sign In / Providers > Email**: arkadaşının işini kolaylaştırmak istersen *Confirm email*'i kapat.
4. **Project Settings > API**'den `Project URL` ve `anon public` key'i al.
5. GitHub depo > **Settings > Secrets and variables > Actions** → ekle:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

> anon key gizli değildir (tarayıcıda zaten görünür); güvenliği satır seviyesi kurallar (RLS) sağlar — herkes sadece kendi verisini görür.

### 3. Masaüstü güncelleme imzası
```bash
npm install
npm run setup -- <kullanici>/productivity-vault
```
Bu komut imza anahtarını `.tauri/vault.key` içine üretir (git'e girmez — **yedekle!**), `tauri.conf.json`'a yazar ve `gh` CLI kuruluysa `TAURI_SIGNING_PRIVATE_KEY` secret'ını ekler. Değişikliği commit'le.

### 4. İlk sürüm
```bash
npm run release -- 1.0.0
```
GitHub Actions ~15 dk içinde:
- Web/PWA'yı `https://<kullanici>.github.io/productivity-vault/` adresine yayınlar
- Releases sayfasına Windows `.exe/.msi`, macOS `.dmg`, Linux `.AppImage/.deb` koyar

---

## Hata düzeltip güncelleme yayınlamak

```bash
# kodu düzelt
npm run dev            # http://localhost:1420 — tarayıcıda dene
npm test               # mantık + eşitleme testleri
npm run release        # 1.0.0 → 1.0.1, commit + tag + push
```
- Sadece web/telefon düzeltmesi için `git push` yeterli (etiket gerekmez).
- Sürüm çıkarmadan önce `src/lib/changelog.ts` dosyasının en üstüne yeni sürümün notunu ekle (yoksa `npm run release` uyarır; notsuz çıkarmak için `--no-notes`).
- Masaüstü kurulumlar bir sonraki açılışta "Yeni sürüm hazır → Güncelle" gösterir.
- Telefonlar uygulamayı açınca aynı bildirimi görür.

Masaüstünü yerelde denemek: `npm run tauri dev` (Rust + [Tauri önkoşulları](https://tauri.app/start/prerequisites/) gerekir).

## Dosya haritası

| Dosya | Ne yapar |
|---|---|
| `src/lib/types.ts` | Veri modelleri |
| `src/lib/dates.ts` | Tarih yardımcıları |
| `src/lib/db.ts` | IndexedDB şeması, yazma fonksiyonları, mantıksal saat |
| `src/lib/logic.ts` | XP, seviye, seri, dondurma, alışkanlık serileri, rozetler |
| `src/lib/tasks.ts` | Hedefli görev, tik şartları, tempo, tekrar, hızlı plan ayrıştırıcı |
| `src/lib/plan.ts` | Odak planı üretici (ders/mola dizisi) |
| `src/lib/timer.ts` | Plan + kronometre zamanlayıcı (pencereler arası ortak durum) |
| `src/lib/changelog.ts` | Sürüm notları |
| `src/lib/sync.ts` | Offline-first eşitleme motoru |
| `src/lib/actions.ts` | Tüm kullanıcı işlemleri + örnek veri |
| `src/lib/i18n.ts` | TR/EN metinler |
| `src/lib/reminders.ts`, `platform.ts` | Bildirim, güncelleyici, kurulum |
| `src/pages/*` | Sayfalar |
| `supabase/schema.sql` | Sunucu tablosu + RLS + LWW fonksiyonu |
| `src-tauri/` | Masaüstü kabuğu |
| `.github/workflows/` | Otomatik yayın |

Şemaya yeni alan eklemek: `types.ts`'e ekle, gerekiyorsa `db.ts`'de `this.version(2).stores(...)`. Sunucu tarafında değişiklik gerekmez.

## Bilinen sınırlar

- **Bildirimler** uygulama açıkken ya da arka planda çalışırken (masaüstü, Android'de sekme açıkken) gelir. Uygulama tamamen kapalıyken iPhone'a bildirim için push sunucusu gerekir (Supabase Edge Function + Web Push ile eklenebilir).
- iOS, PWA'yı uzun süre (haftalarca) açılmazsa önbelleği temizleyebilir; veriler bulutta olduğu için giriş yapınca geri gelir.
- Çakışma çözümü kayıt bazında "son yazan kazanır"dır; aynı görevi iki cihazda aynı anda offline düzenlerseniz son kaydedilen geçer.
