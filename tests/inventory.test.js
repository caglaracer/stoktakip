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
  app.enrichProducts_ = () => [];
  app.getSetting_ = () => 'hybrid';
  app.calculateForecasts_ = value => {
    request = value;
    return {forecasts: [], purchaseTotal: 0};
  };

  app.getDashboardData_();

  assert.equal(request.persist, false);
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
