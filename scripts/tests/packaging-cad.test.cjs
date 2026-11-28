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
  canPackRetailBoxes,
  isPackableRetailBoxTemplate,
  getPackableRetailBoxTemplates,
  getRetailBoxFootprintMm,
  snapPackedBoxYawDeg,
  PACK_GRID_PRESETS,
} = loadSource(path.join(root, 'lib/packaging-cad/pack-layout'));

const {
  createBoxPacker,
  mergeClosedBoxRigGeometry,
} = loadSource(path.join(root, 'lib/packaging-cad/box-packer'));

const {
  createPackagingSubject,
} = loadSource(path.join(root, 'lib/packaging-cad/adapter'));

const {
  parseCustomProjectRecord,
} = loadSource(path.join(root, 'lib/labellab/project-store'));

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
  buildMailerInsertTrayGeometry,
  getHoneycombDividerThicknessMm,
} = loadSource(path.join(root, 'lib/packaging-cad/geometry/partition-builder'));

const {
  buildPackagingRig,
} = loadSource(path.join(root, 'lib/packaging-cad/kinematics/rig-builder'));

const {
  createPackagingMaterialSet,
} = loadSource(path.join(root, 'lib/packaging-cad/materials/corrugated-materials'));

const {
  buildDielineDimensionPlan,
  exportDielineSvg,
  exportDielineDxf,
  exportDielinePdf,
} = loadSource(path.join(root, 'lib/packaging-cad/exporters/vector-dieline'));

const {
  createPackagingTextureComposer,
} = loadSource(path.join(root, 'lib/packaging-cad/artwork-composer'));

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
  assert.equal(PACKAGING_TEMPLATES.length, 7);
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

test('1:1 mm SVG, DXF R12 and Vector PDF exporters emit valid CAD files with detailed dimensions for every template', () => {
  for (const tpl of PACKAGING_TEMPLATES) {
    const solved = solvePackagingTemplate(createDefaultPackagingParams(tpl.id));
    const plan = buildDielineDimensionPlan(solved, 'outside');
    assert.ok(plan.xChain.length >= 2, `${tpl.id} has horizontal chain dimensions`);
    assert.ok(plan.yChain.length >= 2, `${tpl.id} has vertical chain dimensions`);
    assert.ok(plan.panels.length >= 3, `${tpl.id} annotates individual panel W × H dimensions`);
    assert.ok(plan.specLines.some((l) => l.includes('Inner:') && l.includes('Outer:')), `${tpl.id} includes inner/outer engineering spec`);

    const svg = exportDielineSvg(solved, { side: 'outside' });
    assert.ok(svg.startsWith('<?xml version="1.0"'));
    assert.ok(svg.includes('mm"'));
    assert.ok(svg.includes('id="Cut"') && svg.includes('id="Crease"') && svg.includes('id="Dimensions"'));
    assert.ok(svg.includes('Inner:') && svg.includes('Outer:'), 'SVG includes engineering spec block');

    const dxf = exportDielineDxf(solved, 'outside');
    assert.ok(dxf.includes('$INSUNITS\r\n70\r\n4'), 'DXF declares millimetre units');
    assert.ok(dxf.includes('CUT') && dxf.includes('CREASE') && dxf.includes('DIMENSIONS') && dxf.includes('LABELS'));
    assert.ok(dxf.includes('\r\nTEXT\r\n'), 'DXF emits CAD dimension/panel text entities');
    assert.ok(dxf.trimEnd().endsWith('EOF'));

    const pdfBytes = exportDielinePdf(solved, 'outside');
    assert.ok(pdfBytes instanceof Uint8Array && pdfBytes.length > 400);
    const pdfText = new TextDecoder().decode(pdfBytes);
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('/MediaBox'));
    assert.ok(pdfText.includes('Blank:') && pdfText.includes('Inner:'), 'PDF includes detailed spec and dimension text');
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
  assert.equal(filterPackagingTemplates('mailer').length, 1);
  assert.equal(filterPackagingTemplates('', 'mailer').length, 1);
  assert.equal(filterPackagingTemplates('', 'folding-box').length, 2);
  assert.equal(filterPackagingTemplates('', 'rigid-box').length, 1);
  assert.equal(filterPackagingTemplates('', 'carton').length, 2);
  // Removed template IDs safely fall back to the default template without crashing.
  for (const removedId of ['beverage-carrier', 'ecma-a20-tuck', 'rigid-magnetic-box', 'rigid-drawer-sleeve']) {
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

test('packaging texture composer reallocates CanvasTexture on box resize and guards async races', async () => {
  const prevDocument = globalThis.document;
  const prevImage = globalThis.Image;
  const pendingDecodes = new Map();

  function makeStubCanvas() {
    const drawLog = [];
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalCompositeOperation: 'source-over',
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      fillRect(x, y, w, h) { drawLog.push(['fillRect', x, y, w, h, this.fillStyle]); },
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      clip() {},
      translate() {},
      rotate() {},
      stroke() {},
      fill() {},
      setLineDash() {},
      roundRect() {},
      measureText(t) { return { width: String(t).length * 10 }; },
      fillText() {},
      drawImage(img, x, y, w, h) { drawLog.push(['drawImage', img.src, x, y, w, h]); },
      getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData() {},
    };
    return {
      width: 0,
      height: 0,
      drawLog,
      getContext(kind) { return kind === '2d' ? ctx : null; },
    };
  }

  class StubImage {
    constructor() {
      this.crossOrigin = '';
      this.naturalWidth = 1000;
      this.naturalHeight = 500;
      this.onload = null;
      this.onerror = null;
      this._src = '';
    }
    get src() { return this._src; }
    set src(value) {
      this._src = value;
      if (value.includes('deferred')) {
        pendingDecodes.set(value, () => { this.onload?.(); });
      } else {
        queueMicrotask(() => { this.onload?.(); });
      }
    }
  }

  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return makeStubCanvas();
      throw new Error(`Unexpected tag ${tag}`);
    },
  };
  globalThis.Image = StubImage;

  try {
    const composer = createPackagingTextureComposer();
    const solvedDefault = solvePackagingTemplate(createDefaultPackagingParams('fefco-0201-rsc'));
    const solvedResized = solvePackagingTemplate({
      ...createDefaultPackagingParams('fefco-0201-rsc'),
      lengthMm: 415,
      widthMm: 277,
      heightMm: 191,
    });
    const artwork = {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          panelId: 'front-wall',
          surface: 'outside',
          imageUrl: 'blob:mock/front-v1',
          fitMode: 'crop',
          imageScale: 1,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageRotationDeg: 0,
        },
      },
    };

    // 1. Compose at default 360×240×220 (3072×1147)
    const tex1 = await composer.compose(solvedDefault, artwork, 'outside');
    assert.ok(tex1, 'initial outside CanvasTexture created');
    assert.equal(tex1.image.width, 3072);
    const h1 = tex1.image.height;

    let tex1Disposed = 0;
    const origDispose1 = tex1.dispose.bind(tex1);
    tex1.dispose = () => { tex1Disposed++; origDispose1(); };

    // 2. Resize to 415×277×191 (3072×1016): MUST allocate fresh CanvasTexture & fresh canvas
    //    so WebGL2 never uploads mismatched dimensions into immutable texStorage2D!
    const tex2 = await composer.compose(solvedResized, artwork, 'outside');
    assert.ok(tex2, 'resized outside CanvasTexture created');
    assert.notEqual(tex2, tex1, 'box resize allocates a brand-new CanvasTexture handle');
    assert.notEqual(tex2.image, tex1.image, 'box resize allocates a brand-new HTMLCanvasElement');
    assert.notEqual(tex2.image.height, h1, 'new canvas height reflects resized blank aspect ratio');
    assert.equal(tex1Disposed, 0, 'old texture stays alive until materials swap & flushRetired() runs');

    composer.flushRetired();
    assert.equal(tex1Disposed, 1, 'flushRetired() disposes replaced texture cleanly');

    // 3. Re-composing at the SAME dimensions (e.g. re-adding artwork after resize) reuses tex2
    const artwork2 = {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          ...artwork.panelOverlays['outside:front-wall'],
          imageUrl: 'blob:mock/front-v2',
        },
      },
    };
    const tex3 = await composer.compose(solvedResized, artwork2, 'outside');
    assert.equal(tex3, tex2, 'same-dimension artwork update reuses active CanvasTexture');
    assert.equal(tex3.image.height, tex2.image.height);

    // 4. Growing back taller (415×277×191 -> 360×240×220) also reallocates cleanly (avoids GL_INVALID_VALUE)
    const tex4 = await composer.compose(solvedDefault, artwork2, 'outside');
    assert.ok(tex4);
    assert.notEqual(tex4, tex2, 'growing canvas height allocates a fresh CanvasTexture');
    assert.equal(tex4.image.height, h1);
    composer.flushRetired();

    // 5. Async race guard: older compose() finishing AFTER newer compose() must bail without drawing
    const staleArtwork = {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          ...artwork.panelOverlays['outside:front-wall'],
          imageUrl: 'blob:mock/deferred-old',
        },
      },
    };
    const freshArtwork = {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          ...artwork.panelOverlays['outside:front-wall'],
          imageUrl: 'blob:mock/fresh-new',
        },
      },
    };
    const stalePromise = composer.compose(solvedDefault, staleArtwork, 'outside');
    const freshPromise = composer.compose(solvedResized, freshArtwork, 'outside');
    const freshTex = await freshPromise;
    assert.ok(freshTex, 'newer async compose succeeds');
    const drawCountAfterFresh = freshTex.image.drawLog.length;

    // Resolve slow stale image decode AFTER newer frame already rendered
    pendingDecodes.get('blob:mock/deferred-old')?.();
    const staleTex = await stalePromise;
    assert.equal(staleTex, null, 'stale out-of-order compose returns null');
    assert.equal(freshTex.image.drawLog.length, drawCountAfterFresh, 'stale compose never mutates newer canvas');

    // 6. Finish mask also reallocates CanvasTexture cleanly on resize
    const solvedMaskDefault = solvePackagingTemplate({
      ...createDefaultPackagingParams('fefco-0201-rsc'),
      finishMode: 'gold-foil',
      finishTarget: 'brand-frame',
    });
    const solvedMaskResized = solvePackagingTemplate({
      ...createDefaultPackagingParams('fefco-0201-rsc'),
      lengthMm: 415,
      widthMm: 277,
      heightMm: 191,
      finishMode: 'gold-foil',
      finishTarget: 'brand-frame',
    });
    const mask1 = await composer.composeFinishMask(solvedMaskDefault, freshArtwork);
    const mask2 = await composer.composeFinishMask(solvedMaskResized, freshArtwork);
    assert.ok(mask1 && mask2);
    assert.notEqual(mask2, mask1, 'finish mask reallocates fresh CanvasTexture when blank resizes');
    assert.notEqual(mask2.image.height, mask1.image.height);
    composer.flushRetired();
    composer.dispose();
  } finally {
    globalThis.document = prevDocument;
    globalThis.Image = prevImage;
  }
});

test('FEFCO 0427 Flat Mailer closes in authentic 3-beat order (lid -> outer front tuck -> side-slot ears) with horizontal packing & die-cut insert tray', () => {
  const params = createDefaultPackagingParams('fefco-0427-mailer');
  assert.equal(params.lengthMm, 240);
  assert.equal(params.widthMm, 200);
  assert.equal(params.heightMm, 65);
  assert.equal(params.dimensionMode, 'inner');
  assert.equal(params.fluteDirection, 'along-W');
  assert.equal(params.lockTabCount, 1);
  assert.equal(params.thumbNotch, false);

  const solved = solvePackagingTemplate(params);
  assert.equal(solved.innerMm.length, 240);
  assert.equal(solved.innerMm.width, 200);
  assert.equal(solved.innerMm.height, 65);
  assert.equal(solved.rootPanel.holes.length, 2, 'default 1 tab/side punches 2 centered base lock slots');
  assert.equal(
    solved.flatPanels.length,
    19,
    'mailer box has base + front/back + 4 corner flaps + 6 rollover side panels + top lid + 2 lid wings + front tuck + 2 tuck locking ears',
  );

  // Verify 2-tab mode punches 4 slots cleanly and keeps preferences round-trip intact
  const twoTabSolved = solvePackagingTemplate({ ...params, lockTabCount: 2 });
  assert.equal(twoTabSolved.rootPanel.holes.length, 4, '2 tabs/side punches 4 base lock slots');
  assert.equal(parsePackagingParams({ templateId: 'fefco-0427-mailer' }).lockTabCount, 1);
  assert.equal(parsePackagingParams({ templateId: 'fefco-0427-mailer', lockTabCount: 2 }).lockTabCount, 2);

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);

  const worldBox = (id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };

  // --- BEAT 1 (fold = 0.69 hero open, and fold = 0.80 lid just closed):
  //     lid-front-tuck AND both locking ears MUST still be 100% FLAT (0°)! ---
  const tuckJoint = rig.joints.find((j) => j.panelId === 'lid-front-tuck');
  const leftEarJoint = rig.joints.find((j) => j.panelId === 'lid-tuck-left-ear');
  const rightEarJoint = rig.joints.find((j) => j.panelId === 'lid-tuck-right-ear');
  const topLidJoint = rig.joints.find((j) => j.panelId === 'top-lid');
  assert.ok(tuckJoint && leftEarJoint && rightEarJoint && topLidJoint);

  for (const preTuckFold of [0.69, 0.8]) {
    rig.setFoldProgress(preTuckFold);
    const tuckAngle = 2 * Math.acos(Math.min(1, Math.abs(tuckJoint.pivotGroup.quaternion.w)));
    const earAngle = 2 * Math.acos(Math.min(1, Math.abs(leftEarJoint.pivotGroup.quaternion.w)));
    assert.ok(tuckAngle < 1e-4, `at fold=${preTuckFold} lid-front-tuck stays completely flat (0°), got ${tuckAngle}`);
    assert.ok(earAngle < 1e-4, `at fold=${preTuckFold} locking ears stay completely flat (0°), got ${earAngle}`);
  }
  // At fold = 0.80, top-lid is ALREADY 100% closed (90°) BEFORE ears or front tuck fold!
  rig.setFoldProgress(0.8);
  const lidAngleAt80 = 2 * Math.acos(Math.min(1, Math.abs(topLidJoint.pivotGroup.quaternion.w)));
  assert.ok(Math.abs(lidAngleAt80 - Math.PI * 0.5) < 1e-3, 'top-lid finishes closing completely by fold=0.80');

  // --- BEAT 2 (fold = 0.89): BOTH side locking ears fold 90° inward FIRST while lid-front-tuck is STILL FLAT (0°)! ---
  rig.setFoldProgress(0.89);
  const earAngleAt89 = 2 * Math.acos(Math.min(1, Math.abs(leftEarJoint.pivotGroup.quaternion.w)));
  const tuckAngleAt89 = 2 * Math.acos(Math.min(1, Math.abs(tuckJoint.pivotGroup.quaternion.w)));
  assert.ok(earAngleAt89 > Math.PI * 0.45, 'side-slot locking ears fold inward FIRST before front tuck swings down');
  assert.ok(tuckAngleAt89 < 1e-4, 'lid-front-tuck waits flat (0°) until both locking ears have folded inward');

  // --- BEAT 3 (fold = 0.90 -> 1.00): lid-front-tuck swings down guiding both already-bent ears straight into side pockets! ---
  for (const glideFold of [0.92, 0.96, 1.0]) {
    rig.setFoldProgress(glideFold);
    const gLeftOuter = worldBox('left-wall');
    const gFrontLeftFlap = worldBox('front-left-flap');
    const gLeftEar = worldBox('lid-tuck-left-ear');
    assert.ok(
      gLeftEar.min.x > gLeftOuter.max.x && gLeftEar.max.x < gFrontLeftFlap.min.x,
      `at fold=${glideFold} left ear glides strictly inside the side channel without clipping outer wall or flap`,
    );
  }
  rig.setFoldProgress(1);
  const closedSize = rig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(
    Math.abs(closedSize.x * 1000 - solved.outerMm.length) < 0.05,
    `closed length matches outerMm (${solved.outerMm.length}mm), got ${(closedSize.x * 1000).toFixed(3)}mm`,
  );
  assert.ok(
    Math.abs(closedSize.z * 1000 - solved.outerMm.width) < 0.05,
    `closed width matches outerMm (${solved.outerMm.width}mm), got ${(closedSize.z * 1000).toFixed(3)}mm`,
  );
  assert.ok(
    Math.abs(closedSize.y * 1000 - solved.outerMm.height) < 0.05,
    `closed height matches outerMm (${solved.outerMm.height}mm), got ${(closedSize.y * 1000).toFixed(3)}mm`,
  );

  const baseBox = worldBox('base');
  const frontBox = worldBox('front-wall');
  const frontLeftFlapBox = worldBox('front-left-flap');
  const frontRightFlapBox = worldBox('front-right-flap');
  const backBox = worldBox('back-wall');
  const leftOuterBox = worldBox('left-wall');
  const rightOuterBox = worldBox('right-wall');
  const leftBridgeBox = worldBox('left-bridge');
  const leftInnerBox = worldBox('left-inner-wall');
  const rightBridgeBox = worldBox('right-bridge');
  const rightInnerBox = worldBox('right-inner-wall');
  const topLidBox = worldBox('top-lid');
  const leftWingBox = worldBox('lid-left-wing');
  const rightWingBox = worldBox('lid-right-wing');
  const frontTuckBox = worldBox('lid-front-tuck');
  const leftEarBox = worldBox('lid-tuck-left-ear');
  const rightEarBox = worldBox('lid-tuck-right-ear');

  // Top lid seats dead flush with rollover top rims
  assert.ok(Math.abs(topLidBox.max.y - leftBridgeBox.max.y) * 1000 < 0.05, 'top lid flush with left rollover rim');
  assert.ok(Math.abs(topLidBox.max.y - rightBridgeBox.max.y) * 1000 < 0.05, 'top lid flush with right rollover rim');
  // Lid dust wings sit strictly INSIDE left & right rollover inner walls and BEHIND front wall
  assert.ok(leftWingBox.min.x > leftInnerBox.max.x, 'lid-left-wing sits strictly inside left-inner-wall');
  assert.ok(rightWingBox.max.x < rightInnerBox.min.x, 'lid-right-wing sits strictly inside right-inner-wall');
  assert.ok(leftWingBox.max.z < frontBox.min.z, 'lid-left-wing stays strictly behind inner front wall');
  // Lid front tuck wraps cleanly OVER the OUTSIDE of front-wall (zero collision!)
  assert.ok(frontTuckBox.min.z > frontBox.max.z, 'lid-front-tuck wraps cleanly OUTSIDE front-wall');
  assert.ok(frontTuckBox.min.y >= baseBox.min.y - 1e-4, 'lid-front-tuck never pokes below box bottom');
  // Locking ears tuck cleanly INSIDE the double-wall side pockets ("khe hộp": between outer side wall & corner flap!)
  assert.ok(leftEarBox.min.x > leftOuterBox.max.x, 'lid-tuck-left-ear sits inside left outer wall');
  assert.ok(leftEarBox.max.x < frontLeftFlapBox.min.x, 'lid-tuck-left-ear clears front-left-flap inside side slot');
  assert.ok(rightEarBox.max.x < rightOuterBox.min.x, 'lid-tuck-right-ear sits inside right outer wall');
  assert.ok(rightEarBox.min.x > frontRightFlapBox.max.x, 'lid-tuck-right-ear clears front-right-flap inside side slot');
  assert.ok(leftEarBox.max.y < leftBridgeBox.min.y, 'lid-tuck-left-ear stays cleanly beneath left rollover bridge');
  assert.ok(leftEarBox.min.y > baseBox.max.y, 'lid-tuck-left-ear clears base interior floor');
  assert.ok(leftEarBox.min.z > backBox.max.z, 'lid-tuck-left-ear clears back wall');

  // Open hero showcase (fold = 0.70): bottom tray stays completely locked while lid opens with flat front tuck!
  rig.setFoldProgress(0.7);
  const openTopLid = worldBox('top-lid');
  const openLeftInner = worldBox('left-inner-wall');
  assert.ok(Math.abs(openLeftInner.min.x - leftInnerBox.min.x) * 1000 < 0.05, 'rollover walls locked at heroFold=0.70');
  assert.ok(openTopLid.max.y > topLidBox.max.y + 0.08, 'top lid opens cleanly for unboxing showcase at heroFold=0.70');

  // Horizontal lying bottle packing + optional die-cut corrugated product insert tray ("Khay giấy định hình"):
  const glass290 = getBeverageFootprintMm('basil-strawberry', 290); // D=68mm, H=180mm
  const flatNoInsert = computeAutoFitBoxDimensions({
    templateId: 'fefco-0427-mailer',
    itemMm: glass290,
    config: { cols: 3, rows: 1, spacingMm: 2, wallPaddingMm: 2, productInsert: false },
    thicknessMm: 1.5,
  });
  const flatWithInsert = computeAutoFitBoxDimensions({
    templateId: 'fefco-0427-mailer',
    itemMm: glass290,
    config: { cols: 3, rows: 1, spacingMm: 2, wallPaddingMm: 2, productInsert: true },
    thicknessMm: 1.5,
  });
  assert.ok(flatNoInsert.heightMm < 90, `flat lying mailer stays low-profile (~73mm), got ${flatNoInsert.heightMm}mm`);
  assert.ok(flatNoInsert.widthMm >= glass290.heightMm, 'flat mailer width fits lying bottle length');
  assert.ok(flatWithInsert.lengthMm > flatNoInsert.lengthMm, 'die-cut insert reserves sturdy corrugated bridges & borders');
  assert.ok(flatWithInsert.widthMm > flatNoInsert.widthMm, 'die-cut insert reserves sturdy front/back borders');

  const fittedInsertSolved = solvePackagingTemplate({
    ...params,
    dimensionMode: 'inner',
    lengthMm: flatWithInsert.lengthMm,
    widthMm: flatWithInsert.widthMm,
    heightMm: flatWithInsert.heightMm,
  });
  const flatLayout = computeBottlePackLayout(fittedInsertSolved, glass290, {
    ...createDefaultBottlePackConfig('basil-strawberry'),
    enabled: true,
    cols: 3,
    rows: 1,
    spacingMm: 2,
    wallPaddingMm: 2,
    productInsert: true,
  });
  assert.equal(flatLayout.horizontal, true, 'FEFCO 0427 packs bottles lying horizontally');
  assert.equal(flatLayout.fitsAll, true, '3 lying 290ml glass bottles fit cleanly with die-cut insert');

  // Square/rectangular PET bottles always snap to stable flat resting faces (90° / 180°) when lying horizontally,
  // never balancing awkwardly at 45° on a corner edge even with facingYawDeg or organicJitter!
  const pet1000 = getBeverageFootprintMm('pet-1000-juice', 1000);
  const squareSnapLayout = computeBottlePackLayout(fittedInsertSolved, pet1000, {
    ...createDefaultBottlePackConfig('pet-1000-juice'),
    enabled: true,
    cols: 3,
    rows: 1,
    facingYawDeg: 35,
    organicJitter: true,
    jitterSeed: 7,
  });
  for (const s of squareSnapLayout.slots) {
    const deg = Math.abs((s.yawRad * 180) / Math.PI) % 90;
    assert.ok(deg < 1e-4 || Math.abs(deg - 90) < 1e-4, `square bottle snapped to flat 90° face, got ${(s.yawRad * 180 / Math.PI).toFixed(2)}°`);
  }
  const rectBottle = { diameterXMm: 86, diameterZMm: 62, heightMm: 224 };
  const rectSnapLayout = computeBottlePackLayout(fittedInsertSolved, rectBottle, {
    ...createDefaultBottlePackConfig('pet-1000-short-juice'),
    enabled: true,
    cols: 2,
    rows: 1,
    facingYawDeg: 55,
  });
  for (const s of rectSnapLayout.slots) {
    const deg = Math.abs((s.yawRad * 180) / Math.PI) % 180;
    assert.ok(deg < 1e-4 || Math.abs(deg - 180) < 1e-4, `rectangular bottle snapped to flat 180° broad face, got ${(s.yawRad * 180 / Math.PI).toFixed(2)}°`);
  }

  const insertGeo = buildMailerInsertTrayGeometry({
    innerL: fittedInsertSolved.innerMm.length,
    innerW: fittedInsertSolved.innerMm.width,
    innerH: fittedInsertSolved.innerMm.height,
    slots: flatLayout.slots,
    itemMm: glass290,
    boardThicknessMm: fittedInsertSolved.params.thicknessMm,
  });
  assert.ok(insertGeo, 'die-cut product insert builds valid 3D geometry');
  assert.equal(insertGeo.groups.length, 2, 'insert separates paper liner faces (0) and 3-ply corrugated cut rims (1)');
  assert.ok(insertGeo.groups[0].count > 0 && insertGeo.groups[1].count > 0);
  insertGeo.computeBoundingBox();
  const insertSize = insertGeo.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(1000);
  assert.ok(insertSize.x < fittedInsertSolved.innerMm.length, 'insert fits strictly inside inner length');
  assert.ok(insertSize.z < fittedInsertSolved.innerMm.width, 'insert fits strictly inside inner width');
  assert.ok(insertSize.y < fittedInsertSolved.innerMm.height - 2, 'insert deck stays cleanly beneath closed top lid');
  insertGeo.dispose();

  // Preferences round-trip preserves productInsert toggle cleanly
  const validModels = new Set(['basil-strawberry', 'can-mango']);
  assert.equal(
    parseBottlePackConfig({ enabled: true, modelId: 'basil-strawberry', productInsert: true }, validModels).productInsert,
    true,
  );
  assert.equal(
    parseBottlePackConfig({ enabled: true, modelId: 'basil-strawberry', productInsert: false }, validModels).productInsert,
    undefined,
  );

  // Classic 6"x6"x2" outer-mode preset also matches exact outer dimensions!
  const sqSolved = solvePackagingTemplate({
    ...params,
    dimensionMode: 'outer',
    lengthMm: 152,
    widthMm: 152,
    heightMm: 51,
  });
  const sqRig = buildPackagingRig(sqSolved, materials);
  sqRig.setFoldProgress(1);
  const sqSize = sqRig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(sqSize.x * 1000 - 152) < 0.05, 'square 152mm outer length exact');
  assert.ok(Math.abs(sqSize.z * 1000 - 152) < 0.05, 'square 152mm outer width exact');
  assert.ok(Math.abs(sqSize.y * 1000 - 51) < 0.05, 'square 51mm outer height exact');
  sqRig.dispose();

  rig.dispose();
  materials.dispose();
});

test('ECMA A10 Overlap Seal-End Folding Carton (4-Can) nests 3-layer flaps with zero collision and fits 4x250ml slim cans', () => {
  const params = createDefaultPackagingParams('ecma-a10-seal-end');
  assert.equal(params.lengthMm, 110);
  assert.equal(params.widthMm, 110);
  assert.equal(params.heightMm, 134);
  assert.equal(params.dimensionMode, 'inner');
  assert.equal(params.materialId, 'ivory-350');

  const solved = solvePackagingTemplate(params);
  assert.equal(solved.innerMm.length, 110);
  assert.equal(solved.innerMm.width, 110);
  assert.equal(solved.innerMm.height, 134);
  assert.equal(solved.flatPanels.length, 13, 'ECMA A10 carton has 4 walls + glue tab + 4 dust flaps + 2 stepped seal flaps + 2 outer covers');

  // Verify outside print-side-up 2D layout: Glue tab attaches to Front Wall (far left on outside SVG)
  // and stepped inner glue flaps have the signature 8-vertex T-profile!
  const panelById = new Map(solved.flatPanels.map((p) => [p.id, p]));
  const gluePanel = panelById.get('glue-tab');
  const frontPanel = panelById.get('front-wall');
  const topSealPanel = panelById.get('top-back-flap');
  const botSealPanel = panelById.get('base');
  assert.ok(gluePanel && frontPanel && topSealPanel && botSealPanel);
  assert.ok(
    gluePanel.bounds.maxX >= solved.blankBounds.maxX - 1e-6 &&
      gluePanel.bounds.minX >= frontPanel.bounds.maxX - solved.params.thicknessMm - 1e-6,
    'glue tab sits on far left of outside print dieline attached to Front Wall',
  );
  assert.equal(topSealPanel.outline.length, 8, 'top stepped seal flap has T-shaped stepped glue tongue');
  assert.equal(botSealPanel.outline.length, 8, 'bottom stepped seal flap has T-shaped stepped glue tongue');

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);

  const worldBox = (id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };

  // Closed state (fold = 1): outer dimensions match outerMm within 0.05 mm and all 3 top & bottom layers nest cleanly!
  rig.setFoldProgress(1);
  const closedSize = rig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(
    Math.abs(closedSize.x * 1000 - solved.outerMm.length) < 0.05,
    `closed length matches outerMm (${solved.outerMm.length}mm), got ${(closedSize.x * 1000).toFixed(3)}mm`,
  );
  assert.ok(
    Math.abs(closedSize.z * 1000 - solved.outerMm.width) < 0.05,
    `closed width matches outerMm (${solved.outerMm.width}mm), got ${(closedSize.z * 1000).toFixed(3)}mm`,
  );
  assert.ok(
    Math.abs(closedSize.y * 1000 - solved.outerMm.height) < 0.05,
    `closed height matches outerMm (${solved.outerMm.height}mm), got ${(closedSize.y * 1000).toFixed(3)}mm`,
  );

  const botCoverBox = worldBox('bottom-front-flap');
  const botSteppedBox = worldBox('base');
  const botLeftBox = worldBox('bottom-left-flap');
  const botRightBox = worldBox('bottom-right-flap');
  const topLeftBox = worldBox('top-left-flap');
  const topRightBox = worldBox('top-right-flap');
  const topSteppedBox = worldBox('top-back-flap');
  const topCoverBox = worldBox('top-front-flap');
  const leftBox = worldBox('left-wall');
  const frontBox = worldBox('front-wall');
  const glueBox = worldBox('glue-tab');

  // Strict 3-layer bottom nesting: Bottom Outer Cover < Bottom Stepped Seal Flap < Bottom Left/Right Dust Flaps
  assert.ok(botCoverBox.max.y < botSteppedBox.min.y, 'bottom outer cover seals strictly beneath stepped bottom glue flap');
  assert.ok(botSteppedBox.max.y < botLeftBox.min.y, 'bottom-left dust flap sits strictly above stepped bottom glue flap');
  assert.ok(botSteppedBox.max.y < botRightBox.min.y, 'bottom-right dust flap sits strictly above stepped bottom glue flap');

  // Strict 3-layer top nesting: Top Left/Right Dust Flaps < Top Stepped Seal Flap < Top Outer Cover
  assert.ok(topLeftBox.max.y < topSteppedBox.min.y, 'top-left dust flap sits strictly beneath stepped top glue flap');
  assert.ok(topRightBox.max.y < topSteppedBox.min.y, 'top-right dust flap sits strictly beneath stepped top glue flap');
  assert.ok(topSteppedBox.max.y < topCoverBox.min.y, 'top outer cover seals strictly over stepped top glue flap');

  // Exact interior cavity height matches innerMm.height (134 mm)
  const cavityHeightMm = (topLeftBox.min.y - botLeftBox.max.y) * 1000;
  assert.ok(
    Math.abs(cavityHeightMm - solved.innerMm.height) < 0.05,
    `interior cavity height matches innerMm.height (${solved.innerMm.height}mm), got ${cavityHeightMm.toFixed(3)}mm`,
  );

  // Manufacturer glue tab sits strictly inside Left Wall and clear of interior cavity [-Linner/2, +Linner/2]
  assert.ok(glueBox.min.x > leftBox.max.x, 'glue tab sits strictly inside left wall');
  assert.ok(
    glueBox.max.x * 1000 <= -solved.innerMm.length * 0.5 + 0.05,
    `glue tab clears interior bottle cavity (${(glueBox.max.x * 1000).toFixed(2)} <= ${(-solved.innerMm.length * 0.5).toFixed(2)})`,
  );
  assert.ok(glueBox.max.z <= frontBox.min.z + 1e-4, 'glue tab sits strictly behind front wall');
  assert.ok(glueBox.min.y > botLeftBox.max.y && glueBox.max.y < topLeftBox.min.y, 'glue tab clears top & bottom dust flaps');

  // Hero showcase (fold = 0.90): bottom sealed + top stepped glue flap closed flat while outer top cover lifts open!
  rig.setFoldProgress(0.9);
  const openBotCover = worldBox('bottom-front-flap');
  const openTopStepped = worldBox('top-back-flap');
  const openTopCover = worldBox('top-front-flap');
  assert.ok(Math.abs(openBotCover.min.y - botCoverBox.min.y) * 1000 < 0.05, 'bottom cover remains sealed flat at heroFold=0.90');
  assert.ok(Math.abs(openTopStepped.max.y - topSteppedBox.max.y) * 1000 < 0.05, 'top stepped glue flap is seated flat at heroFold=0.90');
  assert.ok(openTopCover.max.y > topCoverBox.max.y + 0.03, 'top outer cover lifts cleanly open above stepped glue flap at heroFold=0.90');

  // Pack Your Bottles: 4 × 250 mL slim cans (2×2) fit cleanly inside default 110 × 110 × 134 mm carton!
  const slim250 = getBeverageFootprintMm('can-250-slim', 250);
  const pack4 = computeBottlePackLayout(solved, slim250, {
    ...createDefaultBottlePackConfig('can-250-slim'),
    enabled: true,
    cols: 2,
    rows: 2,
    spacingMm: 0.5,
    wallPaddingMm: 0.5,
  });
  assert.equal(pack4.itemCount, 4);
  assert.equal(pack4.fitsAll, true, '4 × 250ml slim cans (2×2) fit cleanly inside default 110×110×134 mm ECMA A10 carton');

  // Outer-mode sizing also solves exact closed outer dimensions
  const outerSolved = solvePackagingTemplate({
    ...params,
    dimensionMode: 'outer',
    lengthMm: 120,
    widthMm: 120,
    heightMm: 145,
  });
  const outerRig = buildPackagingRig(outerSolved, materials);
  outerRig.setFoldProgress(1);
  const outerSize = outerRig.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(outerSize.x * 1000 - 120) < 0.05, 'outer-mode length exact');
  assert.ok(Math.abs(outerSize.z * 1000 - 120) < 0.05, 'outer-mode width exact');
  assert.ok(Math.abs(outerSize.y * 1000 - 145) < 0.05, 'outer-mode height exact');
  outerRig.dispose();

  rig.dispose();
  materials.dispose();
});

test('3-tier non-recursive retail-box packing packs ECMA A10 & FEFCO 0427 cleanly inside trays/cartons with 90° Auto-Fit', () => {
  // 1. Strict 3-tier separation: outer cases pack retail boxes; retail boxes NEVER pack boxes (zero recursion!)
  assert.equal(canPackRetailBoxes('fefco-0421-tray'), true);
  assert.equal(canPackRetailBoxes('fefco-0201-rsc'), true);
  assert.equal(canPackRetailBoxes('fefco-0201e-beer-case'), true);
  assert.equal(canPackRetailBoxes('ecma-a10-seal-end'), false);
  assert.equal(canPackRetailBoxes('fefco-0427-mailer'), false);
  assert.equal(canPackRetailBoxes('rigid-lid-base'), false);

  assert.equal(isPackableRetailBoxTemplate('ecma-a10-seal-end'), true);
  assert.equal(isPackableRetailBoxTemplate('ecma-a21-snap-lock'), true);
  assert.equal(isPackableRetailBoxTemplate('fefco-0427-mailer'), true);
  assert.equal(isPackableRetailBoxTemplate('rigid-lid-base'), true);
  assert.equal(isPackableRetailBoxTemplate('fefco-0421-tray'), false);
  assert.equal(isPackableRetailBoxTemplate('fefco-0201-rsc'), false);
  assert.equal(getPackableRetailBoxTemplates().length, 4);

  // 2. Preferences & project record sanitization enforce strict Tier-2 allowlists
  const validModels = new Set(['can-mango', 'can-250-slim']);
  const boxCfg = parseBottlePackConfig(
    {
      enabled: true,
      itemKind: 'box',
      boxProjectId: 'proj_ecma_01',
      boxTemplateId: 'ecma-a10-seal-end',
      cols: 3,
      rows: 2,
      spacingMm: 2,
      wallPaddingMm: 2,
      facingYawDeg: 90,
    },
    validModels,
  );
  assert.equal(boxCfg.itemKind, 'box');
  assert.equal(boxCfg.boxProjectId, 'proj_ecma_01');
  assert.equal(boxCfg.boxTemplateId, 'ecma-a10-seal-end');

  // Hostile/recursive boxTemplateId (e.g. outer carton inside outer carton) falls back to safe Tier-2 retail box!
  const recursiveAttempt = parseBottlePackConfig(
    { enabled: true, itemKind: 'box', boxTemplateId: 'fefco-0201-rsc', boxProjectId: '../bad' },
    validModels,
  );
  assert.equal(recursiveAttempt.boxTemplateId, 'ecma-a10-seal-end');
  assert.equal(recursiveAttempt.boxProjectId, undefined);

  // Project record parser strips non-retail packedBox snapshots (strictly prevents nested outer cases!)
  const parsedValidRecord = parseCustomProjectRecord({
    id: 'tray-6x4can',
    name: '6-Pack 4-Can Display Tray',
    kind: 'packaging',
    date: '2026-11-28T10:00:00.000Z',
    settings: {},
    packagingParams: createDefaultPackagingParams('fefco-0421-tray'),
    bottlePack: boxCfg,
    packedBox: {
      name: 'Lychee 4-Can Carton',
      packagingParams: createDefaultPackagingParams('ecma-a10-seal-end'),
    },
  });
  assert.ok(parsedValidRecord?.packedBox);
  assert.equal(parsedValidRecord.packedBox.packagingParams.templateId, 'ecma-a10-seal-end');
  assert.equal(parsedValidRecord.packedBox.packagingParams.foldProgress, 1, 'packedBox always freezes closed');

  const parsedIllegalNested = parseCustomProjectRecord({
    id: 'bad-nested',
    name: 'Illegal Carton In Carton',
    kind: 'packaging',
    date: '2026-11-28T10:00:00.000Z',
    settings: {},
    packagingParams: createDefaultPackagingParams('fefco-0201-rsc'),
    packedBox: {
      name: 'Outer Carton',
      packagingParams: createDefaultPackagingParams('fefco-0201-rsc'),
    },
  });
  assert.equal(parsedIllegalNested?.packedBox, undefined, 'outer carton rejected inside packedBox snapshot');

  // 3. Rectangular retail box (FEFCO 0427: 240×200×65 inner) swaps X/Z accurately when rotated 90°!
  assert.equal(snapPackedBoxYawDeg(84), 90);
  assert.equal(snapPackedBoxYawDeg(-95), -90);
  assert.equal(snapPackedBoxYawDeg(175), 180);
  const rectBoxParams = createDefaultPackagingParams('fefco-0427-mailer');
  const rectFp = getRetailBoxFootprintMm(rectBoxParams);
  assert.ok(rectFp.diameterXMm > rectFp.diameterZMm + 20, 'rectangular mailer has distinct L vs W');
  const fit0 = computeAutoFitBoxDimensions({
    templateId: 'fefco-0201-rsc',
    itemMm: rectFp,
    config: { itemKind: 'box', cols: 2, rows: 1, spacingMm: 2, wallPaddingMm: 2, facingYawDeg: 0 },
    thicknessMm: 3,
  });
  const fit90 = computeAutoFitBoxDimensions({
    templateId: 'fefco-0201-rsc',
    itemMm: rectFp,
    config: { itemKind: 'box', cols: 2, rows: 1, spacingMm: 2, wallPaddingMm: 2, facingYawDeg: 90 },
    thicknessMm: 3,
  });
  assert.ok(fit0.lengthMm > fit90.lengthMm + 50, `0° 2×1 length (${fit0.lengthMm}) > 90° rotated length (${fit90.lengthMm})`);
  assert.ok(fit90.widthMm > fit0.widthMm + 25, `90° rotated width (${fit90.widthMm}) > 0° width (${fit0.widthMm})`);

  // 4. Merged closed ECMA A10 box geometry & instanced 6-box (3×2 = 24 cans) FEFCO 0421 Display Tray!
  const innerEcmaParams = createDefaultPackagingParams('ecma-a10-seal-end');
  const ecmaFp = getRetailBoxFootprintMm(innerEcmaParams);
  const innerSolved = solvePackagingTemplate({ ...innerEcmaParams, foldProgress: 1 });
  const innerMats = createPackagingMaterialSet(innerSolved.params, innerSolved.material);
  const innerRig = buildPackagingRig(innerSolved, innerMats);
  const merged = mergeClosedBoxRigGeometry(innerRig);
  innerRig.dispose();
  innerMats.dispose();

  assert.equal(merged.geometry.groups.length, 3, 'merged closed box separates outside, inside, and edge groups');
  assert.ok(merged.geometry.groups[0].count > 0 && merged.geometry.groups[2].count > 0);
  assert.ok(Math.abs(merged.footprintMm.diameterXMm - ecmaFp.diameterXMm) < 0.2, 'merged X matches outerMm.length');
  assert.ok(Math.abs(merged.footprintMm.diameterZMm - ecmaFp.diameterZMm) < 0.2, 'merged Z matches outerMm.width');
  assert.ok(Math.abs(merged.footprintMm.heightMm - ecmaFp.heightMm) < 0.2, 'merged Y matches outerMm.height');
  assert.ok(Math.abs(merged.localBounds.min.y) < 1e-4, 'merged box rests cleanly at local y = 0');
  merged.geometry.dispose();
  merged.windowFilmGeometry?.dispose();

  // Mount 6× ECMA A10 cartons (3×2) inside an auto-fitted FEFCO 0421 Display Tray via PackagingSubject!
  const trayFit = computeAutoFitBoxDimensions({
    templateId: 'fefco-0421-tray',
    itemMm: ecmaFp,
    config: { itemKind: 'box', cols: 3, rows: 2, spacingMm: 2, wallPaddingMm: 2, facingYawDeg: 0 },
    thicknessMm: 1.5,
  });
  assert.ok(trayFit.lengthMm >= 338 && trayFit.lengthMm <= 350, `3×2 ECMA A10 tray inner L ~343mm, got ${trayFit.lengthMm}`);
  assert.ok(trayFit.widthMm >= 224 && trayFit.widthMm <= 236, `3×2 ECMA A10 tray inner W ~228mm, got ${trayFit.widthMm}`);
  assert.ok(trayFit.heightMm < ecmaFp.heightMm * 0.6, 'display tray stays low so retail box fronts show clearly');

  const trayParams = {
    ...createDefaultPackagingParams('fefco-0421-tray'),
    dimensionMode: 'inner',
    lengthMm: trayFit.lengthMm,
    widthMm: trayFit.widthMm,
    heightMm: trayFit.heightMm,
    foldProgress: 1,
  };
  const subject = createPackagingSubject(trayParams, { mode: 'panel', panelOverlays: {} });
  const emptyBounds = subject.getBounds();
  subject.syncBottlePack(
    {
      ...createDefaultBottlePackConfig('can-250-slim'),
      enabled: true,
      itemKind: 'box',
      boxTemplateId: 'ecma-a10-seal-end',
      cols: 3,
      rows: 2,
      spacingMm: 2,
      wallPaddingMm: 2,
      facingYawDeg: 0,
    },
    null,
    { params: innerEcmaParams, artworkKey: 'test-ecma' },
  );
  const packedBounds = subject.getBounds();
  const emptyH = emptyBounds.getSize(new THREE.Vector3()).y * 1000;
  const packedH = packedBounds.getSize(new THREE.Vector3()).y * 1000;
  assert.ok(
    packedH > emptyH + 60,
    `6× ECMA A10 cartons rise cleanly above low display tray (${packedH.toFixed(1)}mm > ${emptyH.toFixed(1)}mm)`,
  );

  // Verify createBoxPacker refuses to render inside a Tier-2 retail box (defensive non-recursive guard!)
  const boxPacker = createBoxPacker();
  boxPacker.sync(
    innerSolved,
    { ...createDefaultBottlePackConfig('can-250-slim'), enabled: true, itemKind: 'box', cols: 2, rows: 1 },
    { params: innerEcmaParams },
  );
  assert.equal(boxPacker.group.visible, false, 'boxPacker refuses to pack boxes inside a Tier-2 retail box');
  assert.equal(boxPacker.measureBounds().isEmpty(), true);
  boxPacker.dispose();
  subject.dispose();
});

test('ECMA A21 Tuck-Top Snap-Lock Carton (1-2-3 Bottom) nests zero-collision bottom/top and supports 0/1/2/3 front rim lock tabs', () => {
  const params = createDefaultPackagingParams('ecma-a21-snap-lock');
  assert.equal(params.lengthMm, 126);
  assert.equal(params.widthMm, 66);
  assert.equal(params.heightMm, 167);
  assert.equal(params.dimensionMode, 'inner');
  assert.equal(params.materialId, 'ivory-350');
  assert.equal(params.frontLockTabCount, 1);

  const solved0 = solvePackagingTemplate({ ...params, frontLockTabCount: 0 });
  const solved1 = solvePackagingTemplate({ ...params, frontLockTabCount: 1 });
  const solved2 = solvePackagingTemplate({ ...params, frontLockTabCount: 2 });
  const solved3 = solvePackagingTemplate({ ...params, frontLockTabCount: 3 });

  assert.equal(solved1.flatPanels.length, 13, 'ECMA A21 has 4 walls + glue tab + 4 1-2-3 bottom flaps + 2 dust flaps + top lid + tuck flap');

  // Verify 0 / 1 / 2 / 3 front rim lock tabs progressively add rounded tabs to Front Wall & matching slots to Top Lid!
  const frontOutlineLen = (s) => s.flatPanels.find((p) => p.id === 'front-wall').outline.length;
  const lidOutlineLen = (s) => s.flatPanels.find((p) => p.id === 'top-lid').outline.length;
  assert.equal(lidOutlineLen(solved0), 4, '0 lock tabs keeps Top Lid crease clean straight rectangle');
  assert.ok(frontOutlineLen(solved1) > frontOutlineLen(solved0), '1 lock tab adds tab vertices to Front Wall');
  assert.ok(frontOutlineLen(solved2) > frontOutlineLen(solved1), '2 lock tabs adds 2nd tab to Front Wall');
  assert.ok(frontOutlineLen(solved3) > frontOutlineLen(solved2), '3 lock tabs adds 3rd tab to Front Wall');
  assert.equal(lidOutlineLen(solved1), 8, '1 lock tab carves 1 matching slot along Top Lid crease');
  assert.equal(lidOutlineLen(solved2), 12, '2 lock tabs carve 2 matching slots along Top Lid crease');
  assert.equal(lidOutlineLen(solved3), 16, '3 lock tabs carve 3 matching slots along Top Lid crease');

  // Preferences sanitization clamps frontLockTabCount strictly to 0 | 1 | 2 | 3
  for (const n of [0, 1, 2, 3]) {
    assert.equal(parsePackagingParams({ templateId: 'ecma-a21-snap-lock', frontLockTabCount: n }).frontLockTabCount, n);
  }
  assert.equal(parsePackagingParams({ templateId: 'ecma-a21-snap-lock', frontLockTabCount: 99 }).frontLockTabCount, 1);

  // Verify closed 3D geometry & exact zero-collision nesting for both 0 tabs (exact outerMm) and 3 tabs (protruding tabs)
  const materials = createPackagingMaterialSet(solved0.params, solved0.material);
  const rig0 = buildPackagingRig(solved0, materials);
  const worldBox = (rig, id) => {
    const entry = rig.panelMeshes.get(id);
    assert.ok(entry, `panel ${id} exists`);
    entry.mesh.geometry.computeBoundingBox();
    return entry.mesh.geometry.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld);
  };

  rig0.setFoldProgress(1);
  const size0 = rig0.measureBounds().getSize(new THREE.Vector3());
  assert.ok(Math.abs(size0.x * 1000 - solved0.outerMm.length) < 0.05, '0-tab closed length exact');
  assert.ok(Math.abs(size0.z * 1000 - solved0.outerMm.width) < 0.05, '0-tab closed width exact');
  assert.ok(Math.abs(size0.y * 1000 - solved0.outerMm.height) < 0.05, '0-tab closed height exact');

  const botForkBox = worldBox(rig0, 'bottom-front-flap');
  const botTongueBox = worldBox(rig0, 'base');
  const botLeftBox = worldBox(rig0, 'bottom-left-flap');
  const botRightBox = worldBox(rig0, 'bottom-right-flap');
  const topLeftBox = worldBox(rig0, 'top-left-flap');
  const topRightBox = worldBox(rig0, 'top-right-flap');
  const topLidBox = worldBox(rig0, 'top-lid');
  const topTuckBox = worldBox(rig0, 'top-tuck-flap');
  const frontBox0 = worldBox(rig0, 'front-wall');
  const leftBox0 = worldBox(rig0, 'left-wall');
  const glueBox0 = worldBox(rig0, 'glue-tab');

  // Strict 3-layer 1-2-3 bottom nesting: U-Fork (outermost) < Center Tongue (middle) < Left/Right Side Hooks (innermost)
  assert.ok(botForkBox.max.y < botTongueBox.min.y, '1-2-3 bottom U-fork nests cleanly beneath center tongue');
  assert.ok(botTongueBox.max.y < botLeftBox.min.y, 'bottom-left hook nests cleanly above center tongue');
  assert.ok(botTongueBox.max.y < botRightBox.min.y, 'bottom-right hook nests cleanly above center tongue');

  // Strict 2-layer tuck top nesting: Dust flaps < Top Lid, and Top Tuck slides strictly BEHIND Front Wall!
  assert.ok(topLeftBox.max.y < topLidBox.min.y, 'top-left dust flap sits strictly beneath top lid');
  assert.ok(topRightBox.max.y < topLidBox.min.y, 'top-right dust flap sits strictly beneath top lid');
  assert.ok(topTuckBox.max.z < frontBox0.min.z, 'top tuck flap tucks strictly INSIDE front wall with zero collision');

  // Exact interior cavity height (167 mm) & tucked glue tab
  const cavityH = (topLeftBox.min.y - botLeftBox.max.y) * 1000;
  assert.ok(Math.abs(cavityH - solved0.innerMm.height) < 0.05, `interior cavity height exact (${cavityH.toFixed(3)}mm)`);
  assert.ok(glueBox0.min.x > leftBox0.max.x && glueBox0.max.x * 1000 <= -solved0.innerMm.length * 0.5 + 0.05, 'glue tab clear of cavity');

  // With 3 front rim lock tabs: tabs rise cleanly above the closed Top Lid surface!
  const rig3 = buildPackagingRig(solved3, materials);
  rig3.setFoldProgress(1);
  const frontBox3 = worldBox(rig3, 'front-wall');
  const lidBox3 = worldBox(rig3, 'top-lid');
  assert.ok(
    (frontBox3.max.y - lidBox3.max.y) * 1000 >= 4.0,
    `3 front rim lock tabs protrude cleanly above closed top lid (+${((frontBox3.max.y - lidBox3.max.y) * 1000).toFixed(2)}mm)`,
  );

  // Hero showcase (fold = 0.84): bottom 1-2-3 locked flat while top lid is open ajar!
  rig3.setFoldProgress(0.84);
  const openBotFork = worldBox(rig3, 'bottom-front-flap');
  const openLid = worldBox(rig3, 'top-lid');
  assert.ok(Math.abs(openBotFork.min.y - botForkBox.min.y) * 1000 < 0.05, '1-2-3 bottom stays locked at heroFold=0.84');
  assert.ok(openLid.max.y > lidBox3.max.y + 0.015, 'top lid opens cleanly ajar at heroFold=0.84');

  // Packable inside FEFCO 0421 Display Tray as a Tier-2 retail box!
  const a21Fp = getRetailBoxFootprintMm(solved1.params);
  assert.ok(Math.abs(a21Fp.diameterXMm - solved1.outerMm.length) < 0.1);
  assert.ok(Math.abs(a21Fp.diameterZMm - solved1.outerMm.width) < 0.1);

  rig3.dispose();
  rig0.dispose();
  materials.dispose();
});
