const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const codeSource = fs.readFileSync(path.join(root, 'outputs', 'Code.gs'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'outputs', 'index.html'), 'utf8');
const publishedHtmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadCode(overrides = {}) {
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    isFinite,
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
  vm.runInContext(codeSource, context, {filename: 'Code.gs'});
  return context;
}

test('GET forecast is rejected because it can persist data', () => {
  const app = loadCode();
  app.calculateForecasts_ = () => ({forecasts: [], purchaseTotal: 0});

  const result = app.route_('forecast', {}, false);

  assert.equal(result.ok, false);
  assert.match(result.error, /Geçersiz|izin|desteklenmiyor/i);
});

test('dashboard forecast calculation is explicitly non-persistent', () => {
  const app = loadCode({
    Utilities: {
      formatDate() {
        return '2026-06';
      }
    }
  });
  let request;
  app.readProducts_ = () => [];
  app.readMovements_ = () => [];
  app.readOrders_ = () => [];
  app.enrichProducts_ = () => [];
  app.getSetting_ = () => 'hybrid';
  app.calculateForecasts_ = value => {
    request = value;
    return {forecasts: [], purchaseTotal: 0};
  };

  app.getDashboardData_();

  assert.equal(request.persist, false);
});

test('dashboard includes normalized movements and orders', () => {
  const app = loadCode({
    Utilities: {
      formatDate() {
        return '2026-06';
      }
    }
  });
  app.readProducts_ = () => [];
  app.enrichProducts_ = () => [];
  app.getSetting_ = () => 'hybrid';
  app.calculateForecasts_ = () => ({forecasts: [], purchaseTotal: 0});
  app.readMovements_ = () => [{id: 'MOV-1'}];
  app.readOrders_ = () => [{id: 'ORD-1'}];

  const result = app.getDashboardData_();

  assert.deepEqual(Array.from(result.movements, row => row.id), ['MOV-1']);
  assert.deepEqual(Array.from(result.orders, row => row.id), ['ORD-1']);
});

test('authenticated POST forecast requests persistence', () => {
  const app = loadCode();
  let request;
  app.verifyToken_ = () => {};
  app.calculateForecasts_ = value => {
    request = value;
    return {forecasts: [], purchaseTotal: 0};
  };

  const result = app.route_('forecast', {token: 'valid'}, true);

  assert.equal(result.ok, true);
  assert.equal(request.persist, true);
});

test('authenticated POST orderCreate routes the order payload', () => {
  const app = loadCode();
  let received;
  app.verifyToken_ = () => {};
  app.addOrder_ = order => {
    received = order;
    return {id: 'ORD-1'};
  };

  const result = app.route_('orderCreate', {
    token: 'valid',
    order: {productCode: 'URN-001', quantity: 12}
  }, true);

  assert.equal(result.ok, true);
  assert.equal(received.productCode, 'URN-001');
  assert.equal(received.quantity, 12);
});

test('order validation requires known product, positive quantity, dates, and valid status', () => {
  const app = loadCode();
  const products = [{code: 'URN-001'}];

  assert.throws(() => app.validateOrder_({
    productCode: 'UNKNOWN', quantity: 2, orderDate: '2026-06-10',
    expectedDelivery: '2026-06-15', status: 'BEKLIYOR'
  }, products), /bulunamadı/i);
  assert.throws(() => app.validateOrder_({
    productCode: 'URN-001', quantity: 0, orderDate: '2026-06-10',
    expectedDelivery: '2026-06-15', status: 'BEKLIYOR'
  }, products), /sıfırdan büyük/i);
  assert.throws(() => app.validateOrder_({
    productCode: 'URN-001', quantity: 2, orderDate: 'bad-date',
    expectedDelivery: '2026-06-15', status: 'BEKLIYOR'
  }, products), /tarih/i);
  assert.throws(() => app.validateOrder_({
    productCode: 'URN-001', quantity: 2, orderDate: '2026-06-10',
    expectedDelivery: '2026-06-15', status: 'UNKNOWN'
  }, products), /durum/i);
  assert.throws(() => app.validateOrder_({
    productCode: 'URN-001', quantity: 2, orderDate: '2026-06-10',
    expectedDelivery: '2026-06-09', status: 'BEKLIYOR'
  }, products), /teslim tarihi/i);

  const valid = app.validateOrder_({
    productCode: ' URN-001 ', quantity: '12', orderDate: '2026-06-10',
    expectedDelivery: '2026-06-15', status: 'yolda', note: ' test '
  }, products);
  assert.deepEqual(
    {
      productCode: valid.productCode,
      quantity: valid.quantity,
      orderDate: valid.orderDate,
      expectedDelivery: valid.expectedDelivery,
      status: valid.status,
      note: valid.note
    },
    {
      productCode: 'URN-001',
      quantity: 12,
      orderDate: '2026-06-10',
      expectedDelivery: '2026-06-15',
      status: 'YOLDA',
      note: 'test'
    }
  );
});

test('movement history preserves time and returns newest records first', () => {
  const rows = [
    {
      Hareket_ID: 'MOV-1', Tarih: new Date('2026-06-10T08:00:00Z'), Urun_Kodu: 'URN-001',
      Islem_Turu: 'GIRIS', Miktar: 2, Onceki_Stok: 3, Yeni_Stok: 5, Aciklama: '', Kullanici: 'a'
    },
    {
      Hareket_ID: 'MOV-2', Tarih: new Date('2026-06-10T12:00:00Z'), Urun_Kodu: 'URN-001',
      Islem_Turu: 'CIKIS', Miktar: 1, Onceki_Stok: 5, Yeni_Stok: 4, Aciklama: '', Kullanici: 'b'
    }
  ];
  const app = loadCode({
    Utilities: {
      formatDate(date, timezone, pattern) {
        assert.equal(timezone, 'Europe/Istanbul');
        if (pattern === 'yyyy-MM-dd') return date.toISOString().slice(0, 10);
        if (pattern === 'yyyy-MM-dd HH:mm:ss') return date.toISOString().replace('T', ' ').slice(0, 19);
        throw new Error(`Unexpected pattern: ${pattern}`);
      }
    }
  });
  app.getSheet_ = () => ({});
  app.rowsAsObjects_ = () => rows;

  const result = app.readMovements_();

  assert.deepEqual(Array.from(result, row => row.id), ['MOV-2', 'MOV-1']);
  assert.equal(result[0].date, '2026-06-10');
  assert.equal(result[0].timestamp, '2026-06-10 12:00:00');
});

test('order status update changes only the matching order row', () => {
  const values = [
    ['Siparis_ID', 'Siparis_Tarihi', 'Urun_Kodu', 'Miktar', 'Beklenen_Teslim', 'Durum', 'Aciklama'],
    ['ORD-1', new Date('2026-06-01'), 'URN-001', 10, new Date('2026-06-10'), 'BEKLIYOR', 'A'],
    ['ORD-2', new Date('2026-06-02'), 'URN-002', 20, new Date('2026-06-11'), 'YOLDA', 'B']
  ];
  const writes = [];
  const sheet = {
    getDataRange() {
      return {getValues: () => values};
    },
    getRange(row, column) {
      return {
        setValue(value) {
          writes.push({row, column, value});
        }
      };
    }
  };
  const lock = {waitLock() {}, releaseLock() {}};
  const app = loadCode({
    LockService: {getScriptLock: () => lock}
  });
  app.getSheet_ = () => sheet;

  const result = app.updateOrderStatus_({orderId: 'ORD-2', status: 'TESLIM'});

  assert.deepEqual(writes, [{row: 3, column: 6, value: 'TESLIM'}]);
  assert.equal(result.orderId, 'ORD-2');
  assert.equal(result.status, 'TESLIM');
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

test('daily trigger uses configured hour and minute', () => {
  const scheduled = {};
  const builder = {
    timeBased() {
      return this;
    },
    everyDays(days) {
      scheduled.days = days;
      return this;
    },
    atHour(hour) {
      scheduled.hour = hour;
      return this;
    },
    nearMinute(minute) {
      scheduled.minute = minute;
      return this;
    },
    inTimezone(timezone) {
      scheduled.timezone = timezone;
      return this;
    },
    create() {
      scheduled.created = true;
      return this;
    }
  };
  const app = loadCode({
    ScriptApp: {
      getProjectTriggers() {
        return [];
      },
      deleteTrigger() {},
      newTrigger(handler) {
        scheduled.handler = handler;
        return builder;
      }
    }
  });
  app.getSetting_ = () => '14:35';

  app.createDailyCriticalStockTrigger();

  assert.deepEqual(scheduled, {
    handler: 'sendCriticalStockAlert',
    days: 1,
    hour: 14,
    minute: 35,
    timezone: 'Europe/Istanbul',
    created: true
  });
});

test('browser copies initialize planning month in Europe/Istanbul without UTC conversion', () => {
  [htmlSource, publishedHtmlSource].forEach(source => {
    assert.match(source, /function currentMonthInIstanbul\(/);
    assert.match(source, /timeZone:\s*["']Europe\/Istanbul["']/);
    assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*7\)/);
  });
});

test('browser copies include monochrome operations views and controls', () => {
  [htmlSource, publishedHtmlSource].forEach(source => {
    assert.match(source, /--canvas:\s*#f[0-9a-f]{5}/i);
    assert.match(source, /--ink:\s*#1[0-9a-f]{5}/i);
    assert.match(source, /data-view=["']history["']/);
    assert.match(source, /data-view=["']orders["']/);
    assert.match(source, /id=["']historyStart["']/);
    assert.match(source, /id=["']historyEnd["']/);
    assert.match(source, /id=["']historyProduct["']/);
    assert.match(source, /id=["']historyType["']/);
    assert.match(source, /id=["']orderDialog["']/);
    assert.match(source, /id=["']orderForm["']/);
    assert.match(source, /id=["']ordersRows["']/);
  });
});

test('published and output HTML copies remain identical', () => {
  assert.equal(publishedHtmlSource.replace(/\r\n/g, '\n'), htmlSource.replace(/\r\n/g, '\n'));
});
