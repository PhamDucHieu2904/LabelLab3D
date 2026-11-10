import * as THREE from 'three';

const COLLAR_MIN_Y = 1.8411;
const COLLAR_MAX_Y = 1.8642;
const PREPARED = 'petRingGeometryPrepared';

export type PetRingPreparation = {
  prepared: boolean;
  ringTriangles: number;
  bodyTriangles: number;
};

type PetAsset = { id: string; packaging?: string };

/**
 * The short 1 L export predates the semantic Ring material. Its neck collar is
 * still authored in the Body primitive, so split only complete collar
 * triangles into a second material group. Positions, normals, UVs and winding
 * remain shared with the imported geometry; only the index buffer is partitioned.
 */
export function preparePetRingGeometry(root: THREE.Object3D, asset: PetAsset): PetRingPreparation {
  if (asset.id !== 'pet-1000-short-juice' || asset.packaging !== 'pet') {
    return { prepared: false, ringTriangles: 0, bodyTriangles: 0 };
  }

  let result: PetRingPreparation = { prepared: false, ringTriangles: 0, bodyTriangles: 0 };
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData[PREPARED] === true) {
      result = {
        prepared: false,
        bodyTriangles: (node.geometry.groups[0]?.count ?? 0) / 3,
        ringTriangles: (node.geometry.groups[1]?.count ?? 0) / 3,
      };
      return;
    }
    const sourceMaterial = !Array.isArray(node.material) && node.material.name === 'Body' ? node.material : undefined;
    if (!sourceMaterial || !(sourceMaterial instanceof THREE.MeshStandardMaterial)) return;
    const position = node.geometry.getAttribute('position');
    const sourceIndex = node.geometry.index;
    if (!position || !sourceIndex || sourceIndex.count % 3 !== 0) return;

    const bodyIndices: number[] = [];
    const ringIndices: number[] = [];
    const y = (vertex: number) => position.getY(vertex);
    for (let offset = 0; offset < sourceIndex.count; offset += 3) {
      const a = sourceIndex.getX(offset), b = sourceIndex.getX(offset + 1), c = sourceIndex.getX(offset + 2);
      const isRing = [a, b, c].every(vertex => {
        const value = y(vertex);
        return value >= COLLAR_MIN_Y && value <= COLLAR_MAX_Y;
      });
      const target = isRing ? ringIndices : bodyIndices;
      target.push(a, b, c);
    }
    if (!ringIndices.length || !bodyIndices.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.name = node.geometry.name;
    geometry.userData = { ...node.geometry.userData };
    geometry.boundingBox = node.geometry.boundingBox?.clone() ?? null;
    geometry.boundingSphere = node.geometry.boundingSphere?.clone() ?? null;
    for (const name of Object.keys(node.geometry.attributes)) geometry.setAttribute(name, node.geometry.getAttribute(name));
    geometry.setIndex(bodyIndices.concat(ringIndices));
    geometry.clearGroups();
    geometry.addGroup(0, bodyIndices.length, 0);
    geometry.addGroup(bodyIndices.length, ringIndices.length, 1);
    geometry.setDrawRange(node.geometry.drawRange.start, node.geometry.drawRange.count);

    const ringMaterial = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(ringMaterial, sourceMaterial);
    (ringMaterial as THREE.MeshPhysicalMaterial & { defines: Record<string, string> }).defines = { STANDARD: '', PHYSICAL: '' };
    ringMaterial.name = 'Ring';
    ringMaterial.userData = {
      ...sourceMaterial.userData,
      juiceRing: true,
      bottleProfile: sourceMaterial.userData.bottleProfile ?? 'juice-pet-v1',
    };
    node.geometry = geometry;
    node.material = [sourceMaterial, ringMaterial];
    node.userData[PREPARED] = true;
    result = { prepared: true, bodyTriangles: bodyIndices.length / 3, ringTriangles: ringIndices.length / 3 };
  });
  return result;
}
