const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const loadSource = require('../lib/load-ts-source.cjs').createSourceLoader();
const root = path.resolve(__dirname, '../..');

const {
  classifySceneWeight,
  detectHardwareTier,
  resolveQualityBudget,
  stepTierDown,
  parseQualityPreference,
  loadQualityPreference,
  saveQualityPreference,
  loadWebglSafeMode,
  markWebglSafeMode,
} = loadSource(path.join(root, 'lib/mockup/quality-tier'));

test('detectHardwareTier accurately classifies Ultra, High, Medium and Low GPUs across Windows/macOS/Mobile', () => {
  const base = {
    maxTextureSize: 16384,
    maxSamples: 8,
    hardwareConcurrency: 12,
    deviceMemoryGb: 16,
    isMobile: false,
    supportsHalfFloat: true,
  };

  // Ultra GPUs (RTX 2060+, RTX 4070, RX 7800 XT, Apple M3 Pro/Max, macOS Safari 12-core Apple GPU)
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11)' }), 'ultra');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU)' }), 'ultra');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (AMD, AMD Radeon RX 6700 XT)' }), 'ultra');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'Apple GPU', hardwareConcurrency: 12 }), 'ultra');

  // High GPUs (GTX 1650, RTX 3050, Mac M1/M2 8-core)
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11)', hardwareConcurrency: 8 }), 'high');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU)', hardwareConcurrency: 8 }), 'high');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'Apple GPU', hardwareConcurrency: 8 }), 'high');

  // Medium GPUs (Intel Iris Xe, UHD 770, Radeon Vega/TM Graphics, GTX 1050, modern iPhone)
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)', hardwareConcurrency: 8 }), 'medium');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11)', hardwareConcurrency: 8 }), 'medium');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (AMD, AMD Radeon(TM) Graphics)', hardwareConcurrency: 8 }), 'medium');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'Apple GPU', isMobile: true, hardwareConcurrency: 6, deviceMemoryGb: 6 }), 'medium');

  // Low GPUs (SwiftShader software, Intel HD 520, bare Intel UHD Graphics, legacy Radeon R5/HD, GT 710/820M/Quadro K620, weak mobile/office PC, no half-float)
  assert.equal(detectHardwareTier({ ...base, rendererName: 'Google SwiftShader' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Intel, Intel(R) HD Graphics 520)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (AMD, AMD Radeon(TM) R5 Graphics Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (AMD, AMD Radeon HD 7470 Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce GT 710 Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA GeForce 820M Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (NVIDIA, NVIDIA Quadro K620 Direct3D11)' }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)', hardwareConcurrency: 4, deviceMemoryGb: 4 }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: '', hardwareConcurrency: 4 }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'Mali-G52', isMobile: true, hardwareConcurrency: 4, deviceMemoryGb: 4 }), 'low');
  assert.equal(detectHardwareTier({ ...base, rendererName: 'NVIDIA GeForce RTX 4070', supportsHalfFloat: false }), 'low');
});

test('classifySceneWeight separates light boxes/cans from medium PET and heavy optical glass bottles', () => {
  assert.equal(classifySceneWeight(null, true), 'light');
  assert.equal(classifySceneWeight({ id: 'can-330', packaging: 'can' }, false), 'light');
  assert.equal(classifySceneWeight({ id: 'pet-350-juice', packaging: 'pet' }, false), 'medium');
  assert.equal(classifySceneWeight({ id: 'pp-1000', packaging: 'pp' }, false), 'medium');
  assert.equal(classifySceneWeight({ id: 'glass-290-basil-web', packaging: 'glass' }, false), 'heavy');
  assert.equal(classifySceneWeight({ id: 'glass-300-milk', packaging: 'glass' }, false), 'heavy');
  assert.equal(classifySceneWeight({ id: 'pet-500-short-label', packaging: 'pet' }, false), 'heavy');
  assert.equal(classifySceneWeight({ id: 'pet-500-full-label', packaging: 'pet' }, false), 'heavy');
  assert.equal(classifySceneWeight({ id: 'pet-1500-short-label', packaging: 'pet' }, false), 'heavy');
});

test('4x3 quality matrix keeps boxes/cans sharp with 4x MSAA on Medium/High/Ultra and optimizes Low tier against GPU TDR', () => {
  // Light scenes (Parametric Boxes & Trays, Cans) are full-scale + 4x MSAA immediately from Medium up!
  for (const tier of ['medium', 'high', 'ultra']) {
    const b = resolveQualityBudget(tier, 'light', 4);
    assert.equal(b.interactiveScale, 1, `${tier}/light full scale`);
    assert.equal(b.interactiveMsaa, 4, `${tier}/light 4x MSAA`);
    assert.equal(b.idleRefineMs, 0, `${tier}/light needs no delayed refine`);
    assert.equal(b.simplifiedOptics, false, `${tier}/light retains full optics`);
  }

  // Heavy glass on High (GTX 1650 class) stays fluid interactively then refines to crisp 4x MSAA on idle!
  const highHeavy = resolveQualityBudget('high', 'heavy', 4);
  assert.ok(highHeavy.interactiveScale < 1);
  assert.equal(highHeavy.interactiveMsaa, 0);
  assert.equal(highHeavy.idleScale, 1);
  assert.equal(highHeavy.idleMsaa, 4);
  assert.equal(highHeavy.transmissionScale, 1);
  assert.equal(highHeavy.simplifiedOptics, false);
  assert.ok(highHeavy.idleRefineMs > 0);

  // Ultra runs heavy glass at full scale + 4x MSAA + 8 bounces even interactively!
  const ultraHeavy = resolveQualityBudget('ultra', 'heavy', 8);
  assert.equal(ultraHeavy.interactiveScale, 1);
  assert.equal(ultraHeavy.interactiveMsaa, 4);
  assert.equal(ultraHeavy.opticalBounces, 8);
  assert.equal(ultraHeavy.transmissionScale, 1);
  assert.equal(ultraHeavy.simplifiedOptics, false);
  assert.equal(ultraHeavy.idleRefineMs, 0);

  // Low tier disables heavy BVH raytracing, halves transmission/backing buffers, and skips bottle MSAA!
  const lowHeavy = resolveQualityBudget('low', 'heavy', 4);
  assert.equal(lowHeavy.simplifiedOptics, true);
  assert.equal(lowHeavy.transmissionScale, 0.5);
  assert.equal(lowHeavy.paperBackingScale, 0.5);
  assert.equal(lowHeavy.interactiveMsaa, 0);
  assert.equal(lowHeavy.idleMsaa, 0);
  assert.equal(lowHeavy.maxAnisotropy, 1);
  assert.equal(lowHeavy.opticalBounces, 2);

  // Low tier respects hardware maxSamples clamp cleanly.
  const lowWebgl1 = resolveQualityBudget('low', 'light', 0);
  assert.equal(lowWebgl1.interactiveMsaa, 0);
  assert.equal(lowWebgl1.idleMsaa, 0);
  assert.equal(stepTierDown('ultra'), 'high');
  assert.equal(stepTierDown('high'), 'medium');
  assert.equal(stepTierDown('medium'), 'low');
  assert.equal(stepTierDown('low'), 'low');
});

test('quality preference and session WebGL safe mode persist safely', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(loadQualityPreference(storage), 'auto');
  assert.equal(saveQualityPreference('high', storage), true);
  assert.equal(loadQualityPreference(storage), 'high');
  assert.equal(parseQualityPreference('extreme'), 'auto');
  assert.equal(parseQualityPreference(null), 'auto');

  assert.equal(loadWebglSafeMode(storage), false);
  assert.equal(markWebglSafeMode(true, storage), true);
  assert.equal(loadWebglSafeMode(storage), true);
  assert.equal(markWebglSafeMode(false, storage), true);
  assert.equal(loadWebglSafeMode(storage), false);
});
