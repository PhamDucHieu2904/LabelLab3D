const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');

function loadTs(filename) {
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = name => name.startsWith('.')
    ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return loaded.exports;
}

const { exportRefractionUvTransform, createExportRefractionSession } =
  loadTs(path.resolve(__dirname, '../../lib/mockup/export-refraction.ts'));
const { mockupCaptureSize, createMockupTiles } =
  loadTs(path.resolve(__dirname, '../../lib/mockup/capture.ts'));

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10,
    `${message}: expected ${expected}, received ${actual}`);
}

function applyTransform(transform, uv) {
  return [transform[0] + uv[0] * transform[2], transform[1] + uv[1] * transform[3]];
}

function rect(tile) {
  return { x: tile.renderX, y: tile.renderY, width: tile.renderWidth, height: tile.renderHeight };
}

function tileUvAtPixel(tileRect, x, y) {
  // Output PNG coordinates start at the top, while shader/framebuffer UV starts
  // at the bottom. Pixel centres avoid accidentally accepting a half-pixel shift.
  return [(x + 0.5 - tileRect.x) / tileRect.width,
    1 - (y + 0.5 - tileRect.y) / tileRect.height];
}

test('8129 Story atlas keeps top/bottom orientation and the partial last tile pixel centres', () => {
  const size = mockupCaptureSize(8129, 9 / 16);
  assert.deepEqual(size, { width: 4573, height: 8129, longEdge: 8129 });
  const source = { x: 0, y: 0, width: size.width, height: size.height };
  const tiles = createMockupTiles(size.width, size.height);
  const first = rect(tiles[0]);
  const last = rect(tiles[tiles.length - 1]);
  assert.equal(last.x + last.width, size.width);
  assert.equal(last.y + last.height, size.height);
  assert.notEqual(last.width, first.width, 'Exercise the odd-width partial edge tile');
  assert.notEqual(last.height, first.height, 'Exercise the odd-height partial edge tile');

  for (const tile of [first, last]) {
    const transform = exportRefractionUvTransform(source, tile, size.height);
    for (const [x, y] of [
      [tile.x, tile.y], [tile.x + tile.width - 1, tile.y],
      [tile.x, tile.y + tile.height - 1],
      [tile.x + tile.width - 1, tile.y + tile.height - 1],
    ]) {
      const uv = applyTransform(transform, tileUvAtPixel(tile, x, y));
      close(uv[0], (x + 0.5) / size.width, 'Atlas horizontal pixel centre');
      close(uv[1], 1 - (y + 0.5) / size.height, 'Atlas vertical pixel centre');
    }
  }
  const firstTransform = exportRefractionUvTransform(source, first, size.height);
  const lastTransform = exportRefractionUvTransform(source, last, size.height);
  close(applyTransform(firstTransform, [0, 1])[1], 1, 'Top edge stays at atlas V=1');
  close(applyTransform(lastTransform, [1, 0])[1], 0, 'Bottom edge stays at atlas V=0');
});

test('adjacent guarded tiles sample identical atlas pixels across both Story seam directions', () => {
  const size = mockupCaptureSize(8129, 9 / 16);
  // A bounded atlas may cover a product crop rather than the whole output.
  const source = { x: 527, y: 719, width: 3181, height: 6553 };
  const tiles = createMockupTiles(size.width, size.height);
  let verticalOverlaps = 0;
  let horizontalOverlaps = 0;
  let pixelChecks = 0;

  for (const a of tiles) for (const b of tiles) {
    const vertical = a.y === b.y && a.x + a.width === b.x;
    const horizontal = a.x === b.x && a.y + a.height === b.y;
    if (!vertical && !horizontal) continue;
    const aRect = rect(a), bRect = rect(b);
    const left = Math.max(aRect.x, bRect.x);
    const top = Math.max(aRect.y, bRect.y);
    const right = Math.min(aRect.x + aRect.width, bRect.x + bRect.width);
    const bottom = Math.min(aRect.y + aRect.height, bRect.y + bRect.height);
    assert.ok(right > left && bottom > top, 'Neighboring expanded renders must share guard pixels');
    if (vertical) verticalOverlaps++;
    if (horizontal) horizontalOverlaps++;
    const aTransform = exportRefractionUvTransform(source, aRect, size.height);
    const bTransform = exportRefractionUvTransform(source, bRect, size.height);

    for (const [x, y] of [
      [left, top], [right - 1, top], [left, bottom - 1], [right - 1, bottom - 1],
      [Math.floor((left + right - 1) / 2), Math.floor((top + bottom - 1) / 2)],
    ]) {
      const aUv = applyTransform(aTransform, tileUvAtPixel(aRect, x, y));
      const bUv = applyTransform(bTransform, tileUvAtPixel(bRect, x, y));
      close(aUv[0], bUv[0], 'Same global pixel must share atlas U across a seam');
      close(aUv[1], bUv[1], 'Same global pixel must share atlas V across a seam');
      close(aUv[0], (x + 0.5 - source.x) / source.width, 'Cropped atlas U');
      close(aUv[1], 1 - (y + 0.5 - source.y) / source.height, 'Cropped atlas V');
      pixelChecks++;
    }
  }
  assert.ok(verticalOverlaps > 0, 'Do not silently skip vertical seams as the old image comparison did');
  assert.ok(horizontalOverlaps > 0, 'Horizontal seams must also be exercised');
  assert.ok(pixelChecks > 100, 'Exercise every neighboring tile, including partial outer tiles');
});

test('tile-to-atlas transform agrees with real off-axis camera projection after refraction exit shifts', () => {
  const height = 8129, width = 4573;
  // The virtual full viewport is wider than Story, matching Studio's centre crop.
  const fullWidth = height * 16 / 9;
  const cropX = (fullWidth - width) / 2;
  const atlasRect = { x: 499, y: 851, width: 3571, height: 6427 };
  const base = new THREE.PerspectiveCamera(37, fullWidth / height, 0.001, 20);
  base.zoom = 1.17;
  base.position.set(0.12, 0.04, 0.8);
  base.lookAt(0, 0.01, 0);
  base.updateProjectionMatrix();
  base.updateMatrixWorld();
  const atlasCamera = base.clone();
  atlasCamera.setViewOffset(fullWidth, height,
    cropX + atlasRect.x, atlasRect.y, atlasRect.width, atlasRect.height);
  atlasCamera.updateMatrixWorld();

  for (const tile of createMockupTiles(width, height)) {
    const tileRect = rect(tile);
    const tileCamera = base.clone();
    tileCamera.setViewOffset(fullWidth, height,
      cropX + tileRect.x, tileRect.y, tileRect.width, tileRect.height);
    tileCamera.updateMatrixWorld();
    const transform = exportRefractionUvTransform(atlasRect, tileRect, height);
    for (const [x, y] of [[tileRect.x + 0.5, tileRect.y + 0.5],
      [tileRect.x + tileRect.width * 0.6, tileRect.y + tileRect.height * 0.4]]) {
      // Use world-space exit points, including points shifted outside the tile:
      // refraction must sample neighboring atlas data instead of clamping locally.
      const world = new THREE.Vector3(
        ((cropX + x) / fullWidth) * 2 - 1, 1 - (y / height) * 2, 0.2,
      ).unproject(base).add(new THREE.Vector3(0.013, -0.007, 0.009));
      const tileProjected = world.clone().project(tileCamera);
      const atlasProjected = world.clone().project(atlasCamera);
      const transformed = applyTransform(transform,
        [tileProjected.x * 0.5 + 0.5, tileProjected.y * 0.5 + 0.5]);
      close(transformed[0], atlasProjected.x * 0.5 + 0.5, 'Projected world exit atlas U');
      close(transformed[1], atlasProjected.y * 0.5 + 0.5, 'Projected world exit atlas V');
    }
  }
});

for (const expandOriginalChunk of [false, true]) {
  test(`export session preserves native material hooks and restores them (${expandOriginalChunk ? 'custom expanded shader' : 'native shader include'})`, () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshPhysicalMaterial({ transmission: 1 });
    const geometry = new THREE.BoxGeometry();
    const opaque = new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, opaque));
    const nativeTexture = new THREE.Texture();
    const atlas = new THREE.Texture();
    const marker = { value: 'existing product shader uniforms' };
    const renderer = {};
    let callbackCalls = 0;
    const originalCompile = function (shader, actualRenderer) {
      assert.equal(this, material, 'Preserve the hook receiver');
      assert.equal(actualRenderer, renderer, 'Pass through the renderer argument');
      callbackCalls++;
      shader.uniforms.existingProductUniform = marker;
      if (expandOriginalChunk) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_pars_fragment>', THREE.ShaderChunk.transmission_pars_fragment);
    };
    const originalKey = function () { return `authored-product:${this.transmission}`; };
    material.onBeforeCompile = originalCompile;
    material.customProgramCacheKey = originalKey;
    const opaqueCompile = opaque.onBeforeCompile;
    const opaqueKey = opaque.customProgramCacheKey;
    const session = createExportRefractionSession(scene);
    assert.equal(session.materialCount, 1, 'Shared transmissive materials are wrapped exactly once');
    assert.equal(session.getNativeSource(), null, 'A source is unavailable until the native shader uniforms exist');
    assert.equal(opaque.onBeforeCompile, opaqueCompile, 'Opaque materials keep their authored hooks');
    assert.equal(opaque.customProgramCacheKey, opaqueKey);
    assert.notEqual(material.customProgramCacheKey(), originalKey.call(material), 'Atlas shader needs its own cache variant');
    assert.ok(material.customProgramCacheKey().includes(originalKey.call(material)), 'Retain the authored cache discriminator');

    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    shader.uniforms.transmissionSamplerMap.value = nativeTexture;
    shader.uniforms.transmissionSamplerSize.value = new THREE.Vector2(1501, 1536);
    material.onBeforeCompile(shader, renderer);
    assert.equal(callbackCalls, 1);
    assert.equal(shader.uniforms.existingProductUniform, marker, 'Keep existing uniform object identity');
    assert.equal(shader.uniforms.mockupExportRefractionEnabled.value, 0, 'Preview/native pass must initially remain native');
    assert.deepEqual(session.getNativeSource(), { texture: nativeTexture, width: 1501, height: 1536 });

    const sourceRect = { x: 527, y: 719, width: 3181, height: 6553 };
    const tileRect = { x: 1344, y: 4160, width: 1536, height: 1536 };
    session.bindAtlas(atlas, sourceRect.width, sourceRect.height, sourceRect, 8129);
    session.setTile(tileRect);
    assert.equal(shader.uniforms.mockupExportRefractionEnabled.value, 1);
    assert.equal(shader.uniforms.mockupExportRefractionMap.value, atlas);
    assert.deepEqual(shader.uniforms.mockupExportRefractionSize.value.toArray(), [3181, 6553]);
    assert.equal(shader.uniforms.mockupExportRefractionLodWidth.value, sourceRect.width,
      'An uncropped reference defaults to the native atlas width');
    assert.deepEqual(shader.uniforms.mockupExportRefractionRegion.value.toArray(),
      exportRefractionUvTransform(sourceRect, tileRect, 8129));
    assert.equal(shader.uniforms.transmissionSamplerMap.value, nativeTexture,
      'Use a separate atlas sampler instead of overwriting Three’s native texture');
    const uniformIdentity = shader.uniforms.mockupExportRefractionRegion;
    session.setTile({ x: 2752, y: 5568, width: 1536, height: 1536 });
    assert.equal(shader.uniforms.mockupExportRefractionRegion, uniformIdentity,
      'Existing compiled programs must see tile updates without recompilation');
    session.bindAtlas(atlas, sourceRect.width, sourceRect.height, sourceRect, 8129, 4573);
    assert.equal(shader.uniforms.mockupExportRefractionLodWidth.value, 4573,
      'Cropping optical storage must retain the full Story image roughness footprint');
    for (const invalidWidth of [0, -1, NaN, Infinity]) {
      assert.throws(() => session.bindAtlas(atlas, sourceRect.width, sourceRect.height,
        sourceRect, 8129, invalidWidth), RangeError);
      assert.equal(shader.uniforms.mockupExportRefractionLodWidth.value, 4573,
        'Reject an invalid roughness reference without changing an existing binding');
    }
    session.disable();
    assert.equal(shader.uniforms.mockupExportRefractionEnabled.value, 0, 'Native passes can be restored between tiles');
    session.dispose();
    session.dispose();
    assert.equal(material.onBeforeCompile, originalCompile, 'Restore exact authored callback identity');
    assert.equal(material.customProgramCacheKey, originalKey, 'Restore exact authored cache hook identity');
    geometry.dispose(); material.dispose(); opaque.dispose(); nativeTexture.dispose(); atlas.dispose();
  });
}

test('a repeated export updates an already cached shader without requiring onBeforeCompile again', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  scene.add(new THREE.Mesh(geometry, material));
  const originalCompile = material.onBeforeCompile;
  const originalKey = material.customProgramCacheKey;
  const nativeTexture = new THREE.Texture();
  const firstAtlas = new THREE.Texture();
  const secondAtlas = new THREE.Texture();
  let atlasDisposals = 0;
  firstAtlas.addEventListener('dispose', () => { atlasDisposals++; });
  secondAtlas.addEventListener('dispose', () => { atlasDisposals++; });
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  shader.uniforms.transmissionSamplerMap.value = nativeTexture;
  shader.uniforms.transmissionSamplerSize.value = new THREE.Vector2(1536, 1536);
  const source = { x: 473, y: 651, width: 3517, height: 6721 };
  const firstSession = createExportRefractionSession(scene);
  material.onBeforeCompile(shader, {});
  firstSession.bindAtlas(firstAtlas, source.width, source.height, source, 8129);
  firstSession.setTile({ x: 0, y: 0, width: 1472, height: 1472 });
  const cachedMapUniform = shader.uniforms.mockupExportRefractionMap;
  const cachedRegionUniform = shader.uniforms.mockupExportRefractionRegion;
  firstSession.dispose();
  assert.equal(cachedMapUniform.value, null, 'The cached program must not retain a completed export atlas');
  assert.equal(shader.uniforms.mockupExportRefractionEnabled.value, 0);
  assert.equal(material.onBeforeCompile, originalCompile);
  assert.equal(material.customProgramCacheKey, originalKey);

  const secondSession = createExportRefractionSession(scene);
  // Three can reuse the compiled export program here. Deliberately DO NOT call
  // onBeforeCompile: the renderer only repopulates its existing native uniforms.
  shader.uniforms.transmissionSamplerMap.value = nativeTexture;
  shader.uniforms.transmissionSamplerSize.value.set(1457, 1299);
  assert.deepEqual(secondSession.getNativeSource(), { texture: nativeTexture, width: 1457, height: 1299 });
  const secondTile = { x: 2752, y: 5568, width: 1536, height: 1536 };
  secondSession.bindAtlas(secondAtlas, source.width, source.height, source, 8129, 4573);
  secondSession.setTile(secondTile);
  assert.equal(shader.uniforms.mockupExportRefractionMap, cachedMapUniform);
  assert.equal(cachedMapUniform.value, secondAtlas, 'The reused GPU program must read this export’s atlas');
  assert.equal(shader.uniforms.mockupExportRefractionRegion, cachedRegionUniform);
  assert.deepEqual(cachedRegionUniform.value.toArray(), exportRefractionUvTransform(source, secondTile, 8129));
  assert.equal(shader.uniforms.mockupExportRefractionEnabled.value, 1);
  assert.equal(shader.uniforms.mockupExportRefractionLodWidth.value, 4573,
    'Cached programs must also receive this export’s full-frame roughness reference');
  secondSession.dispose();
  assert.equal(cachedMapUniform.value, null, 'Release the second atlas reference as well');
  assert.equal(secondSession.getNativeSource(), null);
  assert.equal(atlasDisposals, 0, 'The caller retains ownership of atlas GPU disposal');
  geometry.dispose(); material.dispose(); nativeTexture.dispose(); firstAtlas.dispose(); secondAtlas.dispose();
});
