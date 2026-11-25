const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');

const loadSource = require('../lib/load-ts-source.cjs').createSourceLoader();
const root = path.resolve(__dirname, '../..');

const {
  bottleArtworkScope,
  packagingFaceArtworkScope,
  packagingTemplateScopePrefix,
  saveArtwork,
} = loadSource(path.join(root, 'lib/labellab/artwork-store'));

const {
  parseCustomProjectRecord,
  sanitizeProjectName,
  readLegacyLocalStorageProjects,
  LEGACY_PROJECT_STORAGE_KEY,
} = loadSource(path.join(root, 'lib/labellab/project-store'));

const {
  getPanelUprightSizeMm,
  isInteractivePackagingPanel,
  getPanelSurfaceRotationDeg,
} = loadSource(path.join(root, 'lib/packaging-cad/artwork-composer'));

const {
  createDefaultPackagingParams,
  solvePackagingTemplate,
} = loadSource(path.join(root, 'lib/packaging-cad/templates/registry'));

const {
  createPackagingMaterialSet,
} = loadSource(path.join(root, 'lib/packaging-cad/materials/corrugated-materials'));

const {
  buildPackagingRig,
} = loadSource(path.join(root, 'lib/packaging-cad/kinematics/rig-builder'));

const {
  createPackagingSubject,
} = loadSource(path.join(root, 'lib/packaging-cad/adapter'));

const {
  parseBottlePackConfig,
  saveBottlePackConfig,
  loadBottlePackConfig,
  createDefaultBottlePackConfig,
} = loadSource(path.join(root, 'lib/packaging-cad/preferences'));

test('artwork scope helpers isolate bottle labels and individual box faces cleanly', async () => {
  const chiaBottleScope = bottleArtworkScope('glass-290-chia');
  const mangoCanScope = bottleArtworkScope('can-mango');
  const trayFrontOutside = packagingFaceArtworkScope('fefco-0421-tray', 'outside', 'front-wall');
  const trayRightOutside = packagingFaceArtworkScope('fefco-0421-tray', 'outside', 'right-wall');
  const trayFrontInside = packagingFaceArtworkScope('fefco-0421-tray', 'inside', 'front-wall');
  const rscFrontOutside = packagingFaceArtworkScope('fefco-0201-rsc', 'outside', 'front-wall');

  const uniqueScopes = new Set([
    chiaBottleScope,
    mangoCanScope,
    trayFrontOutside,
    trayRightOutside,
    trayFrontInside,
    rscFrontOutside,
  ]);
  assert.equal(uniqueScopes.size, 6, 'every bottle model, template, surface and face has a distinct scope');
  assert.ok(trayFrontOutside.startsWith(packagingTemplateScopePrefix('fefco-0421-tray')));
  assert.ok(!rscFrontOutside.startsWith(packagingTemplateScopePrefix('fefco-0421-tray')));

  const base = {
    id: 'scoped-1',
    name: 'Front Banner',
    source: new Blob(['x'], { type: 'image/png' }),
    preview: new Blob(['x'], { type: 'image/png' }),
    width: 100,
    height: 50,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    dieline: { width: 212, height: 83, unit: 'mm' },
    scope: trayFrontOutside,
    createdAt: 1,
    updatedAt: 1,
  };
  await assert.rejects(saveArtwork({ ...base, scope: '' }), /Invalid artwork record/);
  await assert.rejects(saveArtwork(base), /unavailable/i);
});

test('per-face upright dimensions, inside/outside UV rotation, and single-face hover isolation work accurately', () => {
  const solved = solvePackagingTemplate(createDefaultPackagingParams('fefco-0421-tray'));
  const front = solved.flatPanels.find((p) => p.id === 'front-wall');
  const right = solved.flatPanels.find((p) => p.id === 'right-wall');
  const left = solved.flatPanels.find((p) => p.id === 'left-wall');
  const leftInner = solved.flatPanels.find((p) => p.id === 'left-inner-wall');
  const bridge = solved.flatPanels.find((p) => p.id === 'left-bridge');

  assert.ok(front && right && left && leftInner && bridge);
  assert.equal(isInteractivePackagingPanel(front), true);
  assert.equal(isInteractivePackagingPanel(right), true);
  assert.equal(isInteractivePackagingPanel(leftInner), true, 'visible inner rollover wall is interactive');
  assert.equal(isInteractivePackagingPanel(bridge), false, 'thin 2mm top bridge rim is not a printable artwork face');

  const frontSize = getPanelUprightSizeMm(front);
  const rightSize = getPanelUprightSizeMm(right);
  assert.ok(frontSize.widthMm > frontSize.heightMm, 'front wall upright width > height');
  assert.ok(rightSize.widthMm > rightSize.heightMm, 'right wall upright swaps 90° bounds so width > height');

  // Inside UV horizontally mirrors U, so upright rotation negates cleanly (180 -> -180, 90 -> -90, -90 -> +90, 0 -> 0).
  assert.equal(getPanelSurfaceRotationDeg(180, 'outside'), 180);
  assert.equal(getPanelSurfaceRotationDeg(180, 'inside'), -180);
  assert.equal(getPanelSurfaceRotationDeg(90, 'outside'), 90);
  assert.equal(getPanelSurfaceRotationDeg(90, 'inside'), -90);
  assert.equal(getPanelSurfaceRotationDeg(-90, 'outside'), -90);
  assert.equal(getPanelSurfaceRotationDeg(-90, 'inside'), 90);
  assert.equal(getPanelSurfaceRotationDeg(0, 'inside'), 0);

  // Verify rig.setHoverFace highlights ONLY the hovered surface of ONLY the hovered panel.
  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const rig = buildPackagingRig(solved, materials);
  rig.setHoverFace({ panelId: 'front-wall', surface: 'outside' });
  const frontMats = rig.panelMeshes.get('front-wall').mesh.material;
  const rightMats = rig.panelMeshes.get('right-wall').mesh.material;
  assert.equal(frontMats[0], materials.hoverOutside, 'front-wall outside uses hoverOutside');
  assert.equal(frontMats[1], materials.inside, 'front-wall inside remains untouched');
  assert.equal(rightMats[0], materials.outside, 'right-wall outside remains untouched');

  rig.setHoverFace({ panelId: 'front-wall', surface: 'inside' });
  const frontMatsInside = rig.panelMeshes.get('front-wall').mesh.material;
  assert.equal(frontMatsInside[0], materials.outside, 'front-wall outside restored');
  assert.equal(frontMatsInside[1], materials.hoverInside, 'front-wall inside uses hoverInside');

  rig.setHoverFace(null);
  assert.equal(rig.panelMeshes.get('front-wall').mesh.material[1], materials.inside);

  rig.dispose();
  materials.dispose();
});

test('PackagingSubject pickTarget raycasts exact face and surface with occlusion', () => {
  const params = createDefaultPackagingParams('fefco-0421-tray');
  const subject = createPackagingSubject(params, { mode: 'panel', panelOverlays: {} });
  subject.root.updateMatrixWorld(true);
  const bounds = subject.getBounds();
  const center = bounds.getCenter(new THREE.Vector3());

  // Cast a ray straight at the front wall from +Z toward -Z -> must hit front-wall outside!
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(center.x, center.y, bounds.max.z + 0.5),
    new THREE.Vector3(0, 0, -1),
  );
  const hitFront = subject.pickTarget(raycaster);
  assert.ok(hitFront && hitFront.kind === 'packaging-face', 'front ray hits a packaging face');
  assert.equal(hitFront.panelId, 'front-wall');
  assert.equal(hitFront.surface, 'outside');
  assert.ok(hitFront.widthMm > 200 && hitFront.heightMm > 40);

  // Cast a ray from +X toward -X -> must hit right-wall outside!
  const rayRight = new THREE.Raycaster(
    new THREE.Vector3(bounds.max.x + 0.5, center.y, center.z),
    new THREE.Vector3(-1, 0, 0),
  );
  const hitRight = subject.pickTarget(rayRight);
  assert.ok(hitRight && hitRight.kind === 'packaging-face');
  assert.equal(hitRight.panelId, 'right-wall');
  assert.equal(hitRight.surface, 'outside');

  // Hover state transitions cleanly without throwing.
  subject.setHoverTarget(hitFront);
  subject.setHoverTarget(hitRight);
  subject.setHoverTarget(null);
  subject.dispose();
});

test('custom project validation, legacy migration, and BottlePackConfig customProjectId round-trip cleanly', () => {
  assert.equal(sanitizeProjectName('   My   Gold   Chia  '), 'My Gold Chia');
  assert.equal(sanitizeProjectName('   ', 'Fallback'), 'Fallback');

  const blob = new Blob(['pngdata'], { type: 'image/png' });
  const parsed = parseCustomProjectRecord({
    id: 'proj_123',
    name: '  Vinut Gold Edition ',
    kind: 'beverage',
    date: '2026-11-25T10:00:00.000Z',
    settings: {
      modelId: 'glass-290-chia',
      liquidColor: '#123456',
      capColor: '#d4af37',
      bodyColor: '#ffffff',
      capMetalness: 0.95,
      capRoughness: 0.12,
      labelOffset: 15,
    },
    artworkId: 'art_42',
    artworkBlob: blob,
    thumbnailBlob: blob,
  });
  assert.ok(parsed);
  assert.equal(parsed.name, 'Vinut Gold Edition');
  assert.equal(parsed.kind, 'beverage');
  assert.equal(parsed.settings.modelId, 'glass-290-chia');
  assert.equal(parsed.settings.liquidColor, '#123456');
  assert.equal(parsed.settings.capColor, '#d4af37');
  assert.equal(parsed.settings.capMetalness, 0.95);
  assert.equal(parsed.settings.labelOffset, 15);
  assert.equal(parsed.artworkBlob, blob);
  assert.equal(parsed.thumbnailBlob, blob);

  // Reject malformed records safely.
  assert.equal(parseCustomProjectRecord(null), null);
  assert.equal(parseCustomProjectRecord({ id: '', name: 'Bad' }), null);

  // Legacy localStorage projects migrate smoothly as beverage projects.
  const store = new Map();
  store.set(
    LEGACY_PROJECT_STORAGE_KEY,
    JSON.stringify([
      {
        id: 'legacy-1',
        name: 'Old Project',
        date: '2026-10-01T00:00:00.000Z',
        settings: { modelId: 'can-mango', capColor: '#111111' },
      },
    ]),
  );
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const legacy = readLegacyLocalStorageProjects(storage);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].kind, 'beverage');
  assert.equal(legacy[0].settings.modelId, 'can-mango');

  // BottlePackConfig persists customProjectId and packLabelArtworkId safely & strips hostile ids.
  const validModels = new Set(['glass-290-chia', 'can-mango']);
  const packCfg = {
    ...createDefaultBottlePackConfig('glass-290-chia'),
    enabled: true,
    customProjectId: 'proj_123',
    packLabelArtworkId: 'art_42',
  };
  assert.equal(saveBottlePackConfig(packCfg, validModels, storage), true);
  const loadedPack = loadBottlePackConfig(validModels, 'can-mango', storage);
  assert.equal(loadedPack.customProjectId, 'proj_123');
  assert.equal(loadedPack.packLabelArtworkId, 'art_42');

  const hostilePack = parseBottlePackConfig(
    { enabled: true, modelId: 'glass-290-chia', customProjectId: '../../etc/passwd', packLabelArtworkId: '<script>' },
    validModels,
    'can-mango',
  );
  assert.equal(hostilePack.customProjectId, undefined);
  assert.equal(hostilePack.packLabelArtworkId, undefined);
});
