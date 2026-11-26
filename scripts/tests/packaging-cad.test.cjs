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
  createDefaultBottlePackConfig,
  parseBottlePackConfig,
  loadBottlePackConfig,
  saveBottlePackConfig,
  PACKAGING_PREFERENCES_KEY,
  PACKAGING_BOTTLE_PACK_KEY,
} = loadSource(path.join(root, 'lib/packaging-cad/preferences'));

const {
  getBeverageFootprintMm,
  computeAutoFitBoxDimensions,
  computeBottlePackLayout,
  PACK_GRID_PRESETS,
} = loadSource(path.join(root, 'lib/packaging-cad/pack-layout'));

const {
  resolveBottleOpticalProfile,
  buildMergedBasilSeedsGeometry,
  createLabelPaperBackingMaterial,
} = loadSource(path.join(root, 'lib/packaging-cad/bottle-packer'));

const {
  BOARD_MATERIAL_PRESETS,
  getBoardMaterialPreset,
  PACKAGING_FINISH_PRESETS,
  getPackagingFinishPreset,
} = loadSource(path.join(root, 'lib/packaging-cad/materials/paper-presets'));

const {
  resolveSoftboxSampleCount,
  computeSoftboxKeyLightPosition,
  computeHaltonJitterPx,
} = loadSource(path.join(root, 'lib/mockup/progressive-softbox'));

const {
  buildPanelSolidGeometry,
} = loadSource(path.join(root, 'lib/packaging-cad/geometry/solid-builder'));

const {
  buildHoneycombPartitionGeometry,
  getHoneycombDividerThicknessMm,
} = loadSource(path.join(root, 'lib/packaging-cad/geometry/partition-builder'));

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

test('all registered packaging templates solve valid 2D dielines, finite 3D rigs, and zero-NaN geometry across extreme sizes', () => {
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
        carrierPack: '4-pack',
        dividerGrid: true,
        lidDepthMm: 22,
      },
      {
        ...createDefaultPackagingParams(tpl.id),
        lengthMm: tpl.maxDimensions.length,
        widthMm: tpl.maxDimensions.width,
        heightMm: tpl.maxDimensions.height,
        dimensionMode: 'outer',
        thicknessMm: 3.0,
        tuckStyle: 'straight',
        carrierPack: '8-pack',
        dividerGrid: false,
        lidDepthMm: 120,
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
    ...createDefaultPackagingParams('fefco-0201-rsc'),
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
  assert.equal(restored.templateId, 'fefco-0201-rsc');
  assert.equal(restored.lengthMm, 280);
  assert.equal(restored.windowCutout, true);
  assert.equal(restored.foldProgress, 0.65);
  assert.equal(restored.showDimensions, false);

  // Legacy v1 persisted state with old default showDimensions: true migrates to off by default.
  store.set(
    PACKAGING_PREFERENCES_KEY,
    JSON.stringify({ version: 1, params: { ...custom, showDimensions: true } }),
  );
  assert.equal(loadPackagingParams(storage).showDimensions, false);

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
  assert.equal(filterPackagingTemplates('mailer').length, 0);
  assert.equal(filterPackagingTemplates('', 'rigid-box').length, 1);
  assert.equal(filterPackagingTemplates('', 'carton').length, 2);
  // Removed template IDs safely fall back to the default template without crashing.
  for (const removedId of ['beverage-carrier', 'ecma-a20-tuck', 'fefco-0427-mailer', 'rigid-magnetic-box', 'rigid-drawer-sleeve']) {
    assert.equal(parsePackagingParams({ templateId: removedId }).templateId, 'fefco-0421-tray');
  }
});

test('two-piece Lid & Base rigid box kinematics hover and seat flush accurately', () => {
  // Lid & Base Rigid Box: flat at 0, lid elevated/hovering at 0.72, seated flush at 1.0
  const lidBaseSolved = solvePackagingTemplate(createDefaultPackagingParams('rigid-lid-base'));
  const lidBaseMats = createPackagingMaterialSet(lidBaseSolved.params, lidBaseSolved.material);
  const lidBaseRig = buildPackagingRig(lidBaseSolved, lidBaseMats);
  assert.equal(lidBaseRig.assemblyTracks.length, 1, 'lid-base has 1 detached assembly track for telescoping lid');
  lidBaseRig.setFoldProgress(0);
  assert.ok(lidBaseRig.measureBounds().getSize(new THREE.Vector3()).y < 0.01, 'lid & base lie flat at fold=0');
  lidBaseRig.setFoldProgress(0.72);
  const hoverHeightM = lidBaseRig.measureBounds().getSize(new THREE.Vector3()).y;
  lidBaseRig.setFoldProgress(1.0);
  const seatedHeightM = lidBaseRig.measureBounds().getSize(new THREE.Vector3()).y;
  assert.ok(hoverHeightM > seatedHeightM + 0.025, `lid hovers cleanly above base at 0.72 (${hoverHeightM.toFixed(3)}m vs ${seatedHeightM.toFixed(3)}m)`);
  assert.ok(Math.abs(seatedHeightM * 1000 - lidBaseSolved.outerMm.height) < 5, 'seated lid height matches outerMm.height');
  lidBaseRig.dispose();
  lidBaseMats.dispose();
});

test('Pack Your Bottles layout solver computes exact auto-fit dimensions, cell alignment, and sanitizes config', () => {
  assert.ok(PACK_GRID_PRESETS.length >= 6);
  const can330 = getBeverageFootprintMm('can-mango', 330);
  assert.ok(can330.diameterXMm > 60 && can330.heightMm > 110);

  // Auto-fit 12-can (4x3) FEFCO 0421 display tray
  const trayFit = computeAutoFitBoxDimensions({
    templateId: 'fefco-0421-tray',
    itemMm: can330,
    config: { cols: 4, rows: 3, spacingMm: 2, wallPaddingMm: 2 },
    thicknessMm: 1.5,
  });
  assert.ok(trayFit.lengthMm >= 270 && trayFit.lengthMm <= 280, `12-can tray inner L ~274mm, got ${trayFit.lengthMm}`);
  assert.ok(trayFit.widthMm >= 202 && trayFit.widthMm <= 212, `12-can tray inner W ~206mm, got ${trayFit.widthMm}`);
  assert.ok(trayFit.heightMm < can330.heightMm, 'open display tray stays shorter than full can so labels stay visible');

  const fittedTraySolved = solvePackagingTemplate({
    ...createDefaultPackagingParams('fefco-0421-tray'),
    dimensionMode: 'inner',
    lengthMm: trayFit.lengthMm,
    widthMm: trayFit.widthMm,
    heightMm: trayFit.heightMm,
  });
  const trayLayout = computeBottlePackLayout(fittedTraySolved, can330, {
    ...createDefaultBottlePackConfig('can-mango'),
    enabled: true,
    cols: 4,
    rows: 3,
  });
  assert.equal(trayLayout.itemCount, 12);
  assert.equal(trayLayout.fitsAll, true);
  // Symmetric X/Z centering around 0
  const meanX = trayLayout.slots.reduce((s, p) => s + p.xMm, 0) / trayLayout.slots.length;
  const meanZ = trayLayout.slots.reduce((s, p) => s + p.zMm, 0) / trayLayout.slots.length;
  assert.ok(Math.abs(meanX) < 1e-6 && Math.abs(meanZ) < 1e-6, 'bottle slots centered symmetrically');

  // Auto-fit 12-pack RSC carton with honeycomb cell dividers for 290ml glass bottles
  const glass290 = getBeverageFootprintMm('basil-strawberry', 290);
  const rscFit = computeAutoFitBoxDimensions({
    templateId: 'fefco-0201-rsc',
    itemMm: glass290,
    config: { cols: 4, rows: 3, spacingMm: 0, wallPaddingMm: 2, honeycombDividers: true },
    thicknessMm: 3.0,
  });
  assert.ok(rscFit.lengthMm >= 285, 'RSC honeycomb auto-fit reserves clearance for internal partition walls');

  // Detect tight overflow when tray is shrunk below bottle footprint
  const tinySolved = solvePackagingTemplate({
    ...createDefaultPackagingParams('fefco-0421-tray'),
    dimensionMode: 'inner',
    lengthMm: 120,
    widthMm: 100,
    heightMm: 50,
  });
  const overflowLayout = computeBottlePackLayout(tinySolved, can330, {
    ...createDefaultBottlePackConfig('can-mango'),
    enabled: true,
    cols: 4,
    rows: 3,
  });
  assert.equal(overflowLayout.fitsHorizontal, false);
  assert.ok(overflowLayout.overflowLengthMm > 100);

  // Preferences round-trip & hostile sanitization for BottlePackConfig
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const validModels = new Set(['can-mango', 'basil-strawberry']);
  assert.equal(
    saveBottlePackConfig({ ...createDefaultBottlePackConfig('basil-strawberry'), enabled: true, cols: 4, rows: 3 }, validModels, storage),
    true,
  );
  assert.ok(store.has(PACKAGING_BOTTLE_PACK_KEY));
  const restoredPack = loadBottlePackConfig(validModels, 'can-mango', storage);
  assert.equal(restoredPack.enabled, true);
  assert.equal(restoredPack.modelId, 'basil-strawberry');
  assert.equal(restoredPack.cols, 4);
  assert.equal(restoredPack.rows, 3);

  const sanitizedPack = parseBottlePackConfig(
    { enabled: true, modelId: '../bad', cols: 99, rows: -5, spacingMm: 500, facingYawDeg: 999 },
    validModels,
    'can-mango',
  );
  assert.equal(sanitizedPack.modelId, 'can-mango');
  assert.equal(sanitizedPack.cols, 6);
  assert.equal(sanitizedPack.rows, 1);
  assert.equal(sanitizedPack.spacingMm, 16);
  assert.equal(sanitizedPack.facingYawDeg, 180);

  // Full unconstrained 360° random rotation when organicJitter is enabled
  const jitterA = computeBottlePackLayout(fittedTraySolved, can330, {
    ...createDefaultBottlePackConfig('can-mango'),
    enabled: true,
    cols: 4,
    rows: 3,
    organicJitter: true,
    jitterSeed: 1,
  });
  const jitterB = computeBottlePackLayout(fittedTraySolved, can330, {
    ...createDefaultBottlePackConfig('can-mango'),
    enabled: true,
    cols: 4,
    rows: 3,
    organicJitter: true,
    jitterSeed: 42,
  });
  const maxAbsDeg = Math.max(...jitterA.slots.map((s) => Math.abs((s.yawRad * 180) / Math.PI)));
  assert.ok(maxAbsDeg > 45, `organicJitter spans full 360° (maxAbs=${maxAbsDeg.toFixed(1)}°)`);
  assert.notEqual(jitterA.slots[0].yawRad, jitterB.slots[0].yawRad, 'new jitterSeed produces fresh random angles');
});

test('photorealistic packaging upgrade generates micro-beveled edges, physical PBR paper maps, and shadow-ready rig meshes', () => {
  const solved = solvePackagingTemplate(createDefaultPackagingParams('fefco-0421-tray'));
  const baseGeo = buildPanelSolidGeometry({
    node: solved.rootPanel,
    originX: 0,
    originY: 0,
    thicknessMm: solved.params.thicknessMm,
    blankBounds: solved.blankBounds,
    fluteDirection: solved.params.fluteDirection,
  });

  // Group 2 (cut edges) must include rolled bevel normals (|ny| > 0.5) AND flat core normals (ny === 0).
  assert.equal(baseGeo.groups.length, 3);
  const edgeGroup = baseGeo.groups[2];
  const index = baseGeo.getIndex();
  const norm = baseGeo.getAttribute('normal');
  let bevelLipVerts = 0;
  let coreWallVerts = 0;
  for (let i = edgeGroup.start; i < edgeGroup.start + edgeGroup.count; i++) {
    const vi = index.getX(i);
    const ny = Math.abs(norm.getY(vi));
    if (ny > 0.5) bevelLipVerts++;
    else if (ny < 0.01) coreWallVerts++;
  }
  assert.ok(bevelLipVerts > 0 && coreWallVerts > 0, `cut edges must include beveled lips (${bevelLipVerts}) and core walls (${coreWallVerts})`);
  baseGeo.dispose();

  // Materials must expose MeshPhysicalMaterial with normal/roughness maps and fold-aware helpers.
  const materials = createPackagingMaterialSet(solved.params, solved.material);
  assert.ok(materials.outside instanceof THREE.MeshPhysicalMaterial);
  assert.ok(materials.inside instanceof THREE.MeshPhysicalMaterial);
  assert.ok(materials.outside.normalMap && materials.outside.roughnessMap);
  assert.ok(materials.inside.normalMap && materials.inside.roughnessMap);
  materials.syncDieline(solved);
  materials.updateFoldProgress(0.85);

  const rig = buildPackagingRig(solved, materials);
  for (const { mesh } of rig.panelMeshes.values()) {
    assert.equal(mesh.castShadow, true, `${mesh.name} casts soft self-shadows`);
    assert.equal(mesh.receiveShadow, true, `${mesh.name} receives soft self-shadows`);
  }
  for (const joint of rig.joints) {
    if (joint.fillet) {
      assert.equal(joint.fillet.mesh.castShadow, true);
      assert.equal(joint.fillet.mesh.receiveShadow, true);
    }
  }
  rig.dispose();
  materials.dispose();
});

test('packed bottle optical classifier and merged basil seed geometry match Bottles & Cans profiles', () => {
  assert.equal(resolveBottleOpticalProfile({ id: 'pet-aloe', category: 'pet' }), 'aloe');
  assert.equal(resolveBottleOpticalProfile({ id: 'pet-nata-watermelon', category: 'pet' }), 'nata');
  assert.equal(resolveBottleOpticalProfile({ id: 'pet-330-energy', category: 'pet' }), 'energy');
  assert.equal(resolveBottleOpticalProfile({ id: 'pet-350-juice', category: 'pet' }), 'juice');
  assert.equal(resolveBottleOpticalProfile({ id: 'basil-strawberry', category: 'glass' }), 'basil-glass');
  assert.equal(resolveBottleOpticalProfile({ id: 'glass-290-chia', category: 'glass' }), 'chia-glass');
  assert.equal(resolveBottleOpticalProfile({ id: 'glass-290-milk', category: 'glass' }), 'milk-glass');
  assert.equal(resolveBottleOpticalProfile({ id: 'glass-280-latte', category: 'glass' }), 'milk-glass');
  assert.equal(resolveBottleOpticalProfile({ id: 'can-mango', category: 'can' }), 'opaque');
  assert.equal(resolveBottleOpticalProfile({ id: 'pp-500', category: 'pp' }), 'opaque');

  const merged = buildMergedBasilSeedsGeometry({
    version: 1,
    count: 2,
    gelThicknessNative: 0.0008,
    nativeToGlbMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    seeds: [
      { center: [0, 0.05, 0], inverseX: [500, 0, 0], inverseY: [0, 350, 0], inverseZ: [0, 0, 500] },
      { center: [0.01, 0.08, -0.01], inverseX: [450, 0, 0], inverseY: [0, 320, 0], inverseZ: [0, 0, 450] },
    ],
  });
  const kindAttr = merged.getAttribute('packedSeedKind');
  assert.ok(merged.getAttribute('position').count > 0 && kindAttr);
  let coreVerts = 0;
  let haloVerts = 0;
  for (let i = 0; i < kindAttr.count; i++) {
    if (kindAttr.getX(i) > 0.5) coreVerts++;
    else haloVerts++;
  }
  assert.ok(coreVerts > 0 && coreVerts === haloVerts, `equal core (${coreVerts}) and gel halo (${haloVerts}) shells`);
  merged.dispose();

  const paperBack = createLabelPaperBackingMaterial();
  assert.equal(paperBack.side, THREE.BackSide);
  assert.equal(paperBack.transparent, false);
  assert.equal(paperBack.depthWrite, true);
  assert.equal(paperBack.polygonOffset, true);
  paperBack.dispose();
});

test('Spot UV / Hot Foil finish presets, param sanitization, and Progressive Softbox math', () => {
  assert.equal(PACKAGING_FINISH_PRESETS.length, 8);
  assert.equal(getPackagingFinishPreset('spot-uv').shaderMode, 1);
  assert.equal(getPackagingFinishPreset('gold-foil').shaderMode, 2);
  assert.equal(getPackagingFinishPreset('holo-foil').shaderMode, 3);
  assert.equal(getPackagingFinishPreset('unknown-mode').id, 'none');

  // Strict sanitization & clamping of finish parameters
  const sanitized = parsePackagingParams({
    templateId: 'rigid-lid-base',
    materialId: 'black-e',
    finishMode: 'gold-foil',
    finishTarget: 'brand-frame',
    finishIntensity: 99,
    finishRelief: -99,
    finishThreshold: -5,
    finishInvertMask: true,
  });
  assert.equal(sanitized.finishMode, 'gold-foil');
  assert.equal(sanitized.finishTarget, 'brand-frame');
  assert.equal(sanitized.finishIntensity, 1);
  assert.equal(sanitized.finishRelief, -1);
  assert.equal(sanitized.finishThreshold, 0.1);
  assert.equal(sanitized.finishInvertMask, true);

  // Material set syncs Spot UV, Gold Foil, and Holo Foil without throwing
  const solved = solvePackagingTemplate(sanitized);
  const mats = createPackagingMaterialSet(solved.params, solved.material);
  assert.ok(mats.outside.clearcoat > 0, 'clearcoat stays compiled for instant Spot UV / Foil switching');
  for (const mode of ['spot-uv', 'gold-foil', 'holo-foil', 'none']) {
    mats.sync({ ...solved.params, finishMode: mode }, solved.material, { finishMaskMap: null });
  }
  mats.dispose();

  // Progressive Softbox tier sample budgets & geometry invariants
  assert.equal(resolveSoftboxSampleCount('ultra', 'idle'), 12);
  assert.equal(resolveSoftboxSampleCount('high', 'idle'), 10);
  assert.equal(resolveSoftboxSampleCount('medium', 'idle'), 6);
  assert.equal(resolveSoftboxSampleCount('low', 'idle'), 0);
  assert.equal(resolveSoftboxSampleCount('ultra', 'export'), 12);
  assert.equal(resolveSoftboxSampleCount('low', 'export'), 4);

  const basePos = new THREE.Vector3(0.42, 0.72, 0.48);
  const target = new THREE.Vector3(0, 0.08, 0);
  const baseDist = basePos.distanceTo(target);
  const s0 = computeSoftboxKeyLightPosition(basePos, target, 0.2, 0, 12);
  assert.ok(s0.distanceTo(basePos) < 1e-6, 'sample 0 matches center key light');
  for (let k = 1; k < 12; k++) {
    const sk = computeSoftboxKeyLightPosition(basePos, target, 0.2, k, 12);
    assert.ok(Math.abs(sk.distanceTo(target) - baseDist) < 1e-5, `sample ${k} preserves exact light distance`);
    assert.ok(sk.distanceTo(basePos) > 0.01, `sample ${k} spreads across softbox emitter disc`);
  }

  assert.deepEqual(computeHaltonJitterPx(0), [0, 0]);
  const [jx, jy] = computeHaltonJitterPx(3, 0.36);
  assert.ok(Math.abs(jx) <= 0.36 && Math.abs(jy) <= 0.36);
});

test('crease fillets progress UVs isotropically with 3-ply solid end caps and FEFCO 0421 rollover arch aligns flush', () => {
  const solved = solvePackagingTemplate(createDefaultPackagingParams('fefco-0421-tray'));
  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);
  rig.setFoldProgress(1);

  // 1. Every crease fillet must have 2 groups (outer strip + 3-ply solid end caps), non-constant arc UVs, and valid color attr.
  const bridgeJoint = rig.joints.find((j) => j.panelId === 'right-bridge');
  assert.ok(bridgeJoint && bridgeJoint.fillet, 'right-bridge has dynamic crease fillet');
  const fGeo = bridgeJoint.fillet.mesh.geometry;
  assert.equal(fGeo.groups.length, 2, 'fillet geometry separates outer strip and solid 3-ply end caps');
  assert.ok(fGeo.groups[0].count > 0 && fGeo.groups[1].count > 0, 'both outer strip and end caps have triangles');
  assert.ok(fGeo.getAttribute('color'), 'fillet geometry includes vertex color attribute for edgeMaterial shader');

  // Every single end-cap triangle must have outward-facing geometric winding matching its vertex normal (never backface-culled!).
  const fPos = fGeo.getAttribute('position');
  const fNorm = fGeo.getAttribute('normal');
  const fIdx = fGeo.getIndex();
  const capGroup = fGeo.groups[1];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();
  const vertN = new THREE.Vector3();
  for (let i = capGroup.start; i < capGroup.start + capGroup.count; i += 3) {
    const ia = fIdx.getX(i);
    const ib = fIdx.getX(i + 1);
    const ic = fIdx.getX(i + 2);
    va.fromBufferAttribute(fPos, ia);
    vb.fromBufferAttribute(fPos, ib);
    vc.fromBufferAttribute(fPos, ic);
    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    triN.crossVectors(e1, e2);
    vertN.fromBufferAttribute(fNorm, ia);
    assert.ok(triN.dot(vertN) > 0, `end-cap triangle at index ${i} must face outward (dot=${triN.dot(vertN)})`);
  }

  const uvAttr = fGeo.getAttribute('uv');
  const uStart = uvAttr.getX(0);
  const vStart = uvAttr.getY(0);
  const lastRingVert = (fGeo.groups[0].count / 6) * 2;
  const uEnd = uvAttr.getX(lastRingVert);
  const vEnd = uvAttr.getY(lastRingVert);
  const uvArcDelta = Math.hypot(uEnd - uStart, vEnd - vStart);
  assert.ok(uvArcDelta > 0.001, `fillet UV must advance smoothly across the bend arc, got delta=${uvArcDelta}`);

  // 2. Physical FEFCO 0421 rollover corner:
  //    - right-wall & right-bridge outer edge align flush with front-wall outer face (Z = halfW + t)
  //    - right-bridge rises physically 1×t above front-wall top edge (never flattened/hidden!)
  //    - front-wall curves smoothly 90° inward into corner flaps (fillet enabled, never overhangs right-wall)
  //    - right-inner-wall sits cleanly behind front-wall inner face with zero collision.
  const worldBox = (id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };
  const frontBox = worldBox('front-wall');
  const rightBox = worldBox('right-wall');
  const bridgeBox = worldBox('right-bridge');
  const innerBox = worldBox('right-inner-wall');

  const wallToBridgeZMm = Math.abs(rightBox.max.z - bridgeBox.max.z) * 1000;
  const wallToFrontOuterZMm = Math.abs(rightBox.max.z - frontBox.max.z) * 1000;
  assert.ok(wallToBridgeZMm < 0.02, `right-wall and right-bridge share flush outer front plane, diff=${wallToBridgeZMm.toFixed(4)}mm`);
  assert.ok(wallToFrontOuterZMm < 0.05, `right-wall outer edge aligns flush with front-wall outer face, diff=${wallToFrontOuterZMm.toFixed(4)}mm`);
  assert.ok(innerBox.max.z < frontBox.min.z, 'right-inner-wall sits cleanly behind front-wall inner face');

  const rolloverStepMm = (bridgeBox.max.y - frontBox.max.y) * 1000;
  assert.ok(
    Math.abs(rolloverStepMm - solved.params.thicknessMm) < 0.05,
    `rollover rim rises physically 1×t (${solved.params.thicknessMm}mm) over front wall, got ${rolloverStepMm.toFixed(3)}mm`,
  );
  const flapJoint = rig.joints.find((j) => j.panelId === 'front-right-flap');
  assert.ok(flapJoint && flapJoint.fillet, 'front-right-flap has smooth 90° curved corner crease fillet');
  assert.ok(frontBox.max.x < rightBox.min.x, 'front wall curves inward inside right wall (never overhangs outside)');

  rig.dispose();
  materials.dispose();
});

test('FEFCO 0201E Side-Open Beer Case folds cleanly with exact dimensions, zero flap/glue collisions, and 24-can fit', () => {
  const params = createDefaultPackagingParams('fefco-0201e-beer-case');
  assert.equal(params.lengthMm, 406);
  assert.equal(params.widthMm, 272);
  assert.equal(params.heightMm, 122);
  assert.equal(params.dimensionMode, 'inner');
  assert.equal(params.fluteDirection, 'along-W');

  const solved = solvePackagingTemplate(params);
  assert.equal(solved.innerMm.length, 406);
  assert.equal(solved.innerMm.width, 272);
  assert.equal(solved.innerMm.height, 122);
  assert.equal(solved.flatPanels.length, 13, 'beer case has 4 body walls + glue tab + 4 dust flaps + 4 major side flaps');

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);

  const worldBox = (id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };

  // Closed state (fold = 1): outer dimensions match outerMm within 0.05 mm and zero collisions!
  rig.setFoldProgress(1);
  const closedSize = rig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(closedSize.x * 1000 - solved.outerMm.length) < 0.05, 'folded length matches outerMm.length');
  assert.ok(Math.abs(closedSize.z * 1000 - solved.outerMm.width) < 0.05, 'folded width matches outerMm.width');
  assert.ok(Math.abs(closedSize.y * 1000 - solved.outerMm.height) < 0.05, 'folded height matches outerMm.height');

  const topBox = worldBox('top-wall');
  const frontBox = worldBox('front-wall');
  const glueBox = worldBox('glue-tab');
  const rightDustFront = worldBox('front-right-dust');
  const rightDustBack = worldBox('back-right-dust');
  const rightMajorTop = worldBox('top-right-flap');
  const rightMajorBot = worldBox('bottom-right-flap');

  // Glue tab tucks cleanly beneath Top Panel (zero protrusion above top-wall!)
  assert.ok(glueBox.max.y < topBox.min.y, `glue tab sits cleanly beneath top panel (${(glueBox.max.y * 1000).toFixed(2)} < ${(topBox.min.y * 1000).toFixed(2)})`);
  // Top Panel front edge sits flush with Front Panel outer face
  assert.ok(Math.abs(topBox.max.z - frontBox.max.z) * 1000 < 0.05, 'top panel front edge aligns flush with front wall outside');
  // Outer major flaps sit strictly outside inner dust flaps (zero Z-fighting!)
  assert.ok(rightDustFront.max.x < rightMajorTop.min.x, 'right front dust flap sits inside right upper major flap');
  assert.ok(rightDustBack.max.x < rightMajorBot.min.x, 'right back dust flap sits inside right lower major flap');
  // Opposing dust flaps do not overlap across width; opposing major flaps preserve flapGap across height
  assert.ok(rightDustBack.max.z < rightDustFront.min.z, 'front & back inner dust flaps do not collide');
  assert.ok(rightMajorBot.max.y < rightMajorTop.min.y, 'top & bottom outer major flaps maintain flap gap');

  // Side-opening animation: at heroFold (0.91), Left end is already closed while Right major flaps are ajar!
  rig.setFoldProgress(0.91);
  const leftOpenBox = worldBox('top-left-flap');
  const rightOpenBox = worldBox('top-right-flap');
  assert.ok(
    rightOpenBox.max.x - leftOpenBox.min.x > closedSize.x + 0.015,
    'at heroFold=0.91 right side flaps open outward cleanly beyond closed length',
  );

  // Pack Your Bottles: 24 × 330ml cans (6×4) fit inside default Beer Case cleanly!
  const can330 = getBeverageFootprintMm('can-330', 330);
  const pack24 = computeBottlePackLayout(solved, can330, {
    ...createDefaultBottlePackConfig('can-330'),
    enabled: true,
    cols: 6,
    rows: 4,
    spacingMm: 1.5,
    wallPaddingMm: 1.5,
  });
  assert.equal(pack24.itemCount, 24);
  assert.equal(pack24.fitsAll, true, '24 × 330ml cans (6×4) fit cleanly inside default beer case');

  rig.dispose();
  materials.dispose();
});

test('FEFCO 0201 Top-Open Shipping Carton (RSC) folds cleanly with exact dimensions, tucked glue joint, and nested top/bottom flaps', () => {
  const params = createDefaultPackagingParams('fefco-0201-rsc');
  assert.equal(params.lengthMm, 360);
  assert.equal(params.widthMm, 240);
  assert.equal(params.heightMm, 220);
  assert.equal(params.dimensionMode, 'inner');
  assert.equal(params.fluteDirection, 'along-W');

  const solved = solvePackagingTemplate(params);
  assert.equal(solved.innerMm.length, 360);
  assert.equal(solved.innerMm.width, 240);
  assert.equal(solved.innerMm.height, 220);
  assert.equal(solved.flatPanels.length, 13, 'RSC carton has 4 body walls + glue tab + 4 minor flaps + 4 major flaps');

  // Outside print-side-up dieline: glue tab sits at far left (largest X in internal 2D CAD) attached to Front panel,
  // and all 4 top & bottom flaps align to a clean straight outer top/bottom line!
  const panelById = new Map(solved.flatPanels.map((p) => [p.id, p]));
  const gluePanel = panelById.get('glue-tab');
  const frontPanel = panelById.get('front-wall');
  assert.ok(gluePanel && frontPanel);
  assert.ok(
    gluePanel.bounds.maxX >= solved.blankBounds.maxX - 1e-6 &&
      gluePanel.bounds.minX >= frontPanel.bounds.maxX - solved.params.thicknessMm - 1e-6,
    'glue tab attaches to Front Wall outer edge (far left on outside print dieline)',
  );
  for (const id of ['top-front-flap', 'top-right-flap', 'top-back-flap', 'top-left-flap']) {
    const p = panelById.get(id);
    assert.ok(
      Math.abs(p.bounds.maxY - solved.blankBounds.maxY) < 0.05,
      `${id} aligns flush with straight top outer edge`,
    );
  }
  for (const id of ['base', 'bottom-front-flap', 'bottom-left-flap', 'bottom-right-flap']) {
    const p = panelById.get(id);
    assert.ok(
      Math.abs(p.bounds.minY - solved.blankBounds.minY) < 0.05,
      `${id} aligns flush with straight bottom outer edge`,
    );
  }

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);

  const worldBox = (id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };

  // Closed state (fold = 1): outer dimensions match outerMm within 0.05 mm and zero collisions!
  rig.setFoldProgress(1);
  const closedSize = rig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(closedSize.x * 1000 - solved.outerMm.length) < 0.05, 'folded length matches outerMm.length');
  assert.ok(Math.abs(closedSize.z * 1000 - solved.outerMm.width) < 0.05, 'folded width matches outerMm.width');
  assert.ok(Math.abs(closedSize.y * 1000 - solved.outerMm.height) < 0.05, 'folded height matches outerMm.height');

  const baseBox = worldBox('base');
  const botFrontBox = worldBox('bottom-front-flap');
  const botLeftBox = worldBox('bottom-left-flap');
  const botRightBox = worldBox('bottom-right-flap');
  const topBackBox = worldBox('top-back-flap');
  const topFrontBox = worldBox('top-front-flap');
  const topLeftBox = worldBox('top-left-flap');
  const topRightBox = worldBox('top-right-flap');
  const leftBox = worldBox('left-wall');
  const frontBox = worldBox('front-wall');
  const glueBox = worldBox('glue-tab');

  // Bottom major flaps sit coplanar on ground; bottom minor flaps nest strictly INSIDE above them
  assert.ok(Math.abs(baseBox.min.y - botFrontBox.min.y) * 1000 < 0.05, 'bottom major flaps rest coplanar on floor');
  assert.ok(botLeftBox.min.y > baseBox.max.y, 'bottom-left minor flap nests cleanly above bottom major flaps');
  assert.ok(botRightBox.min.y > botFrontBox.max.y, 'bottom-right minor flap nests cleanly above bottom major flaps');

  // Top minor flaps nest strictly INSIDE underneath top major flaps (exact inner height cavity!)
  assert.ok(topLeftBox.max.y < topBackBox.min.y, 'top-left minor flap nests cleanly underneath top major flaps');
  assert.ok(topRightBox.max.y < topFrontBox.min.y, 'top-right minor flap nests cleanly underneath top major flaps');
  const cavityHeightMm = (topLeftBox.min.y - botLeftBox.max.y) * 1000;
  assert.ok(
    Math.abs(cavityHeightMm - solved.innerMm.height) < 0.05,
    `interior cavity height matches innerMm.height (${solved.innerMm.height}mm), got ${cavityHeightMm.toFixed(2)}mm`,
  );

  // Glue tab tucks strictly INSIDE Left Wall, strictly OUTSIDE the interior clear cavity [-Linner/2, +Linner/2],
  // and strictly between bottom & top minor flaps (zero protrusion and zero packed-bottle clipping!)
  assert.ok(glueBox.min.x > leftBox.max.x, 'glue tab sits strictly inside left wall');
  assert.ok(
    glueBox.max.x * 1000 <= -solved.innerMm.length * 0.5 + 0.05,
    `glue tab stays completely clear of interior bottle cavity (${(glueBox.max.x * 1000).toFixed(2)} <= ${(-solved.innerMm.length * 0.5).toFixed(2)})`,
  );
  assert.ok(glueBox.max.z <= frontBox.min.z + 1e-4, 'glue tab sits strictly behind front wall');
  assert.ok(glueBox.min.y > botLeftBox.max.y && glueBox.max.y < topLeftBox.min.y, 'glue tab clears minor flaps');
  assert.ok(Math.abs(leftBox.max.z - frontBox.max.z) * 1000 < 0.05, 'left wall front lip aligns flush with front wall');

  // Opposing major & minor flaps maintain non-overlapping clearances
  assert.ok(topBackBox.max.z < topFrontBox.min.z, 'top major flaps maintain flap gap');
  assert.ok(baseBox.max.z < botFrontBox.min.z, 'bottom major flaps maintain flap gap');
  assert.ok(topLeftBox.max.x < topRightBox.min.x, 'top minor flaps do not collide');
  assert.ok(botLeftBox.max.x < botRightBox.min.x, 'bottom minor flaps do not collide');

  // Top-opening animation: at heroFold (0.89), bottom & walls are closed while top major flaps open upward!
  rig.setFoldProgress(0.89);
  const openTopFront = worldBox('top-front-flap');
  const openBotFront = worldBox('bottom-front-flap');
  assert.ok(
    Math.abs(openBotFront.min.y - baseBox.min.y) * 1000 < 0.05,
    'bottom remains sealed flat at heroFold=0.89',
  );
  assert.ok(
    openTopFront.max.y > topFrontBox.max.y + 0.05,
    'top major flaps open clearly upward at heroFold=0.89',
  );

  // Pack Your Bottles: 12 × 500ml PET bottles (4×3) fit inside default RSC carton cleanly!
  const pet500 = getBeverageFootprintMm('pet-aloe', 500);
  const pack12 = computeBottlePackLayout(solved, pet500, {
    ...createDefaultBottlePackConfig('pet-aloe'),
    enabled: true,
    cols: 4,
    rows: 3,
    spacingMm: 2,
    wallPaddingMm: 2,
  });
  assert.equal(pack12.itemCount, 12);
  assert.equal(pack12.fitsAll, true, '12 × 500ml PET bottles (4×3) fit cleanly inside default RSC carton');

  // Honeycomb cell dividers ("Đóng vách tổ ong") for FEFCO 0201:
  // Auto-fit accounts for partition caliper, centers every bottle inside its cell with zero wall clipping,
  // and generates a watertight interlocking 2-group BufferGeometry safely below inner height!
  const glass290 = getBeverageFootprintMm('basil-strawberry', 290);
  const plainFit = computeAutoFitBoxDimensions({
    templateId: 'fefco-0201-rsc',
    itemMm: glass290,
    config: { cols: 3, rows: 2, spacingMm: 2, wallPaddingMm: 2, honeycombDividers: false },
    thicknessMm: 3,
  });
  const honeycombFit = computeAutoFitBoxDimensions({
    templateId: 'fefco-0201-rsc',
    itemMm: glass290,
    config: { cols: 3, rows: 2, spacingMm: 2, wallPaddingMm: 2, honeycombDividers: true },
    thicknessMm: 3,
  });
  assert.ok(honeycombFit.lengthMm > plainFit.lengthMm, 'honeycomb dividers widen carton length for partition walls');
  assert.ok(honeycombFit.widthMm > plainFit.widthMm, 'honeycomb dividers deepen carton width for partition walls');

  const fittedHoneycombSolved = solvePackagingTemplate({
    ...createDefaultPackagingParams('fefco-0201-rsc'),
    dimensionMode: 'inner',
    lengthMm: honeycombFit.lengthMm,
    widthMm: honeycombFit.widthMm,
    heightMm: honeycombFit.heightMm,
  });
  const honeycombLayout = computeBottlePackLayout(fittedHoneycombSolved, glass290, {
    ...createDefaultBottlePackConfig('basil-strawberry'),
    enabled: true,
    cols: 3,
    rows: 2,
    spacingMm: 2,
    wallPaddingMm: 2,
    honeycombDividers: true,
  });
  assert.equal(honeycombLayout.fitsAll, true, '6 glass bottles fit cleanly inside honeycomb cells');

  const divT = getHoneycombDividerThicknessMm(fittedHoneycombSolved.params.thicknessMm);
  const cellW = fittedHoneycombSolved.innerMm.length / 3;
  assert.ok(cellW - glass290.diameterXMm - divT >= 1.5, 'every bottle clears adjacent honeycomb walls cleanly');

  const partGeo = buildHoneycombPartitionGeometry({
    innerL: fittedHoneycombSolved.innerMm.length,
    innerW: fittedHoneycombSolved.innerMm.width,
    innerH: fittedHoneycombSolved.innerMm.height,
    cols: 3,
    rows: 2,
    dividerThicknessMm: divT,
    itemHeightMm: glass290.heightMm,
  });
  assert.ok(partGeo, '3×2 honeycomb divider builds valid geometry');
  assert.equal(partGeo.groups.length, 2, 'separates partition liner faces (0) and fluted cut rims (1)');
  assert.ok(partGeo.groups[0].count > 0 && partGeo.groups[1].count > 0);
  partGeo.computeBoundingBox();
  const partSize = partGeo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(1000);
  assert.ok(partSize.x < fittedHoneycombSolved.innerMm.length, 'partition fits cleanly inside inner length');
  assert.ok(partSize.z < fittedHoneycombSolved.innerMm.width, 'partition fits cleanly inside inner width');
  assert.ok(partSize.y < fittedHoneycombSolved.innerMm.height - 1.5, 'partition stays safely underneath closed top flaps');
  partGeo.dispose();

  // 1×1 single bottle needs no internal divider walls
  assert.equal(
    buildHoneycombPartitionGeometry({
      innerL: 100,
      innerW: 100,
      innerH: 200,
      cols: 1,
      rows: 1,
      dividerThicknessMm: divT,
      itemHeightMm: 180,
    }),
    null,
  );

  rig.dispose();
  materials.dispose();
});
