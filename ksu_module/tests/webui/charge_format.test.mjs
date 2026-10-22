import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBatteryChips, buildChargeChips, bypassOf, parseInfo } from '../../webui/src/logic/chargeFormat.ts';

const FULL = [
  'usb_real_type=USB_PD',
  'usb_pd_active=1',
  'usb_input_limit=2000000',
  'usb_voltage=9012000',
  'batt_fcc_max=3500000',
  'batt_thermal_level=3',
  'batt_charge_type=Fast',
  'batt_charger_temp=412',
  'batt_voltage=4210000',
  'batt_current=-3100000',
].join('\n');

const texts = (stdout) => buildChargeChips(parseInfo(stdout)).map((chip) => chip.text);
const find = (stdout, prefix) => buildChargeChips(parseInfo(stdout)).find((chip) => chip.text.startsWith(prefix));

test('parseInfo reads key=value lines and trims values', () => {
  const info = parseInfo('a=1\nb= two \n');
  assert.equal(info.get('a'), '1');
  assert.equal(info.get('b'), 'two');
});

test('parseInfo keeps an equals sign inside the value', () => {
  assert.equal(parseInfo('a=b=c').get('a'), 'b=c');
});

test('parseInfo ignores blank lines, lines without a key and lines without a value separator', () => {
  const info = parseInfo('\n=1\nnoequals\nok=1\n');
  assert.deepEqual([...info.keys()], ['ok']);
});

test('full output produces every chip with converted units', () => {
  assert.deepEqual(texts(FULL), [
    'зарядник: USB_PD',
    'PD: активен',
    'лимит входа: 2000 мА',
    'напряжение входа: 9.01 В',
    'лимит тока батареи: 3.50 А',
    'температурный уровень: 3',
    'режим заряда: Fast',
    'температура зарядника: 41.2 °C',
    'в батарею: 13.1 Вт',
  ]);
});

test('PD chip is ok when active and off otherwise', () => {
  assert.equal(find('usb_pd_active=1', 'PD').state, 'ok');
  assert.equal(find('usb_pd_active=0', 'PD').state, 'off');
  assert.equal(find('usb_pd_active=0', 'PD').text, 'PD: нет');
});

test('temperature level 0 is ok and any other level is neutral', () => {
  assert.equal(find('batt_thermal_level=0', 'температурный').state, 'ok');
  assert.equal(find('batt_thermal_level=5', 'температурный').state, '');
});

test('input limit is rounded to whole milliamps', () => {
  assert.equal(find('usb_input_limit=1499600', 'лимит входа').text, 'лимит входа: 1500 мА');
});

test('charger temperature handles a value below 10 degrees', () => {
  assert.equal(find('batt_charger_temp=85', 'температура зарядника').text, 'температура зарядника: 8.5 °C');
});

test('battery power is shown only while charging (negative current)', () => {
  assert.equal(find('batt_voltage=4000000\nbatt_current=-2500000', 'в батарею').text, 'в батарею: 10.0 Вт');
  assert.equal(find('batt_voltage=4000000\nbatt_current=2500000', 'в батарею'), undefined);
  assert.equal(find('batt_voltage=4000000\nbatt_current=0', 'в батарею'), undefined);
});

test('battery power needs both voltage and current', () => {
  assert.equal(find('batt_current=-2500000', 'в батарею'), undefined);
  assert.equal(find('batt_voltage=4000000', 'в батарею'), undefined);
});

test('non numeric values are skipped instead of printing NaN', () => {
  const result = texts('usb_input_limit=abc\nusb_voltage=\nbatt_fcc_max=--\nbatt_thermal_level=x\nbatt_charger_temp=?');
  assert.deepEqual(result, ['нет данных от драйвера зарядки']);
  assert.ok(!result.join(' ').includes('NaN'));
});

test('missing nodes only drop their own chips', () => {
  assert.deepEqual(texts('usb_real_type=USB\nbatt_charge_type=Taper'), ['зарядник: USB', 'режим заряда: Taper']);
});

test('empty output shows a single placeholder chip', () => {
  const chips = buildChargeChips(parseInfo(''));
  assert.equal(chips.length, 1);
  assert.equal(chips[0].text, 'нет данных от драйвера зарядки');
  assert.equal(chips[0].state, 'off');
});

const keys = (stdout) => buildChargeChips(parseInfo(stdout)).map((chip) => chip.key);

test('every chip has a non-empty key and the keys are unique', () => {
  const all = keys(FULL);
  assert.equal(all.length, 9);
  assert.ok(all.every((key) => key.length > 0));
  assert.equal(new Set(all).size, all.length);
});

test('a chip keeps its key when its value changes', () => {
  assert.deepEqual(keys('usb_input_limit=1000000'), keys('usb_input_limit=2000000'));
  assert.deepEqual(keys('usb_pd_active=1'), keys('usb_pd_active=0'));
  assert.deepEqual(keys('batt_thermal_level=0'), keys('batt_thermal_level=7'));
});

test('a chip keeps its key when other chips appear or disappear', () => {
  const alone = keys('batt_charge_type=Fast');
  const withNeighbours = keys('usb_real_type=USB\nusb_pd_active=1\nbatt_charge_type=Fast');
  assert.deepEqual(alone, ['charge-type']);
  assert.ok(withNeighbours.includes('charge-type'));
});

test('the charging power chip toggles without disturbing the others', () => {
  const charging = keys('batt_charge_type=Fast\nbatt_voltage=4000000\nbatt_current=-2000000');
  const idle = keys('batt_charge_type=Fast\nbatt_voltage=4000000\nbatt_current=0');
  assert.deepEqual(charging, ['charge-type', 'power']);
  assert.deepEqual(idle, ['charge-type']);
});

test('the placeholder chip has its own key so it is replaced once data arrives', () => {
  assert.deepEqual(keys(''), ['empty']);
  assert.ok(!keys('usb_real_type=USB').includes('empty'));
});

const battery = (stdout) => buildBatteryChips(parseInfo(stdout));

test('battery chips are always the same four, in the same order', () => {
  assert.deepEqual(battery('').map((chip) => chip.key), ['status', 'current', 'capacity', 'temp']);
  assert.deepEqual(battery(FULL + '\nbatt_status=Charging\nbatt_capacity=87\nbatt_temp=312').map((chip) => chip.key), [
    'status',
    'current',
    'capacity',
    'temp',
  ]);
});

test('battery chips convert units', () => {
  const chips = battery('batt_status=Charging\nbatt_current=-37841\nbatt_capacity=87\nbatt_temp=312');
  assert.deepEqual(
    chips.map((chip) => chip.text),
    ['статус: Charging', 'ток: -38 мА', 'заряд: 87%', 'температура: 31.2 °C'],
  );
  assert.ok(chips.every((chip) => chip.state === ''));
});

test('battery chips fall back to "нет данных" when a node is missing', () => {
  const chips = battery('');
  assert.deepEqual(
    chips.map((chip) => chip.text),
    ['статус: нет данных', 'ток: нет данных', 'заряд: нет данных', 'температура: нет данных'],
  );
  assert.ok(chips.every((chip) => chip.state === 'off'));
});

test('battery chips only drop to "нет данных" for the node that is missing', () => {
  const chips = battery('batt_status=Full\nbatt_capacity=100');
  assert.equal(chips[0].text, 'статус: Full');
  assert.equal(chips[1].text, 'ток: нет данных');
  assert.equal(chips[2].text, 'заряд: 100%');
  assert.equal(chips[3].text, 'температура: нет данных');
});

test('battery chips treat a zero current and a zero temperature as real values', () => {
  const chips = battery('batt_current=0\nbatt_temp=0');
  assert.equal(chips[1].text, 'ток: 0 мА');
  assert.equal(chips[3].text, 'температура: 0.0 °C');
});

test('battery chips skip non numeric current and temperature instead of printing NaN', () => {
  const chips = battery('batt_current=abc\nbatt_temp=?');
  assert.equal(chips[1].text, 'ток: нет данных');
  assert.equal(chips[3].text, 'температура: нет данных');
});

test('bypassOf reads the path and whether the switch is on', () => {
  assert.deepEqual(bypassOf(parseInfo('bypass_path=/sys/x/bypass_charging\nbypass=1')), {
    path: '/sys/x/bypass_charging',
    on: true,
  });
  assert.deepEqual(bypassOf(parseInfo('bypass_path=/sys/x/bypass_charging\nbypass=0')), {
    path: '/sys/x/bypass_charging',
    on: false,
  });
});

test('bypassOf treats a path with no readable value as off', () => {
  assert.deepEqual(bypassOf(parseInfo('bypass_path=/sys/x/bypass_charging')), { path: '/sys/x/bypass_charging', on: false });
});

test('bypassOf is undefined when the kernel has no switch', () => {
  assert.equal(bypassOf(parseInfo('')), undefined);
  assert.equal(bypassOf(parseInfo('bypass=1')), undefined);
  assert.equal(bypassOf(parseInfo('bypass_path=')), undefined);
});
