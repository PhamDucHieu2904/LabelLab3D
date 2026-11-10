const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const { parseGlb } = require('../lib/bottle-compression.cjs');
const { decodeDracoPrimitives } = require('../lib/draco-bottle-compression.cjs');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();

test('300 ml glass retains its Base and Body geometry with Milk and authored Neck tracing', () => {
  const { basilWebMaterialRole, createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials'));
  const { configureBottleRenderOrder } = load(path.resolve(__dirname, '../../lib/viewer/bottle-materials'));
  const root = new THREE.Group(), meshes = {};
  const asset = { id: 'glass-300-milk', packaging: 'glass', materialSlots: {
    body: ['Base', 'Body', 'Neck'], cap: ['Cap'], label: ['Label'], liquid: ['Water'],
  } };
  for (const name of ['Base', 'Body', 'Neck', 'Cap', 'Label', 'Water']) {
    const material = new THREE.MeshPhysicalMaterial(); material.name = name;
    material.userData = { bottleProfile: 'glass-300-v1', ...(name === 'Water' ? { bottleLiquidKind: 'milk' } : {}),
      ...(name === 'Neck' ? { basilWebNeckWallMetres: .0017 } : {}) };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .12, 16), material);
    mesh.name = name; root.add(mesh); meshes[name] = mesh;
  }
  const geometry = meshes.Body.geometry, baseGeometry = meshes.Base.geometry;
  const context = createBasilWebBottleMaterialContext(root, asset); assert.ok(context);
  for (const mesh of Object.values(meshes)) {
    const role = basilWebMaterialRole(asset, mesh, mesh.material); assert.ok(role, mesh.name);
    context.configure(mesh.material, mesh, role, '#fff5e4');
  }
  configureBottleRenderOrder(root, asset);
  assert.equal(meshes.Body.geometry, geometry); assert.equal(meshes.Base.geometry, baseGeometry);
  assert.equal(meshes.Base.material.ior, 1.52);
  assert.equal(meshes.Body.material.customProgramCacheKey(), 'basil-web-polished-shell-v1');
  assert.equal(meshes.Neck.material.customProgramCacheKey(), 'pullcap-hollow-glass-neck-v1');
  assert.equal(meshes.Neck.material.thickness, .0034, 'preserve authored wall thickness rather than assume the 290 ml wall');
  assert.equal(meshes.Water.material.customProgramCacheKey(), 'basil-web-milk-reservoir-v2');
  assert.equal(meshes.Water.material.color.getHexString(), 'fff5e4');
  assert.equal(meshes.Water.renderOrder, 0);
  assert.equal(root.children.length, 6, 'molded bumps never generate Basil seed layers');
  context.dispose?.();
  root.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
});

test('300 ml milk presents the nearest outward surface from above and in front', async () => {
  const { createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials'));
  const bytes = fs.readFileSync(path.resolve(__dirname, '../../public/models/bottles/glass-300-milk.glb'));
  const { document } = parseGlb(bytes);
  const node = document.nodes.find(node => node.name === 'Water');
  const primitive = (await decodeDracoPrimitives(bytes)).find(part => part.mi === node.mesh);
  const geometry = new THREE.BufferGeometry();
  for (const [semantic, name, size] of [['POSITION', 'position', 3], ['NORMAL', 'normal', 3], ['TEXCOORD_0', 'uv', 2]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(primitive.attributes[semantic], size));
  }
  geometry.setIndex(new THREE.BufferAttribute(primitive.indices, 1));
  const material = new THREE.MeshPhysicalMaterial(); material.name = 'Water';
  material.userData = { bottleProfile: 'glass-300-v1', bottleLiquidKind: 'milk' };
  const water = new THREE.Mesh(geometry, material); water.name = 'Water';
  water.position.fromArray(node.translation); water.scale.fromArray(node.scale);
  const root = new THREE.Group(); root.scale.setScalar(.1); root.add(water);
  const context = createBasilWebBottleMaterialContext(root, { packaging: 'glass', materialSlots: { liquid: ['Water'] } });
  context.configure(material, water, 'liquid', '#fff5e4');
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(water), center = bounds.getCenter(new THREE.Vector3());
  try {
    // The authored closed liquid has an outward top near 150 mm and bottom
    // near 3 mm. Culling the front face incorrectly makes this ray see its base.
    const top = new THREE.Raycaster(new THREE.Vector3(center.x, bounds.max.y + .1, center.z), new THREE.Vector3(0, -1, 0)).intersectObject(water)[0];
    assert.ok(top, 'the closed milk surface must be visible from above');
    assert.ok(top.point.y > .149, `expected the upper surface, received y=${top.point.y}`);
    const front = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, bounds.max.z + .1), new THREE.Vector3(0, 0, -1)).intersectObject(water)[0];
    assert.ok(front?.point.z > .02, 'opaque milk must shade the near wall rather than the far interior wall');
    // Transparent Basil still needs its existing far-water absorption reservoir.
    material.userData.bottleLiquidKind = 'basil';
    context.configure(material, water, 'liquid', '#f14e78');
    const basil = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, bounds.max.z + .1), new THREE.Vector3(0, 0, -1)).intersectObject(water)[0];
    assert.ok(basil?.point.z < -.02, 'Basil must retain its far-water reservoir');
  } finally {
    context.dispose?.(); geometry.dispose(); material.dispose();
  }
});


test('glass-300 Base integrates through canonical GLTF scale without changing Body geometry',()=>{
 const { createBasilWebBottleMaterialContext } = load(path.resolve(__dirname,'../../lib/viewer/basil-web-materials.ts'));
 const root=new THREE.Group(); const child=new THREE.Group(); child.scale.setScalar(.1); root.add(child);
 const baseGeometry=new THREE.BoxGeometry(.2,.0486,.2), bodyGeometry=new THREE.BoxGeometry(.6,1.5,.6),waterGeometry=new THREE.CylinderGeometry(.28,.28,1.4,16);
 const baseMaterial=new THREE.MeshPhysicalMaterial(); baseMaterial.name='Base'; baseMaterial.userData={bottleProfile:'glass-300-v1'};
 const bodyMaterial=new THREE.MeshPhysicalMaterial(); bodyMaterial.name='Body'; bodyMaterial.userData={bottleProfile:'glass-300-v1'};
 const waterMaterial=new THREE.MeshPhysicalMaterial(); waterMaterial.name='Water'; waterMaterial.userData={bottleProfile:'glass-300-v1',bottleLiquidKind:'milk'};
 const base=new THREE.Mesh(baseGeometry,baseMaterial);base.name='Base';base.position.y=.03; child.add(base);
 const body=new THREE.Mesh(bodyGeometry,bodyMaterial);body.name='Body';body.position.y=.95;child.add(body);
 const water=new THREE.Mesh(waterGeometry,waterMaterial);water.name='Water';water.position.y=.95;child.add(water);
 root.updateMatrixWorld(true);
 const bodyBefore=body.geometry;
 const context=createBasilWebBottleMaterialContext(root,{packaging:'glass',materialSlots:{body:['Base','Body'],liquid:['Water']}});
 assert.ok(context); context.configure(baseMaterial,base,'body'); context.configure(bodyMaterial,body,'body');
 assert.ok(baseMaterial.thickness>.00485&&baseMaterial.thickness<.00487); assert.equal(body.geometry,bodyBefore); assert.equal(bodyMaterial.customProgramCacheKey(),'basil-web-polished-shell-v1');
 context.dispose?.();baseGeometry.dispose();bodyGeometry.dispose();waterGeometry.dispose();baseMaterial.dispose();bodyMaterial.dispose();waterMaterial.dispose();
});
