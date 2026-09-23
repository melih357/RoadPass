# RoadPass Web — Revizyon 4

**Slogan:** Akıllı Geçiş. Akıllı Yolculuk.

RoadPass; araçla ilgili yaklaşan işleri, HGS durumunu, giderleri ve yolculuk hazırlığını tek yerde anlaşılır hâle getiren PHP + MySQL tabanlı responsive web prototipidir.

Revizyon 4’ün ana sorusu şudur:

> Aracımla yola çıkmaya ve önümüzdeki dönemde oluşacak masraflara hazır mıyım?

## Revizyon 4’ün Öne Çıkanları

### Sade araç ekleme

İlk ekranda yalnızca şu temel bilgiler görünür:

- Plaka
- Araç tipi
- Marka
- Model
- İsteğe bağlı yakıt türü

Üretim yılı, kasa tipi, şanzıman, tüketim, depo/batarya, renk ve HGS etiketi **Gelişmiş araç bilgileri** bölümünde isteğe bağlıdır.

- İlk eklenen araç otomatik olarak varsayılan araç olur.
- Plaka il kodu `01–81`, harf grubu `1–3`, son sayı grubu `2–4` karakter olarak doğrulanır.
- `34 A 1234`, `06 AB 1234` ve `35 ABC 123` gibi standart biçimler desteklenir.
- Katalogda bulunmayan model kullanıcı tarafından önerilebilir; genel kataloğa eklenmesi yönetici onayına bağlıdır.

### RoadPass Hazırlık Skoru

Dashboard artık çok sayıda bağımsız kart yerine tek bir hazırlık görünümü sunar:

- HGS bakiyesi riski
- Yaklaşan araç işlemleri
- Araç kaydı ve hatırlatmalar
- Bugün yapılması önerilen işler
- Yaklaşık hazırlık puanı

Skor bir resmî uygunluk belgesi değildir; RoadPass içindeki demo kayıtlarına göre üretilen yardımcı göstergedir.

### Önümüzdeki 30 gün gider tahmini

RoadPass, mevcut demo geçiş ve araç gideri kayıtlarından şu kalemleri bir araya getirir:

- Tahminî HGS harcaması
- Yakıt/şarj ve diğer araç giderleri
- Yaklaşan kayıtlı masraflar
- Bilinen toplam

Premium görünümde ayrıca 90 günlük öngörü kartı bulunur. Tahminler kullanıcı kararına yardımcı olmak içindir ve kesin fiyat/ödeme taahhüdü değildir.

### Güvenilir yolculuk maliyeti yaklaşımı

RoadPass artık mesafeye bakarak rastgele HGS ücreti üretmez.

- Kullanıcı **Ücretli yolları kullanma** seçeneğini açarsa HGS bütçesi `0,00 TL` kabul edilir; yol süresinin prototip tahmini olduğu açıkça belirtilir.
- Aynı il içi veya bilinmeyen bir rotada canlı yol seçimi doğrulanamıyorsa tutar uydurulmaz; **Ücret doğrulanamadı** mesajı gösterilir.
- Yalnızca prototipte tanımlı ve doğrulanmış ücretli koridorlarda tahminî ücret gösterilir.
- Bilinmeyen ücret, toplam maliyete eklenmez ve sonuç **Bilinen toplam** olarak etiketlenir.
- Harici Google Maps yol tarifi bağlantısı API anahtarı gerektirmez.

Bu sürüm canlı rota veya resmî HGS tarifesi kullanmaz. Ücretli koridorlar ve tutarlar prototip verisidir.

### İşlem yapılabilir hatırlatmalar

Hatırlatma kartları yalnızca tarih göstermez; ilgili işleme geçiş düğmesi de sunar:

- Araç muayenesi → e-Devlet muayene randevusu
- HGS işlemleri → PTT HGS müşteri servisi
- Motorlu taşıt işlemleri → İnteraktif Vergi Dairesi/e-Devlet
- Bakım ve lastik → harici servis araması

RoadPass gerçek işlemi kendi içinde yapıyormuş gibi davranmaz; kullanıcıyı yetkili veya ilgili servise yönlendirir.

### Her kullanıcı için daha anlaşılır deneyim

- İlk girişte üç adımlı kısa tanıtım
- Her sayfada `?` düğmesiyle “Bu bölüm ne işe yarar?” açıklaması
- Yardım Merkezi’nde bölüm rehberi
- Büyük yazı seçeneği
- Sade görünüm seçeneği
- Büyük dokunma alanları ve açıklamalı eylemler
- Türkçe ve İngilizce arayüz

### Premium Aurora deneyimi

Premium yalnızca daha fazla araç anlamına gelmez. Premium değer alanları:

- 30/90 günlük gider öngörüsü
- Gelişmiş hazırlık görünümü
- Proaktif işlem önerileri
- Ayrıntılı rapor ve analiz yaklaşımı
- Aurora, Mint ve Midnight vurgu temaları
- Premium profil ve kokpit görünümü
- Abonelik yönetimi ve demo ödeme geçmişi

Demo ödeme ekranı gerçek tahsilat yapmaz. Tam kart numarası ve CVV veritabanına kaydedilmez.

## Diğer Özellikler

- HGS demo cüzdanı ve bakiye yükleme
- Resmî PTT HGS sayfasına geçiş
- Çoklu araç desteği
- Araç gider merkezi
- Muayene, sigorta, bakım, vergi ve lastik hatırlatmaları
- Geçiş geçmişi, filtreleme, CSV dışa aktarma ve çöp kutusu
- Açık adres veya il/ilçe/mahalle/sokak ile yolculuk planlama
- Yakıt/şarj yeterlilik hesabı
- Kayıtlı adresler ve kayıtlı yolculuklar
- Premium abonelik demo akışı
- RoadPass odaklı yerel AI rehberi
- İsteğe bağlı OpenAI backend entegrasyonu
- Marka/model katalog yönetim paneli
- PWA kurulumu ve statik önbellek

## Teknoloji

- PHP 8.1+
- MySQL 8 veya MariaDB
- HTML5, CSS3, Vanilla JavaScript
- PDO prepared statements
- PHP Session
- PWA manifest ve service worker
- WAMP Server uyumlu klasör yapısı

## Dosya Yapısı

```text
roadpass-revision-4/
├── admin/
│   └── index.php
├── backend/
│   ├── api.php
│   ├── bootstrap.php
│   ├── db.php
│   ├── helpers.php
│   └── integrations.php
├── frontend/
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   └── assets/
│       ├── css/style.css
│       ├── img/
│       └── js/
├── uploads/
├── .env
├── database.sql
├── migration.sql
└── README.md
```

# WAMP ile Temiz Kurulum

## 1. ZIP’i çıkartın

Klasörü şu konuma yerleştirin:

```text
C:\wamp64\www\roadpass-revision-4
```

## 2. WAMP servislerini çalıştırın

WAMP simgesinin yeşil olduğunu ve Apache/MySQL servislerinin çalıştığını kontrol edin.

## 3. Veritabanını kurun

phpMyAdmin:

```text
http://localhost/phpmyadmin/
```

**İçe Aktar / Import** bölümünden proje kökündeki `database.sql` dosyasını çalıştırın. Bu dosya `roadpass` veritabanını temiz kurulumla oluşturur ve demo verilerini ekler.

## 4. Uygulamayı açın

```text
http://localhost/roadpass-revision-4/frontend/
```

## Demo hesap

```text
E-posta: demo@roadpass.local
Şifre: Demo1234
```

Demo kullanıcı Premium ve yönetici yetkilidir.

## Yönetici paneli

Önce demo hesabıyla ana uygulamaya giriş yapın, ardından:

```text
http://localhost/roadpass-revision-4/admin/
```

# Revizyon 3’ten Yükseltme

Mevcut kayıtları korumak için:

1. phpMyAdmin’den `roadpass` veritabanının yedeğini alın.
2. Revizyon 4 ZIP’ini ayrı klasöre çıkartın.
3. phpMyAdmin’de mevcut `roadpass` veritabanını seçin.
4. Proje kökündeki `migration.sql` dosyasını bir kez çalıştırın.
5. Revizyon 4 adresini açın.
6. Tarayıcıda `Ctrl + F5` yapın.
7. Eski PWA görünümü devam ediyorsa service worker/site verisini temizleyin.

`migration.sql`, Revizyon 3 kullanıcı ayarlarına Revizyon 4’ün sade görünüm, büyük yazı ve vurgu teması alanlarını ekler.

> `database.sql` temiz kurulum içindir ve mevcut `roadpass` veritabanını yeniden oluşturur. Verilerinizi korumak için yükseltmede yalnızca `migration.sql` kullanın.

# `.env` Ayarları

Varsayılan WAMP ayarı:

```env
APP_NAME=RoadPass
APP_ENV=local
APP_DEBUG=true
SESSION_NAME=ROADPASS_SESSION

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=roadpass
DB_USER=root
DB_PASS=
```

WAMP MySQL `root` kullanıcısında parola varsa `DB_PASS` alanına yazın.

## OpenAI isteğe bağlıdır

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_WEB_SEARCH=false
```

Anahtar boş bırakıldığında AI Asistan RoadPass odaklı yerel Akıllı Rehber olarak çalışır. Diğer Revizyon 4 özellikleri API anahtarı olmadan çalışır.

# Premium Demo Ödeme

```text
Kart: 4242 4242 4242 4242
Son kullanma: 12/29
CVV: 123
```

Bu işlem gerçek tahsilat yapmaz. Tam kart numarası ve CVV kaydedilmez; demo geçmişinde yalnızca kart markası, son dört hane, isim, son kullanma ay/yılı ve işlem referansı tutulabilir.

# Hesaplamaların Sınırı

- Yolculuk mesafesi/süresi canlı navigasyon yerine prototip algoritmasıyla üretilir.
- HGS ücreti yalnızca tanımlı ücretli koridorlarda tahmin edilir.
- Bilinmeyen rotada HGS tutarı uydurulmaz.
- Yakıt/şarj hesabı kullanıcı veya araç profilindeki tüketim bilgisine dayanır.
- İstasyonlar demo verisidir; canlı açık/kapalı durumu veya güncel fiyat garantisi yoktur.
- Hazırlık skoru ve gider tahmini finansal, hukuki veya teknik uygunluk belgesi değildir.
- Gerçek HGS bakiyesi, canlı trafik, canlı rota, gerçek ödeme ve resmî kurum veri entegrasyonu bulunmaz.

# Güvenlik Notları

- `.env` dosyasını GitHub’a veya internete yüklemeyin.
- Üretimde `APP_DEBUG=false` kullanın.
- Gerçek API anahtarlarını frontend dosyalarına yazmayın.
- Gerçek kart numarası ve CVV saklamayın.
- Gerçek ödeme için PCI DSS uyumlu ödeme sağlayıcısının checkout/token sistemi kullanılmalıdır.
- HTTPS olmadan gerçek ödeme veya hassas kişisel veri işlemi yapmayın.
- Üretimde MySQL `root` yerine yalnızca RoadPass veritabanına yetkili ayrı bir kullanıcı kullanın.
- Yönetici rolünü yalnızca yetkili hesaplara verin.
- Kullanıcı model önerilerini onaylanmadan genel kataloğa açmayın.

# Sorun Giderme

## 500 veya beyaz sayfa

- PHP sürümünün 8.1 veya üzeri olduğunu kontrol edin.
- WAMP Apache error log dosyasını inceleyin.
- Yerel geliştirmede `.env` içindeki `APP_DEBUG=true` kullanılabilir.

## Tablo veya sütun bulunamadı

Revizyon 3 veritabanından yükseltiyorsanız `migration.sql` uygulanmamış olabilir.

## Eski tasarım görünmeye devam ediyor

1. `Ctrl + F5` yapın.
2. Geliştirici araçlarında **Application → Service Workers → Unregister** seçin.
3. **Clear site data** uygulayıp sayfayı yenileyin.

## Yönetici paneli 403 gösteriyor

Önce demo/yönetici hesabıyla ana uygulamaya giriş yapın.

## Konum izni çalışmıyor

Tarayıcı konum iznini engellediyse site ayarlarından tekrar izin verin. Konum özelliği kullanılmasa da açık adres elle girilebilir.

---

RoadPass Revizyon 4, staj ve portföy sunumu için hazırlanmış çalışan bir prototiptir. Üretim sürümünde canlı rota, doğrulanmış ücret tarifesi, resmî HGS ve ödeme sağlayıcısı entegrasyonları ayrıca uygulanmalıdır.
