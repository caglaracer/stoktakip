const CONFIG = Object.freeze({
  SPREADSHEET_ID: '154zs1mOLAvlRI6OTkT1OlLWQU0OWtDwvWGxKSXEArhI',
  TIMEZONE: 'Europe/Istanbul',
  SHEETS: {
    PRODUCTS: 'Urunler',
    MOVEMENTS: 'Stok_Hareketleri',
    SALES: 'Gecmis_Satislar',
    ORDERS: 'Acik_Siparisler',
    FORECASTS: 'Tahminler',
    SETTINGS: 'Ayarlar'
  }
});

const HEADERS = Object.freeze({
  Urunler: ['Urun_Kodu', 'Urun_Adi', 'Kategori', 'Birim', 'Guncel_Stok', 'Tedarik_Suresi_Gun', 'Guvenlik_Stogu', 'Paket_Miktari', 'Aktif', 'Son_Guncelleme'],
  Stok_Hareketleri: ['Hareket_ID', 'Tarih', 'Urun_Kodu', 'Islem_Turu', 'Miktar', 'Onceki_Stok', 'Yeni_Stok', 'Aciklama', 'Kullanici'],
  Gecmis_Satislar: ['Yil', 'Ay', 'Urun_Kodu', 'Satis_Miktari'],
  Acik_Siparisler: ['Siparis_ID', 'Siparis_Tarihi', 'Urun_Kodu', 'Miktar', 'Beklenen_Teslim', 'Durum', 'Aciklama'],
  Tahminler: ['Hesaplama_Tarihi', 'Urun_Kodu', 'Model', 'Baslangic_Ayi', 'Ay_1_Tahmin', 'Ay_2_Tahmin', 'Ay_3_Tahmin', 'Guvenlik_Stogu', 'Guncel_Stok', 'Yoldaki_Siparis', 'Onerilen_Alim'],
  Ayarlar: ['Ayar', 'Deger', 'Aciklama']
});

/**
 * İlk çalıştırılacak fonksiyon. Sekmeleri, başlıkları ve varsayılan ayarları kurar.
 */
function setupInventorySystem() {
  const ss = getSpreadsheet_();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

  Object.keys(HEADERS).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    ensureHeaders_(sheet, HEADERS[sheetName]);
    styleSheet_(sheet, HEADERS[sheetName].length);
  });

  seedSettings_();
  applyValidations_();
  SpreadsheetApp.flush();
  return 'Kurulum tamamlandı. Oluşturulan dosya: ' + ss.getUrl();
}

function doGet(e) {
  return route_((e && e.parameter && e.parameter.action) || 'dashboard', {}, false);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return route_(body.action || '', body, true);
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function route_(action, body, isWrite) {
  try {
    let data;
    if (isWrite) {
      verifyToken_(body.token);
      switch (action) {
        case 'forecast':
          data = calculateForecasts_(Object.assign({}, body, {persist: true}));
          break;
        case 'movement':
          data = addMovement_(body.movement || {});
          break;
        default:
          throw new Error('Geçersiz yazma işlemi: ' + action);
      }
    } else {
      switch (action) {
        case 'dashboard':
          data = getDashboardData_();
          break;
        case 'health':
          data = {status: 'ready', timestamp: new Date().toISOString()};
          break;
        default:
          throw new Error('Geçersiz okuma işlemi: ' + action);
      }
    }
    return json_({ok: true, data: data});
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function getDashboardData_() {
  const products = readProducts_();
  const forecasts = calculateForecasts_({
    model: getSetting_('VARSAYILAN_MODEL', 'hybrid'),
    scenario: 1,
    startMonth: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM'),
    persist: false
  });
  const enriched = enrichProducts_(products);
  return {
    products: enriched,
    forecasts: forecasts.forecasts,
    summary: {
      totalProducts: enriched.length,
      criticalCount: enriched.filter(function(p) { return p.status === 'critical'; }).length,
      lowCount: enriched.filter(function(p) { return p.status === 'low'; }).length,
      purchaseTotal: forecasts.purchaseTotal
    }
  };
}

function addMovement_(movement) {
  const code = clean_(movement.productCode);
  const type = clean_(movement.type).toUpperCase();
  const quantity = number_(movement.quantity);
  if (!code) throw new Error('Ürün kodu zorunludur.');
  if (['GIRIS', 'CIKIS', 'SAYIM'].indexOf(type) === -1) throw new Error('İşlem türü GIRIS, CIKIS veya SAYIM olmalıdır.');
  if (quantity < 0 || (quantity === 0 && type !== 'SAYIM')) throw new Error('Miktar sıfırdan büyük olmalıdır.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet_(CONFIG.SHEETS.PRODUCTS);
    const values = sheet.getDataRange().getValues();
    const headers = headerMap_(values[0]);
    const rowIndex = values.findIndex(function(row, i) { return i > 0 && clean_(row[headers.Urun_Kodu]) === code; });
    if (rowIndex < 1) throw new Error('Ürün bulunamadı: ' + code);

    const previous = number_(values[rowIndex][headers.Guncel_Stok]);
    let next = previous;
    if (type === 'GIRIS') next += quantity;
    if (type === 'CIKIS') next -= quantity;
    if (type === 'SAYIM') next = quantity;
    if (next < 0 && getSetting_('NEGATIF_STOK_IZNI', 'HAYIR') !== 'EVET') throw new Error('Stok eksiye düşemez. Mevcut stok: ' + previous);

    sheet.getRange(rowIndex + 1, headers.Guncel_Stok + 1).setValue(next);
    sheet.getRange(rowIndex + 1, headers.Son_Guncelleme + 1).setValue(new Date());
    getSheet_(CONFIG.SHEETS.MOVEMENTS).appendRow([
      Utilities.getUuid(), new Date(), code, type, quantity, previous, next,
      clean_(movement.note), Session.getActiveUser().getEmail() || 'Web Kullanıcısı'
    ]);
    return {productCode: code, previousStock: previous, newStock: next};
  } finally {
    lock.releaseLock();
  }
}

function calculateForecasts_(request) {
  const model = ['weighted', 'seasonal', 'hybrid'].indexOf(request.model) >= 0 ? request.model : 'hybrid';
  const scenario = Math.max(0.1, number_(request.scenario) || 1);
  const start = parseMonth_(request.startMonth);
  const products = readProducts_();
  const sales = readSales_();
  const incoming = readIncomingOrders_();
  const result = products.map(function(product) {
    const history = sales[product.code] || [];
    const months = [0, 1, 2].map(function(offset) {
      const target = new Date(start.getFullYear(), start.getMonth() + offset, 1);
      return Math.ceil(forecastMonth_(history, target, model) * scenario);
    });
    const rawNeed = months.reduce(function(a, b) { return a + b; }, 0) + product.safetyStock - product.stock - (incoming[product.code] || 0);
    const purchase = roundToPack_(Math.max(0, rawNeed), product.packSize);
    return {code: product.code, months: months, suggestedPurchase: purchase};
  });

  if (request.persist === true) {
    writeForecasts_(result, products, incoming, model, start);
  }
  return {
    forecasts: result,
    purchaseTotal: result.reduce(function(sum, row) { return sum + row.suggestedPurchase; }, 0)
  };
}

function forecastMonth_(history, target, model) {
  if (!history.length) return 0;
  const recent = history.slice().sort(function(a, b) { return b.date - a.date; }).slice(0, 12);
  const weighted = weightedAverage_(recent);
  const sameMonth = history.filter(function(x) { return x.month === target.getMonth() + 1; });
  const seasonal = weightedAverage_(sameMonth.slice().sort(function(a, b) { return b.year - a.year; }).slice(0, 5));

  if (model === 'weighted') return weighted;
  if (model === 'seasonal') return seasonal || weighted;
  return seasonal ? (seasonal * 0.65 + weighted * 0.35) : weighted;
}

function weightedAverage_(rows) {
  if (!rows.length) return 0;
  let total = 0;
  let weights = 0;
  rows.forEach(function(row, index) {
    const weight = Math.pow(0.82, index);
    total += row.quantity * weight;
    weights += weight;
  });
  return weights ? total / weights : 0;
}

function enrichProducts_(products) {
  const sales = readSales_();
  const incoming = readIncomingOrders_();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingRatio = Math.max(0, daysInMonth - now.getDate() + 1) / daysInMonth;

  return products.map(function(product) {
    const monthlyDemand = forecastMonth_(sales[product.code] || [], now, getSetting_('VARSAYILAN_MODEL', 'hybrid'));
    const leadDemand = monthlyDemand * (product.leadTime / 30);
    const criticalLevel = Math.ceil(leadDemand + product.safetyStock);
    const remainingDemand = monthlyDemand * remainingRatio;
    let status = 'normal';
    if (product.stock <= Math.max(criticalLevel, remainingDemand)) status = 'critical';
    else if (product.stock <= criticalLevel * 1.35) status = 'low';
    return {
      code: product.code, name: product.name, stock: product.stock,
      incoming: incoming[product.code] || 0, leadTime: product.leadTime,
      packSize: product.packSize, safetyStock: product.safetyStock,
      criticalLevel: criticalLevel, status: status
    };
  });
}

function readProducts_() {
  return rowsAsObjects_(getSheet_(CONFIG.SHEETS.PRODUCTS)).filter(function(row) {
    return clean_(row.Urun_Kodu) && String(row.Aktif || 'EVET').toUpperCase() !== 'HAYIR';
  }).map(function(row) {
    return {
      code: clean_(row.Urun_Kodu), name: clean_(row.Urun_Adi) || clean_(row.Urun_Kodu),
      stock: number_(row.Guncel_Stok), leadTime: number_(row.Tedarik_Suresi_Gun) || 30,
      safetyStock: number_(row.Guvenlik_Stogu), packSize: number_(row.Paket_Miktari) || 1
    };
  });
}

function readSales_() {
  const grouped = {};
  rowsAsObjects_(getSheet_(CONFIG.SHEETS.SALES)).forEach(function(row) {
    const code = clean_(row.Urun_Kodu);
    const year = number_(row.Yil);
    const month = number_(row.Ay);
    if (!code || !year || month < 1 || month > 12) return;
    if (!grouped[code]) grouped[code] = [];
    grouped[code].push({year: year, month: month, quantity: number_(row.Satis_Miktari), date: new Date(year, month - 1, 1)});
  });
  return grouped;
}

function readIncomingOrders_() {
  const grouped = {};
  rowsAsObjects_(getSheet_(CONFIG.SHEETS.ORDERS)).forEach(function(row) {
    const status = clean_(row.Durum).toUpperCase();
    if (['TESLIM', 'IPTAL'].indexOf(status) >= 0) return;
    const code = clean_(row.Urun_Kodu);
    if (code) grouped[code] = (grouped[code] || 0) + number_(row.Miktar);
  });
  return grouped;
}

function writeForecasts_(forecasts, products, incoming, model, start) {
  const sheet = getSheet_(CONFIG.SHEETS.FORECASTS);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  const productMap = {};
  products.forEach(function(p) { productMap[p.code] = p; });
  const rows = forecasts.map(function(f) {
    const p = productMap[f.code];
    return [new Date(), f.code, model, start, f.months[0], f.months[1], f.months[2], p.safetyStock, p.stock, incoming[f.code] || 0, f.suggestedPurchase];
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedSettings_() {
  const sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 4, 3).setValues([
    ['VARSAYILAN_MODEL', 'hybrid', 'weighted, seasonal veya hybrid'],
    ['NEGATIF_STOK_IZNI', 'HAYIR', 'Stok çıkışında eksi değere izin verilsin mi?'],
    ['UYARI_EPOSTASI', '', 'Kritik stok raporunun gönderileceği adres'],
    ['UYARI_SAATI', '09:00', 'Günlük kritik stok kontrol saati']
  ]);
}

function applyValidations_() {
  const yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['EVET', 'HAYIR'], true).build();
  getSheet_(CONFIG.SHEETS.PRODUCTS).getRange('I2:I').setDataValidation(yesNo);
  const movementTypes = SpreadsheetApp.newDataValidation().requireValueInList(['GIRIS', 'CIKIS', 'SAYIM'], true).build();
  getSheet_(CONFIG.SHEETS.MOVEMENTS).getRange('D2:D').setDataValidation(movementTypes);
  const orderStatus = SpreadsheetApp.newDataValidation().requireValueInList(['BEKLIYOR', 'YOLDA', 'TESLIM', 'IPTAL'], true).build();
  getSheet_(CONFIG.SHEETS.ORDERS).getRange('F2:F').setDataValidation(orderStatus);
}

function createDailyCriticalStockTrigger() {
  ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'sendCriticalStockAlert';
  }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  const alertTime = parseAlertTime_(getSetting_('UYARI_SAATI', '09:00'));
  ScriptApp.newTrigger('sendCriticalStockAlert')
    .timeBased()
    .everyDays(1)
    .atHour(alertTime.hour)
    .nearMinute(alertTime.minute)
    .inTimezone(CONFIG.TIMEZONE)
    .create();
}

function parseAlertTime_(value) {
  const match = clean_(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return {hour: 9, minute: 0};
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return {hour: 9, minute: 0};
  return {hour: hour, minute: minute};
}

function sendCriticalStockAlert() {
  const email = getSetting_('UYARI_EPOSTASI', '');
  if (!email) return;
  const critical = enrichProducts_(readProducts_()).filter(function(p) { return p.status === 'critical'; });
  if (!critical.length) return;
  const lines = critical.map(function(p) {
    return p.code + ' - ' + p.name + ': stok ' + p.stock + ', kritik eşik ' + p.criticalLevel;
  });
  MailApp.sendEmail(email, 'Kritik stok uyarısı (' + critical.length + ' ürün)', 'Kritik ürünler:\n\n' + lines.join('\n'));
}

function setAccessToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ACCESS_TOKEN', token);
  Logger.log('ACCESS_TOKEN: ' + token);
  return token;
}

function verifyToken_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!expected) throw new Error('ACCESS_TOKEN ayarlanmamış. Önce setAccessToken fonksiyonunu çalıştırın.');
  if (String(provided || '') !== expected) throw new Error('Yazma yetkisi doğrulanamadı.');
}

function getSetting_(key, fallback) {
  const rows = rowsAsObjects_(getSheet_(CONFIG.SHEETS.SETTINGS));
  const found = rows.find(function(row) { return clean_(row.Ayar) === key; });
  return found ? found.Deger : fallback;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' sekmesi bulunamadı. setupInventorySystem fonksiyonunu çalıştırın.');
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('|') !== headers.join('|')) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function styleSheet_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setBackground('#145f4b').setFontColor('#ffffff').setFontWeight('bold');
  sheet.autoResizeColumns(1, width);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), width).createFilter();
  }
}

function rowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(clean_);
  return values.slice(1).filter(function(row) { return row.some(function(cell) { return cell !== ''; }); }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { object[header] = row[index]; });
    return object;
  });
}

function headerMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) { map[clean_(header)] = index; });
  return map;
}

function parseMonth_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function roundToPack_(quantity, packSize) {
  const size = Math.max(1, number_(packSize));
  return Math.ceil(quantity / size) * size;
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function number_(value) {
  const parsed = Number(String(value == null ? 0 : value).replace(',', '.'));
  return isFinite(parsed) ? parsed : 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
