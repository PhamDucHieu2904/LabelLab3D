import type { LabModel } from './catalog';
import type { MaterialPreferences } from './preferences';
import pet1500 from '../../public/models/bottles/pet-1500-juice.manifest.json';
import pet325 from '../../public/models/bottles/pet-325-juice.manifest.json';
import pet1000Short from '../../public/models/bottles/pet-1000-short-juice.manifest.json';
import pp1250 from '../../public/models/bottles/pp-1250.manifest.json';
import pp1000 from '../../public/models/bottles/pp-1000.manifest.json';
import pp2000 from '../../public/models/bottles/pp-2000.manifest.json';
import pp1000Variant2 from '../../public/models/bottles/pp-1000-2.manifest.json';
import pp500 from '../../public/models/bottles/pp-500.manifest.json';
import pp500Variant2 from '../../public/models/bottles/pp-500-2.manifest.json';

const definitions = [
  { manifest: pet1500, name: '1.5 L Bottle', volume: '1.5 L', packaging: 'pet' },
  { manifest: pet325, name: '325 ml Bottle', volume: '325 ml', packaging: 'pet' },
  { manifest: pet1000Short, name: '1 L Bottle · Short label', volume: '1 L', packaging: 'pet' },
  { manifest: pp1250, name: '1.25 L PP Bottle', volume: '1.25 L', packaging: 'pp' },
  { manifest: pp1000, name: '1 L PP Bottle', volume: '1 L', packaging: 'pp' },
  { manifest: pp2000, name: '2 L PP Bottle', volume: '2 L', packaging: 'pp' },
  { manifest: pp1000Variant2, name: '1 L PP Bottle · Variant 2', volume: '1 L', packaging: 'pp' },
  { manifest: pp500, name: '500 ml PP Bottle', volume: '500 ml', packaging: 'pp' },
  { manifest: pp500Variant2, name: '500 ml PP Bottle · Variant 2', volume: '500 ml', packaging: 'pp' },
] as const;

/** Shared native defaults keep reset and preference migration consistent for this batch. */
export const BATCH_MATERIAL_DEFAULTS: Record<string, Partial<MaterialPreferences>> = Object.fromEntries(definitions.map(({manifest,packaging})=>[manifest.id,{
  liquidType: 'fruit-juice', liquidCustomized: packaging === 'pet',
  liquidColor: packaging === 'pet' ? '#E8B64F' : '#ffffff', liquidSparkling: 0,
  capColor: '#ffffff', capMetalness: 0, capRoughness: .29,
  bodyMetalness: 0, bodyRoughness: packaging === 'pp' ? .3 : .075,
  labelOffset: 0, roughness: .28, metalness: 0,
}]));

export const BATCH_MODELS: LabModel[] = definitions.map(({manifest,name,volume,packaging})=>{
  const poster = `/models/bottles/${manifest.id}-poster.webp?v=${manifest.sha256.slice(0,12)}`;
  const slots: Record<string,string[]> = manifest.materialSlots;
  return {
    id: manifest.id, name, volume, category: packaging,
    description: `${manifest.volumeMl} ml ${packaging.toUpperCase()} bottle · ${packaging === 'pp' ? 'Opaque white' : 'Juice'} · ready for artwork.`,
    poster,
    asset: {
      id: manifest.id, name, src: `${manifest.src}?v=${manifest.sha256.slice(0,12)}`,
      volumeMl: manifest.volumeMl, packaging, poster,
      // This source collar is partitioned into Ring at runtime before binding.
      materialSlots: manifest.id === 'pet-1000-short-juice' ? {...slots,ring:['Ring']} : slots,
      textureSamplers: {label:{wrapS:'repeat',wrapT:'clamp'}}, orientation:[0,0,0], cameraFraming:'bounds',
    },
    appearance: {
      // Ring retains its calibrated native finish; it has no required user override.
      id: `${manifest.id}:blank`, requiredSlots:Object.keys(slots).filter(slot => slot !== 'ring'),
      slots: {
        body:{color:'#ffffff',metalness:0,roughness:packaging==='pp'?.3:.075},
        cap:{color:'#ffffff',metalness:0,roughness:.29},
        label:{color:'#ffffff',metalness:0,roughness:.28},
        ...(slots.liquid ? {liquid:{color:'#E8B64F',metalness:0,roughness:.12,transmission:.35,thickness:.025,ior:1.35}} : {}),
      },
    },
    frontYaw:0,
  };
});
