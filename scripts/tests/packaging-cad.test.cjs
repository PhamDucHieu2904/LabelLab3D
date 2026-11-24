const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');

const loadSource = require('../lib/load-ts-source.cjs').createSourceLoader();
const root = path.resolve(__dirname, '../..');

const {
  STUDIO_DOMAINS,
  getStudioDomain,
  loadSavedDomain,
  saveDomain,
} = loadSource(path.join(root, 'lib/domains/registry'));

const {
  PACKAGING_TEMPLATES,
  createDefaultPackagingParams,
  solvePackagingTemplate,
  filterPackagingTemplates,
} = loadSource(path.join(root, 'lib/packaging-cad/templates/registry'));

const {
  parsePackagingParams,
  loadPackagingParams,
  savePackagingParams,
  PACKAGING_PREFERENCES_KEY,
} = loadSource(path.join(root, 'lib/packaging-cad/preferences'));

const {
  BOARD_MATERIAL_PRESETS,
  getBoardMaterialPreset,
} = loadSource(path.join(root, 'lib/packaging-cad/materials/paper-presets'));

const {
  buildPanelSolidGeometry,
} = loadSource(path.join(root, 'lib/packaging-cad/geometry/solid-builder'));

const {
  buildPackagingRig,
} = loadSource(path.join(root, 'lib/packaging-cad/kinematics/rig-builder'));

const {
  createPackagingMaterialSet,
} = loadSource(path.join(root, 'lib/packaging-cad/materials/corrugated-materials'));

const {
  exportDielineSvg,
  exportDielineDxf,
  exportDielinePdf,
} = loadSource(path.join(root, 'lib/packaging-cad/exporters/vector-dieline'));

test('multi-domain registry exposes beverage, packaging and future apparel slot cleanly', () => {
  assert.equal(STUDIO_DOMAINS.length, 3);
  assert.equal(getStudioDomain('beverage').id, 'beverage');
  assert.equal(getStudioDomain('packaging').id, 'packaging');
  assert.equal(getStudioDomain('packaging').capabilities.parametricDimensions, true);
  assert.equal(getStudioDomain('packaging').capabilities.foldingKinematics, true);
  // Unavailable apparel falls back safely to beverage until launched.
  assert.equal(getStudioDomain('apparel').id, 'beverage');
  assert.equal(getStudioDomain('unknown').id, 'beverage');

  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(saveDomain('packaging', storage), true);
  assert.equal(loadSavedDomain(storage), 'packaging');
});

test('all Wave 1 templates solve valid 2D dielines, finite 3D rigs, and zero-NaN geometry across extreme sizes', () => {
  assert.equal(PACKAGING_TEMPLATES.length, 4);
  for (const tpl of PACKAGING_TEMPLATES) {
    const configs = [
      createDefaultPackagingParams(tpl.id),
      {
        ...createDefaultPackagingParams(tpl.id),
        lengthMm: tpl.minDimensions.length,
        widthMm: tpl.minDimensions.width,
        heightMm: tpl.minDimensions.height,
        dimensionMode: 'inner',
        handHoles: true,
        windowCutout: true,
        displayScoop: tpl.features.displayScoop,
        lockTabCount: 1,
      },
      {
        ...createDefaultPackagingParams(tpl.id),
        lengthMm: tpl.maxDimensions.length,
        widthMm: tpl.maxDimensions.width,
        heightMm: tpl.maxDimensions.height,
        dimensionMode: 'outer',
        thicknessMm: 3.0,
        tuckStyle: 'straight',
      },
    ];

    for (const cfg of configs) {
      const solved = solvePackagingTemplate(cfg);
      assert.ok(solved.blankBounds.width > 50, `${tpl.id} blank width positive`);
      assert.ok(solved.blankBounds.height > 50, `${tpl.id} blank height positive`);
      assert.ok(solved.blankAreaM2 > 0, `${tpl.id} net area positive`);
      assert.ok(solved.estimatedWeightG > 0, `${tpl.id} weight positive`);
      assert.ok(solved.outerMm.length >= solved.innerMm.length, `${tpl.id} outer >= inner length`);
      assert.ok(solved.outerMm.width >= solved.innerMm.width, `${tpl.id} outer >= inner width`);
      assert.ok(solved.outerMm.height >= solved.innerMm.height, `${tpl.id} outer >= inner height`);
      assert.ok(solved.creaseSegments.length >= 4, `${tpl.id} has crease segments`);

      const materials = createPackagingMaterialSet(solved.params, solved.material);
      const rig = buildPackagingRig(solved, materials);
      for (const fold of [0, 0.35, 0.72, 1.0]) {
        rig.setFoldProgress(fold);
        const bounds = rig.measureBounds();
        const size = bounds.getSize(new THREE.Vector3());
        assert.ok(Number.isFinite(size.x) && size.x > 0, `${tpl.id} fold=${fold} finite size.x`);
        assert.ok(Number.isFinite(size.y) && size.y > 0, `${tpl.id} fold=${fold} finite size.y`);
        assert.ok(Number.isFinite(size.z) && size.z > 0, `${tpl.id} fold=${fold} finite size.z`);
      }

      // Flat blank height must be ~thicknessMm; folded height must be much taller than flat thickness!
      rig.setFoldProgress(0);
      const flatSize = rig.measureBounds().getSize(new THREE.Vector3());
      rig.setFoldProgress(1);
      const foldedSize = rig.measureBounds().getSize(new THREE.Vector3());
      assert.ok(flatSize.y < 0.015, `${tpl.id} flat thickness < 15mm, got ${flatSize.y}`);
      assert.ok(foldedSize.y > flatSize.y * 3, `${tpl.id} folded height (${foldedSize.y}m) > 3x flat thickness (${flatSize.y}m)`);

      rig.dispose();
      materials.dispose();
    }
  }
});

test('FEFCO 0421 flagship tray matches Pacdora 320x200x60mm with 4 lock slots and exact staged rollover clearance', () => {
  const params = createDefaultPackagingParams('fefco-0421-tray');
  assert.equal(params.lengthMm, 320);
  assert.equal(params.widthMm, 200);
  assert.equal(params.heightMm, 60);
  assert.equal(params.dimensionMode, 'outer');

  const solved = solvePackagingTemplate(params);
  assert.equal(solved.outerMm.length, 320);
  assert.equal(solved.outerMm.width, 200);
  assert.equal(solved.outerMm.height, 60);
  assert.equal(solved.rootPanel.holes.length, 4, 'base panel punches 4 rectangular lock slots for 2 tabs/side');

  // Verify panel solid geometry creates 3 material groups (outside, inside, cut edges) with holes included.
  const baseGeo = buildPanelSolidGeometry({
    node: solved.rootPanel,
    originX: 0,
    originY: 0,
    thicknessMm: solved.params.thicknessMm,
    blankBounds: solved.blankBounds,
    fluteDirection: solved.params.fluteDirection,
  });
  assert.equal(baseGeo.groups.length, 3);
  assert.ok(baseGeo.groups[0].count > 0 && baseGeo.groups[1].count > 0 && baseGeo.groups[2].count > 0);
  const pos = baseGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
  }
  baseGeo.dispose();

  // Verify folded 3D bounds match requested 320 x 200 x 60 mm within millimeter crease tolerance!
  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);
  rig.setFoldProgress(1);
  const foldedSize = rig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(foldedSize.x * 1000 - 320) < 4, `folded L ~320mm, got ${(foldedSize.x * 1000).toFixed(2)}`);
  assert.ok(Math.abs(foldedSize.z * 1000 - 200) < 4, `folded W ~200mm, got ${(foldedSize.z * 1000).toFixed(2)}`);
  assert.ok(Math.abs(foldedSize.y * 1000 - 60) < 6, `folded H ~60mm, got ${(foldedSize.y * 1000).toFixed(2)}`);
  rig.dispose();
  materials.dispose();
});

test('1:1 mm SVG, DXF R12 and Vector PDF exporters emit valid CAD files for every template', () => {
  for (const tpl of PACKAGING_TEMPLATES) {
    const solved = solvePackagingTemplate(createDefaultPackagingParams(tpl.id));

    const svg = exportDielineSvg(solved, { side: 'outside' });
    assert.ok(svg.startsWith('<?xml version="1.0"'));
    assert.ok(svg.includes('mm"'));
    assert.ok(svg.includes('id="Cut"') && svg.includes('id="Crease"'));

    const dxf = exportDielineDxf(solved, 'outside');
    assert.ok(dxf.includes('$INSUNITS\r\n70\r\n4'), 'DXF declares millimetre units');
    assert.ok(dxf.includes('CUT') && dxf.includes('CREASE') && dxf.trimEnd().endsWith('EOF'));

    const pdfBytes = exportDielinePdf(solved, 'outside');
    assert.ok(pdfBytes instanceof Uint8Array && pdfBytes.length > 400);
    const pdfText = new TextDecoder().decode(pdfBytes);
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('/MediaBox'));
    assert.ok(pdfText.includes('%%EOF'));
  }
});

test('packaging preferences sanitize hostile inputs, clamp bounds and round-trip cleanly', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

  const custom = {
    ...createDefaultPackagingParams('fefco-0427-mailer'),
    lengthMm: 280,
    widthMm: 195,
    heightMm: 75,
    handHoles: true,
    windowCutout: true,
    foldProgress: 0.65,
  };
  assert.equal(savePackagingParams(custom, storage), true);
  assert.ok(store.has(PACKAGING_PREFERENCES_KEY));
  const restored = loadPackagingParams(storage);
  assert.equal(restored.templateId, 'fefco-0427-mailer');
  assert.equal(restored.lengthMm, 280);
  assert.equal(restored.windowCutout, true);
  assert.equal(restored.foldProgress, 0.65);

  // Hostile / extreme values must clamp or fall back safely.
  const hostile = parsePackagingParams({
    templateId: '../../etc/passwd',
    lengthMm: 999999,
    widthMm: -50,
    thicknessMm: 500,
    outsideColor: 'javascript:alert(1)',
    foldProgress: Infinity,
  });
  assert.equal(hostile.templateId, 'fefco-0421-tray');
  assert.equal(hostile.lengthMm, 900);
  assert.equal(hostile.widthMm, 65);
  assert.equal(hostile.thicknessMm, 8);
  assert.equal(hostile.outsideColor, getBoardMaterialPreset('kraft-e').outsideColor);
  assert.equal(BOARD_MATERIAL_PRESETS.length, 8);
  assert.equal(filterPackagingTemplates('mailer').length, 1);
});
