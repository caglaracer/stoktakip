# Stok Pusulası Kurulumu

Bu klasörde iki ana dosya bulunur:

- `index.html`: GitHub Pages üzerinde çalışacak kullanıcı arayüzü
- `Code.gs`: Google Sheets veritabanı, API, tahmin ve uyarı otomasyonları

## 1. Apps Script kurulumu

1. Google Sheets dosyanızı açın.
2. **Uzantılar > Apps Script** menüsüne girin.
3. `Code.gs` içeriğini Apps Script editörüne yapıştırın.
4. `setupInventorySystem` fonksiyonunu bir kez çalıştırın ve izinleri onaylayın.
5. `setAccessToken` fonksiyonunu çalıştırın.
6. **Yürütme günlüğünde** gösterilen `ACCESS_TOKEN` değerini saklayın.

Kurulum aşağıdaki sekmeleri otomatik oluşturur:

- `Urunler`
- `Stok_Hareketleri`
- `Gecmis_Satislar`
- `Acik_Siparisler`
- `Tahminler`
- `Ayarlar`

## 2. Veri girişi

Önce `Urunler` sekmesine ürünleri ekleyin. `Urun_Kodu` benzersiz olmalıdır.

Geçmiş aylık satışları `Gecmis_Satislar` sekmesine şu şekilde girin:

| Yil | Ay | Urun_Kodu | Satis_Miktari |
|---:|---:|---|---:|
| 2025 | 1 | URN-001 | 120 |
| 2025 | 2 | URN-001 | 98 |

`Ay` alanı 1-12 arasında olmalıdır. Satışları stok hareketlerine eklemeyin; bu veriler yalnızca tahmin için kullanılır.

## 3. Web uygulaması yayını

1. Apps Script'te **Dağıt > Yeni dağıtım** seçin.
2. Tür olarak **Web uygulaması** seçin.
3. **Şu kullanıcı olarak yürüt:** Ben.
4. **Erişimi olanlar:** Herkes.
5. Dağıtın ve sonu `/exec` ile biten URL'yi alın.

Kod değiştikçe **Dağıtımları yönet > Düzenle > Yeni sürüm** ile dağıtımı güncelleyin.

## 4. GitHub Pages

1. `index.html` dosyasını GitHub deponuzun kök dizinine yükleyin.
2. Depoda **Settings > Pages** bölümüne girin.
3. Kaynak olarak ana dalı ve `/root` klasörünü seçin.
4. Yayınlanan sayfada **Bağlantı Ayarları** ekranını açın.
5. Apps Script `/exec` URL'sini ve `ACCESS_TOKEN` değerini girin.

Bağlantı kurulana kadar arayüz örnek verilerle çalışır.

## 5. Günlük e-posta uyarısı

1. `Ayarlar` sekmesinde `UYARI_EPOSTASI` değerini doldurun.
2. `UYARI_SAATI` değerini `HH:mm` biçiminde ayarlayın. Geçersiz değerler için `09:00` kullanılır.
3. Apps Script'te `createDailyCriticalStockTrigger` fonksiyonunu bir kez çalıştırın.

Sistem her gün ayarlanan saat civarında kritik ürünleri e-posta ile bildirir. Apps Script zaman tetikleyicileri belirtilen dakikanın yaklaşık 15 dakika çevresinde çalışabilir. `UYARI_SAATI` değiştirildiğinde tetikleyiciyi güncellemek için `createDailyCriticalStockTrigger` fonksiyonunu yeniden çalıştırın.

## API davranışı

- `GET?action=dashboard` ve `GET?action=health` yalnızca veri okur.
- Tahmin hesaplama ve stok hareketi işlemleri `POST` isteği ve geçerli `ACCESS_TOKEN` gerektirir.
- Genel Bakış ekranını yenilemek `Tahminler` sekmesini değiştirmez.
- Arayüzde **Planı Hesapla** işlemi çalıştırıldığında sonuçlar `Tahminler` sekmesine kaydedilir.

## Tahmin yöntemleri

- `weighted`: Son 12 aya, yakın dönemlere daha yüksek ağırlık verir.
- `seasonal`: Hedef ayın önceki yıllardaki satışlarını kullanır.
- `hybrid`: Mevsimsel tahmine `%65`, son dönem ağırlıklı ortalamasına `%35` ağırlık verir.

Üç aylık öneri şu mantıkla hesaplanır:

```text
3 aylık tahmin + güvenlik stoğu - güncel stok - yoldaki sipariş
```

Sonuç `Paket_Miktari` değerinin üst katına yuvarlanır.

## Güvenlik notu

GitHub Pages istemci tarafında çalıştığından erişim anahtarı tarayıcıda saklanır ve tam anlamıyla gizli kabul edilemez. Bu yapı küçük ekip ve operasyonel stok verisi için pratiktir; hassas ticari veriler veya çok kullanıcılı yetkilendirme gerekiyorsa kimlik doğrulamalı bir ara sunucu kullanılmalıdır.
