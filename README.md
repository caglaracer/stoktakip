# Stok Pusulası

Zirve programından alınan günlük stok ve aylık satış verilerini Google Sheets üzerinde analiz eden salt okunur raporlama uygulaması.

Uygulama stok veya sipariş kaydı oluşturmaz. Amacı:

- Kritik stok seviyelerini otomatik hesaplamak
- Önümüzdeki üç ayın ürün ihtiyacını tahmin etmek
- Paket miktarına göre önerilen alım adetlerini göstermek
- Ürünleri öncelikli, normal veya takip dışı olarak yönetmek
- Her gün ayarlanabilir saatte e-posta özeti göndermek

## Dosyalar

- `index.html`: GitHub Pages raporlama paneli
- `outputs/Code.gs`: Google Apps Script analiz ve e-posta kodu
- `outputs/README.md`: Ayrıntılı kurulum ve günlük kullanım kılavuzu
- `tests/inventory.test.js`: Analiz, e-posta ve arayüz regresyon testleri

## Hesaplama

- Aylık talep: Son 12 ayın yakın aylara daha fazla ağırlık veren ortalaması
- Güvenlik stoğu: Aylık satış sapması, ürün tedarik süresi ve yaklaşık `%95` servis seviyesi
- Kritik eşik: Tedarik süresindeki tahmini tüketim + güvenlik stoğu
- Önerilen alım: Üç aylık tahmin + güvenlik stoğu - güncel stok

## Test

```powershell
node --test tests\inventory.test.js
```

Kurulum için [ayrıntılı kılavuzu](outputs/README.md) izleyin.
