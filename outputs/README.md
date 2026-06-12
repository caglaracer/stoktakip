# Stok Pusulası Kurulumu

Bu sistem Zirve’de tutulan stokları değiştirmez. Zirve’den alınan verileri Google Sheets üzerinde analiz eder, kritik ürünleri ve üç aylık alım önerilerini gösterir.

## 1. Apps Script kurulumu

1. Kullanacağınız Google Sheets dosyasını açın.
2. **Uzantılar > Apps Script** menüsüne girin.
3. `Code.gs` içeriğini Apps Script editörüne yapıştırın.
4. Kodun başındaki `SPREADSHEET_ID` değerini kendi Google Sheets adresinizdeki kimlikle değiştirin.
5. `setupAnalysisSystem` fonksiyonunu bir kez çalıştırıp izinleri onaylayın.

Kurulum şu sekmeleri oluşturur:

- `Guncel_Stok`
- `Aylik_Satislar`
- `Urun_Ayarlari`
- `Analiz`
- `Ayarlar`

## 2. Günlük Zirve stok aktarımı

Her gün:

1. Zirve’den güncel stok listesini Excel veya CSV olarak dışa aktarın.
2. `Guncel_Stok` sekmesindeki başlık satırını koruyun.
3. İkinci satırdan itibaren eski verileri tamamen silin.
4. Zirve’den aldığınız güncel verileri yapıştırın.
5. Her ürün satırında `Veri_Tarihi` alanını `YYYY-AA-GG` biçiminde doldurun.

Gerekli sütunlar:

| Urun_Kodu | Urun_Adi | Kategori | Birim | Guncel_Stok | Veri_Tarihi |
|---|---|---|---|---:|---|
| URN-001 | Örnek Ürün | Ana Grup | Adet | 125 | 2026-06-11 |

`Urun_Kodu` Zirve ve diğer sekmeler arasında değişmeyen eşleştirme alanıdır.

## 3. Aylık satış geçmişi

`Aylik_Satislar` sekmesine her ürünün aylık toplam satışını girin:

| Yil | Ay | Urun_Kodu | Satis_Miktari |
|---:|---:|---|---:|
| 2026 | 4 | URN-001 | 120 |
| 2026 | 5 | URN-001 | 145 |

- `Ay` değeri `1-12` arasında olmalıdır.
- Aynı ürün, yıl ve ay için birden fazla satır varsa sistem miktarları toplar.
- Tahmin için mümkünse son 12 ayı girin; daha az veri varsa mevcut aylar kullanılır.

## 4. Ürün ayarları

`Urun_Ayarlari` sekmesinde her ürün için:

| Urun_Kodu | Tedarik_Suresi_Gun | Paket_Miktari | Aktif | Takip_Seviyesi |
|---|---:|---:|---|---|
| URN-001 | 30 | 12 | EVET | ONCELIKLI |

- `Tedarik_Suresi_Gun`: Siparişten teslimata ortalama gün
- `Paket_Miktari`: Alım önerisinin yuvarlanacağı koli/paket adedi
- `Aktif`: `EVET` veya `HAYIR`
- `Takip_Seviyesi`: `ONCELIKLI`, `NORMAL` veya `TAKIP_ETME`

`ONCELIKLI` ürünler panel, e-posta ve Excel raporunda üstte gösterilir.
`TAKIP_ETME` ürünleri analiz, alım önerisi ve günlük e-postadan çıkarılır.

### Panelden takip seviyesi değiştirme

1. Apps Script proje ayarlarında **Komut dosyası özellikleri** bölümünü açın.
2. `ACCESS_TOKEN` adlı bir özellik ekleyip tahmin edilmesi zor bir değer belirleyin.
3. Web panelindeki **Veri ve Bağlantı** ekranına aynı değeri yazın.
4. **Ürün Takibi** ekranından ürünleri seçip seviyelerini değiştirin.
5. **Değişiklikleri Kaydet** düğmesine basın.

Takip seçimleri `Urun_Ayarlari` sekmesine kalıcı olarak kaydedilir.

Ürün ayarı bulunmazsa sistem geçici olarak `30` gün ve paket miktarı `1` kullanır ve panelde uyarı gösterir.

## 5. E-posta ayarları

`Ayarlar` sekmesinde:

- `UYARI_EPOSTALARI`: Bir veya daha fazla adresi virgülle ayırın.
- `UYARI_SAATI`: `HH:mm` biçiminde günlük gönderim saati.
- `VARSAYILAN_MODEL`: `weighted`
- `TAHMIN_AY_SAYISI`: `3`

Örnek:

```text
UYARI_EPOSTALARI = satin-alma@example.com, yonetim@example.com
UYARI_SAATI = 08:30
```

Ardından Apps Script’te `createDailyAnalysisTrigger` fonksiyonunu bir kez çalıştırın. Saat değiştirildiğinde fonksiyonu yeniden çalıştırın.

İlk e-postayı kontrol etmek için `runDailyAnalysisAndEmail` fonksiyonunu elle çalıştırabilirsiniz.

Günlük işlem:

1. Güncel analiz hesaplanır.
2. `Analiz` sekmesi son sonuçlarla yenilenir.
3. Kritik ürün olmasa bile kısa HTML özet gönderilir.
4. En acil beş kritik ürün e-posta gövdesinde gösterilir.
5. Alım önerisi bulunan tüm ürünler `Stok_Alim_Onerileri_YYYY-AA-GG.xlsx`
   dosyası olarak e-postaya eklenir.

Excel eki yalnızca alım önerisi sıfırdan büyük ürünleri içerir ve önerilen alım
miktarına göre büyükten küçüğe sıralanır.

## 6. Web uygulaması ve GitHub Pages

1. Apps Script’te **Dağıt > Yeni dağıtım > Web uygulaması** seçin.
2. **Şu kullanıcı olarak yürüt:** Ben.
3. **Erişimi olanlar:** Herkes.
4. Sonu `/exec` ile biten adresi alın.
5. GitHub Pages panelinde **Veri ve Bağlantı** ekranına bu adresi girin.

Takip seviyesi yazma özelliği eklendikten sonra web uygulamasını yeni sürümle
yeniden dağıtmanız gerekir.

Panel yalnızca `GET?action=dashboard` ile veri okur. Erişim anahtarı veya yazma işlemi yoktur.

## 7. Veri güncelliği

Panel:

- `Veri_Tarihi` boşsa,
- Ürünlerde farklı tarihler varsa,
- En güncel tarih İstanbul takvimine göre bir günden eskiyse

uyarı gösterir.

## 8. Hesaplama yöntemi

```text
Güvenlik stoğu =
1.65 × aylık satış standart sapması × karekök(tedarik süresi / 30)
```

```text
Kritik eşik =
aylık tahmin × (tedarik süresi / 30) + güvenlik stoğu
```

```text
Önerilen alım =
üç aylık tahmin + güvenlik stoğu - güncel stok
```

Negatif öneriler `0` yapılır. Pozitif sonuçlar `Paket_Miktari` katına yukarı yuvarlanır.

## 9. Eski sekmeler

Önceki sürümden kalan şu sekmeler yeni sistem tarafından kullanılmaz:

- `Urunler`
- `Stok_Hareketleri`
- `Gecmis_Satislar`
- `Acik_Siparisler`
- `Tahminler`

Yeni paneli ve günlük e-postayı doğrulamadan bu sekmeleri silmeyin. Doğrulama sonrasında isterseniz arşivleyebilirsiniz.
