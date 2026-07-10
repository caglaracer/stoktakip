# Stok Pusulasi Kullanim ve Analiz Rehberi

Bu dokuman, Stok Pusulasi uygulamasini ilk kez gorecek biri icin hazirlandi.
Amaci; uygulamanin ne yaptigini, arka planda hangi verileri kullandigini,
stok analizini hangi mantikla urettigini ve sonuclarin nasil yorumlanmasi
gerektigini sade ama detayli sekilde anlatmaktir.

## 1. Uygulamanin Amaci

Stok Pusulasi, Zirve programindan ve Google Sheets uzerinden gelen stok/satis
verilerini kullanarak stok karar destegi ureten bir web uygulamasidir.

Temel amac sudur:

```text
Hangi urunlerde gercekten stok riski var?
Hangi urunleri yakinda almamiz gerekebilir?
Hangi urunler hareketli ama elimizde yeterli stok var?
Hangi urunler seyrek/proje bazli oldugu icin otomatik alima girmemeli?
```

Uygulama klasik bir siparis programi degildir. Siparis olusturmaz. Bunun
yerine gunluk analiz yapar, kritik durumlari ozetler ve gerekirse Excel olarak
rapor verir.

## 2. Genel Mimari

Sistem dort ana parcadan olusur:

```text
Zirve Programi
    |
    | stok ve satis verisi disari aktarilir
    v
Google Sheets
    |
    | Apps Script veriyi okur ve analiz eder
    v
Apps Script Web Uygulamasi
    |
    | GitHub Pages arayuzu bu servise baglanir
    v
Stok Pusulasi Web Arayuzu
```

### Zirve Programi

Zirve, asil stok takip kaynagidir. Gunluk stok verisi ve gecmis satis
hareketleri buradan alinir.

### Google Sheets

Google Sheets, uygulamanin veri tabani gibi kullanilir. Zirve'den gelen
veriler burada duzenli sekmeler halinde tutulur.

### Apps Script

Apps Script, Google Sheet icindeki verileri okur, analiz hesaplarini yapar,
mail ve Excel raporlarini uretir.

### GitHub Pages Web Arayuzu

Kullanicinin gordugu paneldir. Veriyi Apps Script'ten ceker, filtreler,
tablolari gosterir ve Excel indirir.

## 3. Kullanilan Google Sheets Sekmeleri

Uygulama asagidaki sekmeleri kullanir.

### 3.1 Guncel_Stok

Bu sekme her urunun mevcut stok bilgisini tasir.

Beklenen kolonlar:

```text
Urun_Kodu
Urun_Adi
Kategori
Birim
Guncel_Stok
Veri_Tarihi
```

Ornek:

```text
R900561288 | 4WE 6 J6X/EG24N9K4 | | ADET | 180 | 2026-07-03
```

Bu sekme gunluk guncellenmelidir. Zirve'deki mevcut stok buraya aktarilir.

### 3.2 Aylik_Satislar

Bu sekme urunlerin aylik satis veya stok cikis toplamlarini tasir.

Beklenen kolonlar:

```text
Yil
Ay
Urun_Kodu
Satis_Miktari
```

Ornek:

```text
2025 | 1 | R900561288 | 19
2025 | 2 | R900561288 | 13
2025 | 3 | R900561288 | 8
2025 | 4 | R900561288 | 10
```

Bu sekmede her urun icin ay bazinda toplam satis/cikis olmalidir. Satis olmayan
aylar sifir olarak bulunabilir veya veri hazirlama asamasinda sifirlanabilir.

### 3.3 Urun_Ayarlari

Bu sekme urun bazli manuel ayarlari tasir.

Beklenen kolonlar:

```text
Urun_Kodu
Tedarik_Suresi_Gun
Paket_Miktari
Aktif
Takip_Seviyesi
Minimum_Stok
```

Kolon anlamlari:

- `Tedarik_Suresi_Gun`: Urunun ortalama kac gunde temin edildigi.
- `Paket_Miktari`: Alim miktarinin hangi paket/adet katina yuvarlanacagi.
- `Aktif`: `EVET` ise analizde kullanilir, `HAYIR` ise pasif sayilir.
- `Takip_Seviyesi`: `ONCELIKLI`, `NORMAL`, `TAKIP_ETME`.
- `Minimum_Stok`: Stratejik urunlerde manuel minimum stok seviyesi.

### 3.4 Analiz

Bu sekme hesaplanan analiz sonuclarini saklamak icin kullanilir.

Uygulama burada su bilgileri yazar:

```text
Hesaplama_Tarihi
Urun_Kodu
Urun_Adi
Guncel_Stok
Aylik_Talep
Talep_Sapmasi
Guvenlik_Stogu
Kritik_Esik
Ay_1_Tahmin
Ay_2_Tahmin
Ay_3_Tahmin
Onerilen_Alim
Durum
Veri_Tarihi
Tahmin_Sinifi
Son_Satis_Tarihi
Pozitif_Satis_Ayi
Son_Satistan_Beri_Ay
Tahmin_Aciklamasi
Is_Durumu
Son_12_Ay_Satis
Stok_Kac_Ay_Yeter
Oncelik_Puani
```

### 3.5 Ayarlar

Bu sekme sistem ayarlarini tasir. Ornegin mail alicilari, varsayilan model,
gunluk analiz saati gibi ayarlar burada tutulabilir.

## 4. Veri Akisi Nasil Calisir?

### Gunluk kullanim

1. Zirve'den guncel stok listesi alinir.
2. `Guncel_Stok` sekmesi yenilenir.
3. Aylik satislar/stok cikislari `Aylik_Satislar` sekmesine eklenir.
4. Web arayuzunde `Yenile` butonuna basilir.
5. Apps Script verileri okur ve analiz eder.
6. Sonuc panelde gosterilir.
7. Istenirse analiz Excel olarak indirilir.
8. Gunluk mail ayarlandiysa ozet mail gonderilir.

### Analiz tarih penceresi

Uygulama analiz penceresini sadece bugunun tarihine gore acmaz. Satis
verisinin son ayina da bakar.

Ornegin satis verisi en son 2025-04 ayina kadar geldiyse analiz penceresi
2025-05 baslangicli kabul edilir. Bu sayede veri henuz 2026'ya kadar
islenmemisse urunler yanlis sekilde "son 12 ayda hareket yok" diye
siniflandirilmaz.

Bu karar ozellikle su tip durumlari onler:

```text
Satis verisi 2025-04'te bitmis.
Bugun 2026-07.
Sistem bugune gore bakarsa urun hareket yok sanilir.
Sistem satis verisinin son ayina gore bakarsa dogru hareket gorulur.
```

## 5. Ana Ekranlar

### 5.1 Genel Bakis

Genel Bakis ekrani stok durumunu ozetler.

Gorulen ana kartlar:

- Toplam urun
- Acil alim
- Yakinda alim
- Manuel takip
- Hareketsiz
- Yetersiz veri

Buradaki amac tum urun listesini okumadan hangi grupta kac urun oldugunu
gormektir.

### 5.2 Stok Analizi

En onemli ekrandir. Urun bazinda hesaplanan kararlar burada gorulur.

Kolonlar:

- `Kod`: Urun kodu.
- `Urun`: Urun adi.
- `Takip`: Oncelikli, normal veya takip etme.
- `Stok`: Mevcut stok.
- `Son satis`: Urunun en son satis/cikis yaptigi ay.
- `Son 12 ay`: Son 12 aylik toplam satis/cikis.
- `Stok kac ay yeter`: Mevcut stokun mevcut satis hiziyla kac ay yetecegi.
- `3 ay tahmin`: Onumuzdeki 3 ay icin tahmin edilen toplam ihtiyac.
- `Onerilen alim`: Sistem tarafindan onerilen alim miktari.
- `Durum`: Acil alim, yakinda alim, normal, manuel takip vb.
- `Aciklama`: Hangi tahmin mantiginin kullanildigi.

Filtreler:

- Tum durumlar
- Acil alim
- Yakinda alim
- Normal
- Manuel takip
- Hareketsiz
- Yetersiz veri
- Takip seviyesi

### 5.3 3 Aylik Alim Plani

Bu ekran onumuzdeki 3 aya ait tahminleri ve onerilen alimlari gosterir.

Amac, sadece bugunku kritik seviyeyi degil, yakin gelecekteki ihtiyaci da
gorebilmektir.

### 5.4 Urun Takibi

Bu ekranda urunler manuel olarak isaretlenebilir.

Takip seviyeleri:

- `ONCELIKLI`: Urun is acisindan onemlidir, listelerde one gelir.
- `NORMAL`: Standart analiz mantigi uygulanir.
- `TAKIP_ETME`: Urun aktif analiz ve alim listelerinden cikarilir.

Takip seviyelerini kaydetmek icin `ACCESS_TOKEN` gerekir.

### 5.5 Veri ve Baglanti

Bu ekranda Apps Script web uygulamasi URL'si girilir.

Alanlar:

- Web uygulamasi URL'si
- Yazma erisim anahtari

Yazma erisim anahtari sadece takip seviyesi degistirme gibi islemler icin
gereklidir.

## 6. Analiz Mantigi

Uygulama her urunu ayni formulle degerlendirmez. Once urunun talep davranisini
anlamaya calisir, sonra stok seviyesini bu davranisa gore yorumlar.

Ana soru sudur:

```text
Bu urun gercekten hareketli mi?
Elimizdeki stok bu hareket hizina gore kac ay yeter?
Onumuzdeki 3 ayda alim ihtiyaci var mi?
```

## 7. Talep Siniflari

Uygulama urunleri asagidaki talep siniflarina ayirir.

### 7.1 YETERSIZ_VERI

Yeterli aylik satis gecmisi yoksa kullanilir.

Bu durumda otomatik alim onerisi verilmez.

### 7.2 HAREKETSIZ

Urun son 24 ayda hic satis/cikis yapmamissa kullanilir.

Bu urunler otomatik alim listesine girmez.

### 7.3 MANUEL_TAKIP

Urun cok seyrek satiliyorsa veya son 12 ayda anlamli hareketi yoksa kullanilir.

Ornek:

```text
40 ayda sadece 4 ay satis var.
Urun proje bazli veya cok seyrek hareket ediyor.
```

Bu urunlere sistem otomatik alim onerisi vermez. Ancak kullanici isterse
`Minimum_Stok` ile manuel kural koyabilir.

### 7.4 DUZENLI

Urun duzenli ve nispeten stabil hareket ediyorsa kullanilir.

Bu urunlerde son 12 ay agirlikli ortalama daha anlamlidir.

### 7.5 DEGISKEN

Urun duzenli satiliyor ama miktarlar dalgaliysa kullanilir.

Bu urunlerde guvenlik stogu daha dikkatli hesaplanir.

### 7.6 MEVSIMSEL

Urun belirli aylarda benzer davranis gosteriyorsa kullanilir.

Ornek:

```text
Her yil ayni aylarda yuksek satis.
```

Bu durumda gelecek 3 ay tahmini, gecmis yillarin ayni aylarina bakarak
hesaplanir.

### 7.7 KESIKLI

Urun her ay satmaz ama talep tamamen kopuk da degildir.

Aralikli talep modeli kullanilir.

### 7.8 YIGINSAL

Urun seyrek ve miktar olarak oynak hareket ediyorsa kullanilir.

Ornek:

```text
Bir ay 1 adet, uzun sure 0, sonra bir ay 20 adet.
```

Bu tur urunlerde sistem otomatik alimi cok dikkatli yorumlamalidir.

## 8. Kullanilan Tahmin Modelleri

### 8.1 Son 12 Ay Agirlikli Ortalama

Duzenli ve degisken urunlerde kullanilir.

Mantik:

```text
Son aylara daha fazla agirlik verilir.
Eski aylar daha az etkiler.
```

Bu sayede son donemde satis dusmusse tahmin de azalir; satis artmissa tahmin
artar.

### 8.2 Mevsimsel Tahmin

Mevsimsel urunlerde kullanilir.

Mantik:

```text
Gelecek ay icin gecmis yillardaki ayni aya bak.
En yeni yila daha fazla agirlik ver.
```

Ornek:

```text
Agustos 2026 tahmini icin:
Agustos 2025
Agustos 2024
Agustos 2023
```

En yeni gozleme daha yuksek agirlik verilir.

### 8.3 TSB Aralikli Talep Modeli

Kesikli ve yiginsal talepte kullanilir.

Bu model iki seyi birlikte takip eder:

- Talep oldugunda ortalama miktar.
- Talep olma ihtimali.

Sifir satis olan aylar da modele dahildir. Bu onemlidir; cunku urun uzun sure
satmazsa tahmin zamanla dusmelidir.

## 9. Kritik Esik ve Guvenlik Stogu

Uygulama hareketli urunlerde su mantikla kritik esik hesaplar:

```text
Kritik esik =
tedarik suresi icindeki beklenen talep
+ guvenlik stogu
```

Guvenlik stogu, satis miktarlarindaki dalgalanmaya gore hesaplanir. Talep ne
kadar oynaksa guvenlik stogu da o kadar yukselir.

Kullanilan servis katsayisi:

```text
1.65
```

Bu katsayi daha temkinli stok tutmak icin kullanilir.

## 10. Stok Kac Ay Yeter?

Bu uygulamadaki en pratik metriklerden biridir.

Formul:

```text
Stok kac ay yeter =
Guncel stok / Son 12 ay ortalama aylik satis
```

Ornek:

```text
Son 12 ay satis: 120 adet
Aylik ortalama: 10 adet
Guncel stok: 25 adet
Stok kac ay yeter: 2.5 ay
```

Bu durumda urun `Yakinda alim` grubuna girebilir.

## 11. Is Durumlari

Uygulamanin kullaniciya gosterdigi ana karar durumu `Is_Durumu` alanidir.

### 11.1 ACIL_ALIM

Stok 1 ay veya daha az yetiyorsa kullanilir.

Bu urunler en ust onceliklidir.

### 11.2 YAKINDA_ALIM

Stok 1-3 ay arasi yetiyorsa kullanilir.

Bu urunler planli alim listesine alinmalidir.

### 11.3 NORMAL

Urun hareketli olabilir ama mevcut stok yeterlidir.

Bu urunlerde otomatik alim onerisi uretilmez.

### 11.4 MANUEL_TAKIP

Urun seyrek veya proje bazli hareket ediyor olabilir.

Sistem bu urunlerde otomatik alim onermez. Kullanici isterse manuel minimum
stok belirleyebilir.

### 11.5 HAREKETSIZ

Uzun suredir hareket yoktur.

Otomatik alim onerisi uretilmez.

### 11.6 YETERSIZ_VERI

Analiz icin yeterli veri yoktur.

Otomatik alim onerisi uretilmez.

## 12. Onerilen Alim Nasil Hesaplanir?

Hareketli ve stok riski olan urunlerde:

```text
Onerilen alim =
3 aylik tahmin
+ guvenlik stogu
- guncel stok
```

Sonuc sifirdan kucukse `0` kabul edilir.

Pozitif sonuc varsa `Paket_Miktari` katina yuvarlanir.

Onemli kural:

```text
Is durumu NORMAL, MANUEL_TAKIP, HAREKETSIZ veya YETERSIZ_VERI ise
otomatik alim onerisi uretilmez.
```

Sadece `ACIL_ALIM` ve `YAKINDA_ALIM` urunlerinde otomatik alim onerisi
uretilir.

## 13. Manuel Minimum Stok

Bazi urunler az satsa bile stratejik olabilir. Bu durumda `Minimum_Stok`
kullanilir.

Ornek:

```text
Urun cok seyrek satiyor.
Ama mutlaka elde en az 3 adet olmali.
Minimum_Stok = 3
```

Bu durumda sistem urunu otomatik talep modeline gore degil, kullanicinin
belirledigi minimum stok kuralina gore yorumlar.

## 14. Oncelik Puani

Uygulama urunleri siralarken sadece onerilen alim miktarina bakmaz.

Oncelik puaninda su bilgiler etkili olur:

- Is durumu
- Son 12 ay satis miktari
- Son 12 ayda kac ay hareket oldugu
- Stokun kac ay yetecegi
- Onerilen alim miktari
- Urunun manuel olarak oncelikli isaretlenmesi

Bu sayede eski bir satis patlamasi yasamis ama artik hareket etmeyen urunler
listenin tepesine cikmaz.

## 15. Excel Export

Stok Analizi ekraninda gorunen filtreli liste Excel olarak indirilebilir.

Excel export su mantikla calisir:

1. Kullanici analiz ekraninda filtreleri secer.
2. `Excel Indir` butonuna basar.
3. Web arayuzu gorunen urun kodlarini Apps Script'e gonderir.
4. Apps Script analizi yeniden hesaplar.
5. Sadece istenen urunleri Excel dosyasina yazar.
6. Gecici Google Sheet XLSX olarak disari aktarilir.
7. Gecici dosya cope tasinir.
8. Tarayici dosyayi indirir.

Excel export analiz verisini degistirmez. Sadece rapor uretir.

## 16. Gunluk Mail

Gunluk mail, uzun urun listesini mail icine doldurmak yerine kisa ozet gonderir.

Mailde su bilgiler bulunur:

- Toplam urun
- Acil/yakinda alim sayilari
- Manuel takip sayisi
- Hareketsiz urun sayisi
- Toplam onerilen alim
- En acil urunlerden kisa liste
- Detaylar icin Excel ek dosyasi

## 17. Guvenlik ve Yetki

Sistem GitHub Pages uzerinden calisir. Bu nedenle web arayuzundeki kod herkes
tarafindan gorulebilir.

Bu yuzden gizli bilgiler HTML icine yazilmamalidir.

### Okuma islemleri

Dashboard verisi ve analiz Excel'i Apps Script uzerinden okunur.

Mevcut yapida Excel export okuma islemi gibi kabul edilir.

### Yazma islemleri

Urun takip seviyesi degistirme gibi islemler `ACCESS_TOKEN` ister.

`ACCESS_TOKEN` Apps Script proje ozelliklerinde saklanir.

Tarayici tarafinda token localStorage'da tutulur. Bu pratik kullanim saglar ama
tam kurumsal guvenlik seviyesi degildir. Daha yuksek guvenlik istenirse okuma
icin ayri `READ_TOKEN`, yazma icin ayri `ACCESS_TOKEN` yapisina gecilebilir.

## 18. Sik Karsilasilan Durumlar

### Urun hareketli oldugu halde manuel takip gorunuyor

Muhtemel sebep: `Aylik_Satislar` sekmesinde son aylar eksiktir veya analiz
penceresi yanlis ay uzerinden kurulmustur.

Kontrol:

```text
Urun kodunu Aylik_Satislar sekmesinde filtrele.
Son aylarda satis satirlari var mi?
Satis verisinin son ayi nedir?
```

### Urun hareketli ama alim onerisi 0

Bu normal olabilir.

Sebep:

```text
Urun hareketlidir ama mevcut stok yeterlidir.
Stok kac ay yeter degeri 3 ayin uzerindeyse sistem otomatik alim onermez.
```

### Excel indirilemiyor

Kontrol edilecekler:

1. Apps Script URL'si dogru mu?
2. Apps Script son kodla yeniden deploy edildi mi?
3. GitHub Pages guncel mi?
4. Apps Script yetkileri verildi mi?

### Gecersiz erisim anahtari hatasi

Bu hata takip seviyesi kaydederken normaldir; token yanlis veya eksiktir.

Excel indirirken goruluyorsa Apps Script eski surumu calistiriyor olabilir.
Yeni `Code.gs` kaydedilip yeni deployment version alinmalidir.

## 19. Ornek Yorumlar

### R900561288

Ornek veri:

```text
2025-01: 19
2025-02: 13
2025-03: 8
2025-04: 10
```

Bu urun icin veri penceresi dogru kurulursa son 12 ay satisi sifir degildir.
Bu nedenle manuel takip sayilmamalidir.

Eger mevcut stok cok yuksekse durum `NORMAL` olabilir ve alim onerisi 0 olur.

### R901113598

Bu urun seyrek/proje bazli harekete ornektir.

Gecmiste az sayida satis olabilir, ancak mevcut stok son 12 ay talebine gore
yeterliyse otomatik alim onerisi uretilmez.

## 20. Ozet

Stok Pusulasi'nin ana yaklasimi sudur:

```text
Her satis gecmisi olan urunu kritik sayma.
Once son donem hareketini kontrol et.
Sonra mevcut stokun kac ay yetecegini hesapla.
Sadece gercek stok riski olan urunlere alim oner.
Seyrek/proje bazli urunleri manuel takipte tut.
```

Bu yaklasim sayesinde liste kuculur ama daha anlamli hale gelir. Kullanici
gereksiz stok alimi yerine gercekten riskli, hareketli ve stogu azalan
urunlere odaklanir.
