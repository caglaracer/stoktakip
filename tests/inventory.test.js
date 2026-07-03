const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function sources() {
  return {
    code: fs.readFileSync(path.join(root, 'outputs', 'Code.gs'), 'utf8'),
    html: fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    outputHtml: fs.readFileSync(path.join(root, 'outputs', 'index.html'), 'utf8')
  };
}

function loadCode(overrides = {}) {
  const {code} = sources();
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    RegExp,
    isFinite,
    isNaN,
    ContentService: {
      MimeType: {JSON: 'application/json'},
      createTextOutput(text) {
        return {
          setMimeType() {
            return JSON.parse(text);
          }
        };
      }
    },
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(code, context, {filename: 'Code.gs'});
  return context;
}

test('weighted demand gives recent months more influence', () => {
  const app = loadCode();
  const value = app.weightedAverage_([
    {quantity: 100},
    {quantity: 80},
    {quantity: 60}
  ]);
  assert.equal(Math.round(value), 83);
});

test('population deviation and safety stock use demand variability', () => {
  const app = loadCode();
  assert.ok(Math.abs(app.populationStdDev_([10, 20, 30]) - 8.1649658) < 0.0001);
  assert.equal(app.calculateSafetyStock_([10, 20, 30], 30), 14);
});

test('monthly series contains the latest 36 complete months with zero-filled gaps', () => {
  const app = loadCode();
  const series = app.buildMonthlySeries_([
    {year: 2024, month: 6, quantity: 2, date: new Date(2024, 5, 1)}
  ], '2026-06', 36);

  assert.equal(series.length, 36);
  assert.deepEqual(
    {year: series[0].year, month: series[0].month},
    {year: 2023, month: 6}
  );
  assert.deepEqual(
    {year: series[35].year, month: series[35].month},
    {year: 2026, month: 5}
  );
  assert.equal(series.find(row => row.year === 2024 && row.month === 6).quantity, 2);
  assert.equal(series.filter(row => row.quantity > 0).length, 1);
});

test('demand metrics calculate non-zero months ADI CV2 and last sale age', () => {
  const app = loadCode();
  const series = app.buildMonthlySeries_([
    {year: 2024, month: 6, quantity: 2, date: new Date(2024, 5, 1)}
  ], '2026-06', 36);
  const metrics = app.calculateDemandMetrics_(series);

  assert.equal(metrics.nonZeroMonthCount, 1);
  assert.equal(metrics.monthsSinceLastSale, 23);
  assert.equal(metrics.lastSaleDate, '2024-06');
  assert.equal(metrics.adi, 36);
  assert.equal(metrics.cv2, 0);
});

test('history coverage counts complete source months without confusing zero sales', () => {
  const app = loadCode();
  const sales = {
    A: [{year: 2025, month: 10, quantity: 1}],
    B: [{year: 2026, month: 5, quantity: 2}]
  };
  assert.equal(app.availableHistoryMonths_(sales, '2026-06'), 8);
});

test('product analysis calculates threshold, status, and pack-rounded purchase', () => {
  const app = loadCode();
  const stock = {code: 'URN-001', name: 'Test', stock: 50, dataDate: '2026-06-11'};
  const history = [
    {year: 2026, month: 5, quantity: 100, date: new Date(2026, 4, 1)},
    {year: 2026, month: 4, quantity: 80, date: new Date(2026, 3, 1)},
    {year: 2026, month: 3, quantity: 60, date: new Date(2026, 2, 1)}
  ];

  const result = app.analyzeProduct_(stock, history, {
    leadTime: 30,
    packSize: 12,
    active: true,
    missing: false
  }, {model: 'weighted', startMonth: '2026-06'});

  assert.equal(result.monthlyDemand, 83);
  assert.equal(result.safetyStock, 27);
  assert.equal(result.criticalLevel, 110);
  assert.equal(result.status, 'critical');
  assert.deepEqual(Array.from(result.months), [83, 83, 83]);
  assert.equal(result.suggestedPurchase, 228);
});

test('product without sales history is marked insufficient', () => {
  const app = loadCode();
  const result = app.analyzeProduct_(
    {code: 'URN-002', name: 'Yeni', stock: 20, dataDate: '2026-06-11'},
    [],
    {leadTime: 20, packSize: 1, active: true, missing: false},
    {model: 'weighted', startMonth: '2026-06'}
  );

  assert.equal(result.status, 'veri_yetersiz');
  assert.equal(result.monthlyDemand, 0);
  assert.equal(result.suggestedPurchase, 0);
});

test('tracking levels normalize to priority, normal, or excluded', () => {
  const app = loadCode();
  assert.equal(app.normalizeTrackingLevel_('ÖNCELİKLİ'), 'ONCELIKLI');
  assert.equal(app.normalizeTrackingLevel_('oncelikli'), 'ONCELIKLI');
  assert.equal(app.normalizeTrackingLevel_('TAKIP ETME'), 'TAKIP_ETME');
  assert.equal(app.normalizeTrackingLevel_('bilinmeyen'), 'NORMAL');
  assert.equal(app.normalizeTrackingLevel_(''), 'NORMAL');
});

test('analysis excludes untracked products and sorts priority products first', () => {
  const app = loadCode({
    Utilities: {
      formatDate(date, timezone, pattern) {
        if (pattern === 'yyyy-MM-dd HH:mm:ss') return '2026-06-12 09:00:00';
        return date.toISOString().slice(0, 10);
      }
    }
  });
  app.readCurrentStock_ = () => [
    {code: 'NORMAL', name: 'Normal', stock: 2, dataDate: '2026-06-12'},
    {code: 'EXCLUDED', name: 'Takip Etme', stock: 2, dataDate: '2026-06-12'},
    {code: 'PRIORITY', name: 'Öncelikli', stock: 2, dataDate: '2026-06-12'}
  ];
  app.readMonthlySales_ = () => ({
    NORMAL: [{quantity: 10, date: new Date(2026, 4, 1)}],
    EXCLUDED: [{quantity: 10, date: new Date(2026, 4, 1)}],
    PRIORITY: [{quantity: 10, date: new Date(2026, 4, 1)}]
  });
  app.readProductSettings_ = () => ({
    NORMAL: {leadTime: 30, packSize: 1, active: true, trackingLevel: 'NORMAL'},
    EXCLUDED: {leadTime: 30, packSize: 1, active: true, trackingLevel: 'TAKIP_ETME'},
    PRIORITY: {leadTime: 30, packSize: 1, active: true, trackingLevel: 'ONCELIKLI'}
  });

  const result = app.calculateAnalysis_({now: new Date('2026-06-12T09:00:00Z')});

  assert.deepEqual(Array.from(result.products, product => product.code), ['PRIORITY', 'NORMAL']);
  assert.equal(result.products[0].trackingLevel, 'ONCELIKLI');
  assert.equal(result.summary.totalProducts, 2);
  assert.equal(result.summary.priorityCount, 1);
});

test('status thresholds distinguish low and normal stock', () => {
  const app = loadCode();
  assert.equal(app.stockStatus_(100, 100, true), 'critical');
  assert.equal(app.stockStatus_(120, 100, true), 'low');
  assert.equal(app.stockStatus_(126, 100, true), 'normal');
  assert.equal(app.stockStatus_(100, 100, false), 'veri_yetersiz');
});

test('monthly sales reader aggregates duplicate product-month rows', () => {
  const rows = [
    {Yil: 2026, Ay: 5, Urun_Kodu: 'URN-001', Satis_Miktari: 40},
    {Yil: 2026, Ay: 5, Urun_Kodu: 'URN-001', Satis_Miktari: 60},
    {Yil: 2026, Ay: 4, Urun_Kodu: 'URN-001', Satis_Miktari: 30},
    {Yil: 2026, Ay: 13, Urun_Kodu: 'URN-001', Satis_Miktari: 999}
  ];
  const app = loadCode();
  app.getSheet_ = () => ({});
  app.rowsAsObjects_ = () => rows;

  const grouped = app.readMonthlySales_();

  assert.equal(grouped['URN-001'].length, 2);
  assert.equal(grouped['URN-001'][1].quantity, 100);
  assert.equal(grouped['URN-001'][0].quantity, 30);
});

test('dashboard GET route remains read-only while POST supports protected tracking updates', () => {
  const app = loadCode();
  app.getDashboardData_ = () => ({products: []});

  assert.equal(app.route_('dashboard').ok, true);
  assert.equal(app.route_('forecast').ok, false);
  assert.equal(typeof app.doPost, 'function');
});

test('freshness detects stale, missing, and inconsistent dates', () => {
  const app = loadCode({
    Utilities: {
      formatDate(date, timezone, pattern) {
        assert.equal(timezone, 'Europe/Istanbul');
        assert.equal(pattern, 'yyyy-MM-dd');
        return date.toISOString().slice(0, 10);
      }
    }
  });
  const now = new Date('2026-06-11T09:00:00Z');

  assert.equal(app.calculateFreshness_([{dataDate: ''}], now).missing, true);
  assert.equal(app.calculateFreshness_([
    {dataDate: '2026-06-10'},
    {dataDate: '2026-06-09'}
  ], now).inconsistent, true);
  assert.equal(app.calculateFreshness_([{dataDate: '2026-06-09'}], now).stale, true);
  assert.equal(app.calculateFreshness_([{dataDate: '2026-06-10'}], now).stale, false);
});

test('alert time parser accepts HH:mm and falls back to 09:00', () => {
  const app = loadCode();
  assert.deepEqual(
    {hour: app.parseAlertTime_('14:35').hour, minute: app.parseAlertTime_('14:35').minute},
    {hour: 14, minute: 35}
  );
  assert.deepEqual(
    {hour: app.parseAlertTime_('invalid').hour, minute: app.parseAlertTime_('invalid').minute},
    {hour: 9, minute: 0}
  );
});

test('analysis writer replaces rows and writes all fourteen columns', () => {
  const calls = [];
  const sheet = {
    getLastRow: () => 4,
    getLastColumn: () => 14,
    getRange(row, column, rows, columns) {
      return {
        clearContent() {
          calls.push({type: 'clear', row, column, rows, columns});
        },
        setValues(values) {
          calls.push({type: 'write', row, column, rows, columns, values});
        }
      };
    }
  };
  const app = loadCode();
  app.getSheet_ = () => sheet;

  app.writeAnalysis_({
    calculatedAt: '2026-06-11 09:00:00',
    products: [{
      code: 'URN-001', name: 'Ürün', stock: 10, monthlyDemand: 20,
      demandDeviation: 3.5, safetyStock: 6, criticalLevel: 26,
      months: [20, 20, 20], suggestedPurchase: 60, status: 'critical',
      dataDate: '2026-06-10'
    }]
  });

  assert.deepEqual(calls[0], {
    type: 'clear', row: 2, column: 1, rows: 3, columns: 14
  });
  assert.equal(calls[1].type, 'write');
  assert.equal(calls[1].values.length, 1);
  assert.equal(calls[1].values[0].length, 14);
  assert.equal(calls[1].values[0][1], 'URN-001');
});

test('daily email includes a compact summary and attachment note', () => {
  const app = loadCode();
  const email = app.buildDailyEmail_({
    calculatedAt: '2026-06-11 09:00:00',
    freshness: {latestDate: '2026-06-10'},
    summary: {
      totalProducts: 2, criticalCount: 0, lowCount: 1,
      insufficientCount: 0, purchaseTotal: 24
    },
    products: [
      {
        code: 'URN-001', name: 'Bir', stock: 30, criticalLevel: 20,
        months: [10, 10, 10], suggestedPurchase: 0, status: 'normal'
      },
      {
        code: 'URN-002', name: 'İki', stock: 15, criticalLevel: 18,
        months: [12, 12, 12], suggestedPurchase: 24, status: 'low'
      }
    ]
  });

  assert.match(email.subject, /11\.06\.2026|2026-06-11/);
  assert.match(email.body, /Kritik ürün bulunmuyor/i);
  assert.match(email.body, /24/);
  assert.match(email.body, /2026-06-10/);
  assert.match(email.body, /Excel/i);
  assert.doesNotMatch(email.body, /URN-002/);
  assert.match(email.htmlBody, /Stok Pusulası/);
});

test('daily email lists only the five most urgent critical products', () => {
  const app = loadCode();
  const products = Array.from({length: 7}, (_, index) => ({
    code: `URN-${index + 1}`,
    name: `Kritik Ürün ${index + 1}`,
    stock: index,
    criticalLevel: 20,
    months: [10, 10, 10],
    suggestedPurchase: 50 - index,
    status: 'critical'
  }));
  const email = app.buildDailyEmail_({
    calculatedAt: '2026-06-11 09:00:00',
    freshness: {latestDate: '2026-06-10'},
    summary: {
      totalProducts: 7, criticalCount: 7, lowCount: 0,
      insufficientCount: 0, purchaseTotal: 329
    },
    products
  });
  assert.match(email.body, /URN-1/);
  assert.match(email.body, /URN-5/);
  assert.doesNotMatch(email.body, /URN-6/);
  assert.doesNotMatch(email.body, /URN-7/);
});

test('purchase report rows include only positive suggestions sorted descending', () => {
  const app = loadCode();
  const rows = app.buildPurchaseReportRows_([
    {
      code: 'URN-LOW', name: 'Düşük', stock: 4, criticalLevel: 8,
      months: [2, 2, 2], suggestedPurchase: 6, status: 'low',
      trackingLevel: 'ONCELIKLI'
    },
    {
      code: 'URN-NONE', name: 'Yok', stock: 20, criticalLevel: 8,
      months: [2, 2, 2], suggestedPurchase: 0, status: 'normal',
      trackingLevel: 'NORMAL'
    },
    {
      code: 'URN-HIGH', name: 'Yüksek', stock: 1, criticalLevel: 10,
      months: [5, 5, 5], suggestedPurchase: 20, status: 'critical',
      trackingLevel: 'NORMAL'
    }
  ]);

  assert.deepEqual(Array.from(rows, row => Array.from(row)), [
    ['URN-LOW', 'Düşük', 4, 8, 6, 6, 'Düşük', 'Öncelikli'],
    ['URN-HIGH', 'Yüksek', 1, 10, 15, 20, 'Kritik', 'Normal']
  ]);
});

test('tracking update rejects invalid token and writes valid batch updates', () => {
  const written = [];
  const app = loadCode({
    PropertiesService: {
      getScriptProperties() {
        return {getProperty: () => 'secret-token'};
      }
    }
  });
  app.updateTrackingLevels_ = updates => {
    written.push(...updates);
    return {updated: updates.length};
  };

  assert.throws(() => app.handleTrackingUpdate_({
    token: 'wrong',
    updates: [{code: 'URN-001', trackingLevel: 'ONCELIKLI'}]
  }), /erişim anahtarı/i);
  assert.throws(() => app.handleTrackingUpdate_({
    token: 'secret-token',
    updates: [{code: 'URN-001', trackingLevel: 'BILINMEYEN'}]
  }), /takip seviyesi/i);

  const result = app.handleTrackingUpdate_({
    token: 'secret-token',
    updates: [
      {code: 'URN-001', trackingLevel: 'ÖNCELİKLİ'},
      {code: 'URN-002', trackingLevel: 'TAKIP_ETME'}
    ]
  });

  assert.equal(result.updated, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(written)), [
    {code: 'URN-001', trackingLevel: 'ONCELIKLI'},
    {code: 'URN-002', trackingLevel: 'TAKIP_ETME'}
  ]);
});

test('daily analysis email sends xlsx attachment and trashes temporary spreadsheet', () => {
  const sent = [];
  const trashed = [];
  const app = loadCode({
    MailApp: {
      sendEmail(message) {
        sent.push(message);
      }
    }
  });
  const analysis = {
    calculatedAt: '2026-06-11 09:00:00',
    freshness: {latestDate: '2026-06-10'},
    summary: {
      totalProducts: 1, criticalCount: 1, lowCount: 0,
      insufficientCount: 0, purchaseTotal: 20
    },
    products: [{
      code: 'URN-001', name: 'Ürün', stock: 1, criticalLevel: 10,
      months: [5, 5, 5], suggestedPurchase: 20, status: 'critical'
    }]
  };
  app.getDashboardData_ = () => analysis;
  app.writeAnalysis_ = () => {};
  app.getSetting_ = () => 'test@example.com';
  app.createPurchaseReportAttachment_ = () => ({
    blob: {name: 'Stok_Alim_Onerileri_2026-06-11.xlsx'},
    temporaryFileId: 'temp-123'
  });
  app.trashTemporaryReport_ = id => trashed.push(id);

  app.runDailyAnalysisAndEmail();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments.length, 1);
  assert.equal(sent[0].attachments[0].name, 'Stok_Alim_Onerileri_2026-06-11.xlsx');
  assert.match(sent[0].htmlBody, /Stok Pusulası/);
  assert.deepEqual(trashed, ['temp-123']);
});

test('recipient parser keeps valid comma-separated email addresses', () => {
  const app = loadCode();
  assert.deepEqual(
    Array.from(app.parseRecipients_('a@example.com, invalid, b@test.com ; c@site.org')),
    ['a@example.com', 'b@test.com', 'c@site.org']
  );
});

test('daily trigger schedules the new analysis handler at configured time', () => {
  const removed = [];
  const scheduled = {};
  const triggers = [
    {getHandlerFunction: () => 'sendCriticalStockAlert'},
    {getHandlerFunction: () => 'runDailyAnalysisAndEmail'},
    {getHandlerFunction: () => 'otherHandler'}
  ];
  const builder = {
    timeBased() { return this; },
    everyDays(value) { scheduled.days = value; return this; },
    atHour(value) { scheduled.hour = value; return this; },
    nearMinute(value) { scheduled.minute = value; return this; },
    inTimezone(value) { scheduled.timezone = value; return this; },
    create() { scheduled.created = true; return this; }
  };
  const app = loadCode({
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: trigger => removed.push(trigger.getHandlerFunction()),
      newTrigger(handler) {
        scheduled.handler = handler;
        return builder;
      }
    }
  });
  app.getSetting_ = () => '08:25';

  app.createDailyAnalysisTrigger();

  assert.deepEqual(removed, ['sendCriticalStockAlert', 'runDailyAnalysisAndEmail']);
  assert.deepEqual(scheduled, {
    handler: 'runDailyAnalysisAndEmail',
    days: 1,
    hour: 8,
    minute: 25,
    timezone: 'Europe/Istanbul',
    created: true
  });
});

test('browser copies expose tracking management and protected POST updates', () => {
  const {html, outputHtml} = sources();
  [html, outputHtml].forEach(source => {
    assert.match(source, /data-view=["']dashboard["']/);
    assert.match(source, /data-view=["']analysis["']/);
    assert.match(source, /data-view=["']forecast["']/);
    assert.match(source, /data-view=["']tracking["']/);
    assert.match(source, /data-view=["']settings["']/);
    assert.match(source, /id=["']freshnessNotice["']/);
    assert.match(source, /id=["']analysisSearch["']/);
    assert.match(source, /id=["']analysisStatus["']/);
    assert.match(source, /id=["']analysisRows["']/);
    assert.match(source, /id=["']forecastRows["']/);
    assert.match(source, /id=["']trackingRows["']/);
    assert.match(source, /id=["']trackingSearch["']/);
    assert.match(source, /id=["']trackingFilter["']/);
    assert.match(source, /id=["']saveTracking["']/);
    assert.match(source, /id=["']accessToken["']/);
    assert.doesNotMatch(source, /movement|orderCreate|orderStatus/i);
    assert.doesNotMatch(source, /Stok Geçmişi|Açık Siparişler/);
    assert.match(source, /method:\s*["']POST["']/i);
    assert.match(source, /updateTrackingLevels/);
  });
});

test('published and output HTML copies remain identical', () => {
  const {html, outputHtml} = sources();
  assert.equal(html.replace(/\r\n/g, '\n'), outputHtml.replace(/\r\n/g, '\n'));
});
