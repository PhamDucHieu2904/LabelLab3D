/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const optics = { clarity: 0, density: 1, turbidity: 1, brightness: .45, scattering: .9, roughness: .8, ior: 1.333 };
const variants = {};
for (const pooled of [false, true]) {
  const suffix = pooled ? 'pooled' : 'direct';
  variants[`fixed-${suffix}`] = { underside: true, pooled };
  variants[`color-${suffix}`] = { underside: true, pooled, editable: true, liveColor: '#dc6844' };
  variants[`optics-${suffix}`] = { underside: true, pooled, editable: true, liveOptics: optics };
}
const run = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), JSON.stringify(variants)], { cwd: path.resolve(__dirname, '../..'), windowsHide: true, stdio: 'inherit' });
assert.equal(run.status, 0, 'Headless run exits cleanly');
const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'report.json')));
const events = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-events.json')));
const compilerErrors = events.filter(event => event.method === 'Runtime.exceptionThrown' || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'));
assert.equal(compilerErrors.length, 0, JSON.stringify(compilerErrors));
const luminance = rgb => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
for (const [name, value] of Object.entries(report)) {
  const initial = value.frames.initial.samples;
  assert.ok(Math.abs(luminance(initial.underside) - luminance(initial.side)) < 15, `${name}: underside remains within 15 brightness units of side`);
  assert.ok(initial.underside[0] > initial.underside[2] + 10, `${name}: underside retains cream pigment`);
  if (value.frames.edited) {
    assert.notDeepEqual(value.frames.edited.samples.underside, initial.underside, `${name}: live edit changes pixels`);
    assert.deepEqual(value.frames.reset.samples, initial, `${name}: reset restores exact pixels`);
  }
  console.log(name, JSON.stringify(Object.fromEntries(Object.entries(value.frames).map(([stage, frame]) => [stage, frame.samples]))));
}
assert.deepEqual(report['fixed-direct'].samples, report['fixed-pooled'].samples, 'Pooled and direct rendered pixels match');
console.log('PASS: 6 headless cases; cream underside, pooled parity, live edits/reset, zero browser/compiler errors.');
