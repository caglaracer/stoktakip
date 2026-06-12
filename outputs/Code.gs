const CONFIG = Object.freeze({
  SPREADSHEET_ID: '154zs1mOLAvlRI6OTkT1OlLWQU0OWtDwvWGxKSXEArhI',
  TIMEZONE: 'Europe/Istanbul',
  SERVICE_LEVEL_Z: 1.65,
  SHEETS: {
    STOCK: 'Guncel_Stok',
    SALES: 'Aylik_Satislar',
    PRODUCT_SETTINGS: 'Urun_Ayarlari',
    ANALYSIS: 'Analiz',
    SETTINGS: 'Ayarlar'
  }
});

const HEADERS = Object.freeze({
  Guncel_Stok: ['Urun_Kodu', 'Urun_Adi', 'Kategori', 'Birim', 'Guncel_Stok', 'Veri_Tarihi'],
  Aylik_Satislar: ['Yil', 'Ay', 'Urun_Kodu', 'Satis_Miktari'],
  Urun_Ayarlari: [
    'Urun_Kodu', 'Tedarik_Suresi_Gun', 'Paket_Miktari', 'Aktif', 'Takip_Seviyesi'
  ],
  Analiz: [
    'Hesaplama_Tarihi', 'Urun_Kodu', 'Urun_Adi', 'Guncel_Stok',
    'Aylik_Talep', 'Talep_Sapmasi', 'Guvenlik_Stogu', 'Kritik_Esik',
    'Ay_1_Tahmin', 'Ay_2_Tahmin', 'Ay_3_Tahmin', 'Onerilen_Alim',
    'Durum', 'Veri_Tarihi'
  ],
  Ayarlar: ['Ayar', 'Deger', 'Aciklama']
});

function setupAnalysisSystem() {
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
  return 'Analiz sistemi hazır: ' + ss.getUrl();
}

function doGet(e) {
  return route_((e && e.parameter && e.parameter.action) || 'dashboard');
}

function doPost(e) {
  try {
    const payload = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );
    if (payload.action !== 'updateTrackingLevels') {
      throw new Error('Geçersiz yazma işlemi.');
    }
    return json_({ok: true, data: handleTrackingUpdate_(payload)});
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function route_(action) {
  try {
    let data;
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
    return json_({ok: true, data: data});
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function getDashboardData_() {
  return calculateAnalysis_({
    model: getSetting_('VARSAYILAN_MODEL', 'weighted'),
    startMonth: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM'),
    now: new Date()
  });
}

function calculateAnalysis_(request) {
  const stocks = readCurrentStock_();
  const sales = readMonthlySales_();
  const settings = readProductSettings_();
  const allProducts = stocks.map(function(stock) {
    const productSettings = settings[stock.code] || {
      leadTime: 30,
      packSize: 1,
      active: true,
      trackingLevel: 'NORMAL',
      missing: true
    };
    return analyzeProduct_(
      stock,
      sales[stock.code] || [],
      productSettings,
      request || {}
    );
  });
  const products = allProducts.filter(function(product) {
    return product.active && product.trackingLevel !== 'TAKIP_ETME';
  }).sort(compareProductPriority_);
  const freshness = calculateFreshness_(stocks, request && request.now ? request.now : new Date());
  return {
    products: products,
    trackingProducts: allProducts.map(function(product) {
      return {
        code: product.code,
        name: product.name,
        trackingLevel: product.trackingLevel,
        active: product.active,
        status: product.status
      };
    }).sort(compareProductPriority_),
    summary: {
      totalProducts: products.length,
      priorityCount: products.filter(function(p) {
        return p.trackingLevel === 'ONCELIKLI';
      }).length,
      criticalCount: products.filter(function(p) { return p.status === 'critical'; }).length,
      lowCount: products.filter(function(p) { return p.status === 'low'; }).length,
      insufficientCount: products.filter(function(p) { return p.status === 'veri_yetersiz'; }).length,
      purchaseTotal: products.reduce(function(sum, p) { return sum + p.suggestedPurchase; }, 0)
    },
    freshness: freshness,
    calculatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  };
}

function analyzeProduct_(stock, history, settings, request) {
  const active = settings.active !== false;
  const trackingLevel = normalizeTrackingLevel_(settings.trackingLevel);
  const recent = history.slice().sort(function(a, b) {
    return b.date - a.date;
  }).slice(0, 12);
  const quantities = recent.map(function(row) { return number_(row.quantity); });
  const hasHistory = quantities.length > 0;
  const monthlyDemand = hasHistory ? Math.ceil(weightedAverage_(recent)) : 0;
  const demandDeviation = hasHistory ? populationStdDev_(quantities) : 0;
  const safetyStock = hasHistory ? calculateSafetyStock_(quantities, settings.leadTime) : 0;
  const leadTimeMonths = Math.max(0, number_(settings.leadTime)) / 30;
  const criticalLevel = hasHistory ? Math.ceil(monthlyDemand * leadTimeMonths + safetyStock) : 0;
  const status = stockStatus_(number_(stock.stock), criticalLevel, hasHistory);
  const months = hasHistory ? [monthlyDemand, monthlyDemand, monthlyDemand] : [0, 0, 0];
  const rawPurchase = months.reduce(function(sum, value) { return sum + value; }, 0) +
    safetyStock - number_(stock.stock);
  const suggestedPurchase = hasHistory ?
    roundToPack_(Math.max(0, rawPurchase), settings.packSize) : 0;
  const warnings = [];
  if (settings.missing) warnings.push('Ürün ayarı bulunamadı; 30 gün ve paket 1 kullanıldı.');
  if (!hasHistory) warnings.push('Aylık satış geçmişi bulunamadı.');
  return {
    code: stock.code,
    name: stock.name,
    category: stock.category,
    unit: stock.unit,
    stock: number_(stock.stock),
    dataDate: stock.dataDate,
    leadTime: number_(settings.leadTime) || 30,
    packSize: number_(settings.packSize) || 1,
    active: active,
    trackingLevel: trackingLevel,
    settingsMissing: !!settings.missing,
    monthlyDemand: monthlyDemand,
    demandDeviation: round_(demandDeviation, 2),
    safetyStock: safetyStock,
    criticalLevel: criticalLevel,
    months: months,
    suggestedPurchase: suggestedPurchase,
    status: status,
    warnings: warnings
  };
}

function trackingToken_(value) {
  return clean_(value)
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/Ğ/g, 'G')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/[\s-]+/g, '_');
}

function normalizeTrackingLevel_(value) {
  const normalized = trackingToken_(value);
  if (normalized === 'ONCELIKLI') return 'ONCELIKLI';
  if (normalized === 'TAKIP_ETME') return 'TAKIP_ETME';
  return 'NORMAL';
}

function trackingRank_(level) {
  const normalized = normalizeTrackingLevel_(level);
  if (normalized === 'ONCELIKLI') return 0;
  if (normalized === 'NORMAL') return 1;
  return 2;
}

function compareProductPriority_(a, b) {
  return trackingRank_(a.trackingLevel) - trackingRank_(b.trackingLevel) ||
    number_(b.suggestedPurchase) - number_(a.suggestedPurchase) ||
    clean_(a.name).localeCompare(clean_(b.name), 'tr');
}

function stockStatus_(stock, criticalLevel, hasHistory) {
  if (!hasHistory) return 'veri_yetersiz';
  if (stock <= criticalLevel) return 'critical';
  if (stock <= criticalLevel * 1.25) return 'low';
  return 'normal';
}

function weightedAverage_(rows) {
  if (!rows.length) return 0;
  let total = 0;
  let weights = 0;
  rows.forEach(function(row, index) {
    const weight = Math.pow(0.82, index);
    total += number_(row.quantity) * weight;
    weights += weight;
  });
  return weights ? total / weights : 0;
}

function populationStdDev_(values) {
  if (!values.length) return 0;
  const average = values.reduce(function(sum, value) {
    return sum + number_(value);
  }, 0) / values.length;
  const variance = values.reduce(function(sum, value) {
    const difference = number_(value) - average;
    return sum + difference * difference;
  }, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateSafetyStock_(quantities, leadTimeDays) {
  if (!quantities.length) return 0;
  const leadTimeMonths = Math.max(0, number_(leadTimeDays)) / 30;
  return Math.ceil(
    CONFIG.SERVICE_LEVEL_Z *
    populationStdDev_(quantities) *
    Math.sqrt(leadTimeMonths)
  );
}

function readCurrentStock_() {
  return rowsAsObjects_(getSheet_(CONFIG.SHEETS.STOCK)).filter(function(row) {
    return clean_(row.Urun_Kodu);
  }).map(function(row) {
    return {
      code: clean_(row.Urun_Kodu),
      name: clean_(row.Urun_Adi) || clean_(row.Urun_Kodu),
      category: clean_(row.Kategori),
      unit: clean_(row.Birim),
      stock: number_(row.Guncel_Stok),
      dataDate: dateToIso_(row.Veri_Tarihi)
    };
  });
}

function readMonthlySales_() {
  const aggregate = {};
  rowsAsObjects_(getSheet_(CONFIG.SHEETS.SALES)).forEach(function(row) {
    const code = clean_(row.Urun_Kodu);
    const year = number_(row.Yil);
    const month = number_(row.Ay);
    if (!code || !year || month < 1 || month > 12) return;
    const key = code + '|' + year + '|' + month;
    if (!aggregate[key]) {
      aggregate[key] = {
        code: code,
        year: year,
        month: month,
        quantity: 0,
        date: new Date(year, month - 1, 1)
      };
    }
    aggregate[key].quantity += number_(row.Satis_Miktari);
  });
  const grouped = {};
  Object.keys(aggregate).forEach(function(key) {
    const item = aggregate[key];
    if (!grouped[item.code]) grouped[item.code] = [];
    grouped[item.code].push(item);
  });
  Object.keys(grouped).forEach(function(code) {
    grouped[code].sort(function(a, b) { return a.date - b.date; });
  });
  return grouped;
}

function readProductSettings_() {
  const settings = {};
  rowsAsObjects_(getSheet_(CONFIG.SHEETS.PRODUCT_SETTINGS)).forEach(function(row) {
    const code = clean_(row.Urun_Kodu);
    if (!code) return;
    settings[code] = {
      leadTime: number_(row.Tedarik_Suresi_Gun) || 30,
      packSize: number_(row.Paket_Miktari) || 1,
      active: clean_(row.Aktif || 'EVET').toUpperCase() !== 'HAYIR',
      trackingLevel: normalizeTrackingLevel_(row.Takip_Seviyesi),
      missing: false
    };
  });
  return settings;
}

function calculateFreshness_(stocks, now) {
  const dates = stocks.map(function(stock) {
    return clean_(stock.dataDate);
  }).filter(Boolean);
  const unique = Array.from(new Set(dates));
  const missing = dates.length !== stocks.length || !dates.length;
  const inconsistent = unique.length > 1;
  const latestDate = unique.length ? unique.slice().sort().pop() : '';
  let stale = false;
  if (latestDate) {
    const today = Utilities.formatDate(now || new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    stale = daysBetweenIso_(latestDate, today) > 1;
  }
  let message = 'Zirve verisi güncel.';
  if (missing) message = 'Bazı ürünlerde veri tarihi eksik.';
  else if (inconsistent) message = 'Ürün satırlarında farklı veri tarihleri var.';
  else if (stale) message = 'Zirve stok verisi bir günden eski.';
  return {
    latestDate: latestDate,
    missing: missing,
    inconsistent: inconsistent,
    stale: stale,
    message: message
  };
}

function daysBetweenIso_(fromValue, toValue) {
  const from = parseIsoDate_(fromValue);
  const to = parseIsoDate_(toValue);
  if (!from || !to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function parseAlertTime_(value) {
  const match = clean_(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return {hour: 9, minute: 0};
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return {hour: 9, minute: 0};
  return {hour: hour, minute: minute};
}

function writeAnalysis_(analysis) {
  const sheet = getSheet_(CONFIG.SHEETS.ANALYSIS);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      HEADERS.Analiz.length
    ).clearContent();
  }
  const rows = analysis.products.map(function(product) {
    return [
      analysis.calculatedAt,
      product.code,
      product.name,
      product.stock,
      product.monthlyDemand,
      product.demandDeviation,
      product.safetyStock,
      product.criticalLevel,
      product.months[0],
      product.months[1],
      product.months[2],
      product.suggestedPurchase,
      product.status,
      product.dataDate
    ];
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.Analiz.length).setValues(rows);
  }
}

function parseRecipients_(value) {
  const valid = [];
  String(value || '').split(/[;,]/).forEach(function(candidate) {
    const email = clean_(candidate).toLowerCase();
    if (!email) return;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (valid.indexOf(email) === -1) valid.push(email);
    } else if (typeof Logger !== 'undefined') {
      Logger.log('Geçersiz e-posta adresi atlandı: ' + email);
    }
  });
  return valid;
}

function buildDailyEmail_(analysis) {
  const critical = analysis.products.filter(function(product) {
    return product.status === 'critical';
  }).sort(function(a, b) {
    const priorityDifference =
      trackingRank_(a.trackingLevel) - trackingRank_(b.trackingLevel);
    const deficitDifference =
      (number_(b.criticalLevel) - number_(b.stock)) -
      (number_(a.criticalLevel) - number_(a.stock));
    return priorityDifference || deficitDifference ||
      number_(b.suggestedPurchase) - number_(a.suggestedPurchase);
  }).slice(0, 5);
  const dateLabel = String(analysis.calculatedAt || '').slice(0, 10);
  const summaryLines = [
    'Toplam ürün: ' + analysis.summary.totalProducts,
    'Kritik: ' + analysis.summary.criticalCount,
    'Düşük stok: ' + analysis.summary.lowCount,
    'Yetersiz veri: ' + analysis.summary.insufficientCount,
    'Toplam önerilen alım: ' + analysis.summary.purchaseTotal
  ];
  const criticalLines = critical.map(function(product) {
    return product.code + ' - ' + product.name +
      ' | Stok: ' + product.stock +
      ' | Kritik eşik: ' + product.criticalLevel +
      ' | Önerilen alım: ' + product.suggestedPurchase;
  });
  const lines = [
    'STOK PUSULASI - GÜNLÜK ANALİZ',
    '',
    'Hesaplama: ' + analysis.calculatedAt,
    'Zirve veri tarihi: ' + (analysis.freshness.latestDate || 'Belirtilmemiş'),
    '',
    summaryLines.join('\n'),
    '',
    'EN ACİL KRİTİK ÜRÜNLER'
  ];
  if (!critical.length) {
    lines.push('Kritik ürün bulunmuyor.');
  } else {
    Array.prototype.push.apply(lines, criticalLines);
  }
  lines.push('', 'Tüm alım önerileri ekteki Excel dosyasındadır.');

  const criticalHtml = critical.length ? critical.map(function(product) {
    return '<tr>' +
      '<td style="padding:10px;border-bottom:1px solid #e5e5e5"><strong>' +
        escapeHtml_(product.code) + '</strong><br>' + escapeHtml_(product.name) + '</td>' +
      '<td style="padding:10px;text-align:right;border-bottom:1px solid #e5e5e5">' +
        escapeHtml_(product.stock) + '</td>' +
      '<td style="padding:10px;text-align:right;border-bottom:1px solid #e5e5e5">' +
        escapeHtml_(product.criticalLevel) + '</td>' +
      '<td style="padding:10px;text-align:right;border-bottom:1px solid #e5e5e5"><strong>' +
        escapeHtml_(product.suggestedPurchase) + '</strong></td>' +
      '</tr>';
  }).join('') :
    '<tr><td colspan="4" style="padding:14px">Kritik ürün bulunmuyor.</td></tr>';
  const htmlBody =
    '<div style="font-family:Arial,sans-serif;color:#171717;max-width:720px">' +
      '<div style="background:#171717;color:#fff;padding:20px 24px">' +
        '<h2 style="margin:0">Stok Pusulası</h2>' +
        '<p style="margin:6px 0 0;color:#d4d4d4">Günlük stok analiz özeti</p>' +
      '</div>' +
      '<div style="padding:20px 24px;border:1px solid #e5e5e5">' +
        '<p style="margin-top:0"><strong>Hesaplama:</strong> ' +
          escapeHtml_(analysis.calculatedAt) + '<br><strong>Zirve veri tarihi:</strong> ' +
          escapeHtml_(analysis.freshness.latestDate || 'Belirtilmemiş') + '</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:18px 0">' +
          '<tr>' +
            summaryCardHtml_('Toplam ürün', analysis.summary.totalProducts) +
            summaryCardHtml_('Kritik', analysis.summary.criticalCount) +
            summaryCardHtml_('Düşük stok', analysis.summary.lowCount) +
          '</tr><tr>' +
            summaryCardHtml_('Yetersiz veri', analysis.summary.insufficientCount) +
            summaryCardHtml_('Önerilen alım', analysis.summary.purchaseTotal) +
            summaryCardHtml_('Rapor tarihi', dateLabel) +
          '</tr>' +
        '</table>' +
        '<h3 style="margin:24px 0 8px">En acil 5 kritik ürün</h3>' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5">' +
          '<tr style="background:#f5f5f5">' +
            '<th style="padding:10px;text-align:left">Ürün</th>' +
            '<th style="padding:10px;text-align:right">Stok</th>' +
            '<th style="padding:10px;text-align:right">Kritik eşik</th>' +
            '<th style="padding:10px;text-align:right">Alım</th>' +
          '</tr>' + criticalHtml +
        '</table>' +
        '<p style="margin:20px 0 0;padding:14px;background:#f5f5f5">' +
          'Tüm alım önerileri ekteki Excel dosyasındadır.' +
        '</p>' +
      '</div>' +
    '</div>';
  return {
    subject: 'Stok Pusulası günlük analiz - ' + dateLabel,
    body: lines.join('\n'),
    htmlBody: htmlBody
  };
}

function summaryCardHtml_(label, value) {
  return '<td style="width:33.33%;padding:12px;border:1px solid #e5e5e5">' +
    '<span style="font-size:12px;color:#737373">' + escapeHtml_(label) + '</span><br>' +
    '<strong style="font-size:20px">' + escapeHtml_(value) + '</strong></td>';
}

function escapeHtml_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(character) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character];
  });
}

function statusLabel_(status) {
  return {
    critical: 'Kritik',
    low: 'Düşük',
    normal: 'Normal',
    veri_yetersiz: 'Yetersiz veri'
  }[status] || clean_(status);
}

function trackingLevelLabel_(level) {
  return {
    ONCELIKLI: 'Öncelikli',
    NORMAL: 'Normal',
    TAKIP_ETME: 'Takip etme'
  }[normalizeTrackingLevel_(level)];
}

function buildPurchaseReportRows_(products) {
  return products.filter(function(product) {
    return number_(product.suggestedPurchase) > 0;
  }).sort(function(a, b) {
    return trackingRank_(a.trackingLevel) - trackingRank_(b.trackingLevel) ||
      number_(b.suggestedPurchase) - number_(a.suggestedPurchase);
  }).map(function(product) {
    return [
      product.code,
      product.name,
      number_(product.stock),
      number_(product.criticalLevel),
      (product.months || []).reduce(function(sum, value) {
        return sum + number_(value);
      }, 0),
      number_(product.suggestedPurchase),
      statusLabel_(product.status),
      trackingLevelLabel_(product.trackingLevel)
    ];
  });
}

function createPurchaseReportAttachment_(analysis) {
  const dateLabel = String(analysis.calculatedAt || '').slice(0, 10);
  const fileName = 'Stok_Alim_Onerileri_' + dateLabel + '.xlsx';
  const temporary = SpreadsheetApp.create('Stok Pusulası Geçici Rapor ' + dateLabel);
  const sheet = temporary.getSheets()[0];
  const headers = [
    'Urun_Kodu', 'Urun_Adi', 'Guncel_Stok', 'Kritik_Esik',
    'Uc_Aylik_Ihtiyac', 'Onerilen_Alim', 'Durum', 'Takip_Seviyesi'
  ];
  const rows = buildPurchaseReportRows_(analysis.products);
  sheet.setName('Alim_Onerileri');
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#171717')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(2, 3, rows.length, 4).setNumberFormat('#,##0.00');
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  SpreadsheetApp.flush();

  const response = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + temporary.getId() + '/export?format=xlsx',
    {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Excel raporu oluşturulamadı: HTTP ' + response.getResponseCode());
  }
  return {
    blob: response.getBlob().setName(fileName),
    temporaryFileId: temporary.getId()
  };
}

function trashTemporaryReport_(fileId) {
  if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
}

function runDailyAnalysisAndEmail() {
  const analysis = getDashboardData_();
  writeAnalysis_(analysis);
  const recipients = parseRecipients_(getSetting_('UYARI_EPOSTALARI', ''));
  if (!recipients.length) return analysis;
  const email = buildDailyEmail_(analysis);
  let report = null;
  try {
    report = createPurchaseReportAttachment_(analysis);
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: email.subject,
      body: email.body,
      htmlBody: email.htmlBody,
      attachments: [report.blob]
    });
  } finally {
    if (report) trashTemporaryReport_(report.temporaryFileId);
  }
  return analysis;
}

function handleTrackingUpdate_(payload) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!expectedToken) {
    throw new Error('ACCESS_TOKEN Apps Script özelliği tanımlı değil.');
  }
  if (!constantTimeEqual_(clean_(payload.token), clean_(expectedToken))) {
    throw new Error('Geçersiz erişim anahtarı.');
  }
  if (!Array.isArray(payload.updates) || !payload.updates.length) {
    throw new Error('Kaydedilecek ürün seçimi bulunamadı.');
  }
  if (payload.updates.length > 5000) {
    throw new Error('Tek istekte en fazla 5000 ürün güncellenebilir.');
  }
  const updates = payload.updates.map(function(update) {
    const code = clean_(update && update.code);
    if (!code) throw new Error('Ürün kodu boş olamaz.');
    const token = trackingToken_(update.trackingLevel);
    if (['ONCELIKLI', 'NORMAL', 'TAKIP_ETME'].indexOf(token) === -1) {
      throw new Error('Geçersiz takip seviyesi: ' + clean_(update.trackingLevel));
    }
    return {
      code: code,
      trackingLevel: token
    };
  });
  return updateTrackingLevels_(updates);
}

function constantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function updateTrackingLevels_(updates) {
  const sheet = getSheet_(CONFIG.SHEETS.PRODUCT_SETTINGS);
  const values = sheet.getDataRange().getValues();
  const rows = values.length ? values : [HEADERS.Urun_Ayarlari.slice()];
  while (rows[0].length < HEADERS.Urun_Ayarlari.length) rows[0].push('');
  HEADERS.Urun_Ayarlari.forEach(function(header, index) {
    rows[0][index] = header;
  });
  const rowByCode = {};
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    while (rows[rowIndex].length < HEADERS.Urun_Ayarlari.length) rows[rowIndex].push('');
    const code = clean_(rows[rowIndex][0]);
    if (code) rowByCode[code] = rowIndex;
  }
  updates.forEach(function(update) {
    let rowIndex = rowByCode[update.code];
    if (rowIndex == null) {
      rows.push([update.code, 30, 1, 'EVET', update.trackingLevel]);
      rowIndex = rows.length - 1;
      rowByCode[update.code] = rowIndex;
    } else {
      rows[rowIndex][4] = update.trackingLevel;
    }
  });
  sheet.getRange(1, 1, rows.length, HEADERS.Urun_Ayarlari.length).setValues(
    rows.map(function(row) {
      return row.slice(0, HEADERS.Urun_Ayarlari.length);
    })
  );
  SpreadsheetApp.flush();
  return {updated: updates.length};
}

function createDailyAnalysisTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return ['sendCriticalStockAlert', 'runDailyAnalysisAndEmail'].indexOf(
      trigger.getHandlerFunction()
    ) >= 0;
  }).forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  const alertTime = parseAlertTime_(getSetting_('UYARI_SAATI', '09:00'));
  ScriptApp.newTrigger('runDailyAnalysisAndEmail')
    .timeBased()
    .everyDays(1)
    .atHour(alertTime.hour)
    .nearMinute(alertTime.minute)
    .inTimezone(CONFIG.TIMEZONE)
    .create();
}

function seedSettings_() {
  const sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 4, 3).setValues([
    ['UYARI_EPOSTALARI', '', 'Virgülle ayrılmış günlük rapor alıcıları'],
    ['UYARI_SAATI', '09:00', 'Günlük analiz ve e-posta saati'],
    ['VARSAYILAN_MODEL', 'weighted', 'Son 12 ay ağırlıklı talep modeli'],
    ['TAHMIN_AY_SAYISI', '3', 'Alım önerisinin kapsadığı ay sayısı']
  ]);
}

function applyValidations_() {
  const yesNo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['EVET', 'HAYIR'], true)
    .build();
  const tracking = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ONCELIKLI', 'NORMAL', 'TAKIP_ETME'], true)
    .build();
  const sheet = getSheet_(CONFIG.SHEETS.PRODUCT_SETTINGS);
  sheet.getRange('D2:D').setDataValidation(yesNo);
  sheet.getRange('E2:E').setDataValidation(tracking);
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
  if (!sheet) throw new Error(name + ' sekmesi bulunamadı. setupAnalysisSystem fonksiyonunu çalıştırın.');
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function styleSheet_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width)
    .setBackground('#27272a')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.autoResizeColumns(1, width);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), width).createFilter();
  }
}

function rowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(clean_);
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ''; });
  }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { object[header] = row[index]; });
    return object;
  });
}

function parseIsoDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

function dateToIso_(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function roundToPack_(quantity, packSize) {
  const size = Math.max(1, number_(packSize));
  return Math.ceil(quantity / size) * size;
}

function round_(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function number_(value) {
  const parsed = Number(String(value == null ? 0 : value).replace(',', '.'));
  return isFinite(parsed) ? parsed : 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
