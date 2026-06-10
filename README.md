# Stok Pusulasi

Google Sheets ve Google Apps Script tabanli stok takip, hareket gecmisi, acik siparis ve uc aylik tedarik planlama uygulamasi.

## Dosyalar

- `index.html`: GitHub Pages arayuzu
- `outputs/Code.gs`: Google Apps Script backend kodu
- `outputs/README.md`: Ayrintili kurulum kilavuzu
- `tests/inventory.test.js`: Guvenlik, zamanlama ve saat dilimi regresyon testleri

## Test

```powershell
node --test tests\inventory.test.js
```

Kurulum icin [ayrintili kilavuzu](outputs/README.md) izleyin.

## Temel Is Akislari

- **Stok Gecmisi:** Tarih, urun ve islem turune gore son 100 hareketi filtreler.
- **Acik Siparisler:** Yeni siparis olusturur ve `BEKLIYOR`, `YOLDA`, `TESLIM`, `IPTAL` durumlarini yonetir.
- **Stok Hareketi:** Fiziksel giris, cikis ve sayim islemlerini kaydeder.

Bir siparisi `TESLIM` yapmak stogu otomatik artirmaz. Fiziksel teslim alindiginda ayrica `GIRIS` stok hareketi kaydedilmelidir.
