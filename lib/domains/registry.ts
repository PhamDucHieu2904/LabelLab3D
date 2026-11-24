export type StudioDomainId = 'beverage' | 'packaging' | 'apparel';

export interface StudioDomainMeta {
  readonly id: StudioDomainId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly available: boolean;
  readonly badge?: string;
  /** Default scene presentation when entering this domain. */
  readonly defaultSceneMode: 'website' | 'studio';
  /** Extension capability flags for the Studio shell. */
  readonly capabilities: {
    readonly parametricDimensions: boolean;
    readonly foldingKinematics: boolean;
    readonly dielineVectorExport: boolean;
    readonly multiZoneArtwork: boolean;
  };
}

export const STUDIO_DOMAINS: readonly StudioDomainMeta[] = Object.freeze([
  {
    id: 'beverage',
    label: 'Bottles & Cans',
    shortLabel: 'Bottles & Cans',
    description: 'Glass, PET, PP bottles and aluminum cans with realistic liquid optics.',
    available: true,
    defaultSceneMode: 'website',
    capabilities: {
      parametricDimensions: false,
      foldingKinematics: false,
      dielineVectorExport: false,
      multiZoneArtwork: false,
    },
  },
  {
    id: 'packaging',
    label: 'Boxes & Trays',
    shortLabel: 'Boxes & Trays',
    description: 'Parametric millimeter CAD cartons, trays, mailers, and folding dielines.',
    available: true,
    badge: 'CAD',
    defaultSceneMode: 'studio',
    capabilities: {
      parametricDimensions: true,
      foldingKinematics: true,
      dielineVectorExport: true,
      multiZoneArtwork: true,
    },
  },
  {
    id: 'apparel',
    label: 'Fashion & Apparel',
    shortLabel: 'Apparel',
    description: 'Garment mockups with fabric micro-shaders and multi-zone print placement.',
    available: false,
    badge: 'Soon',
    defaultSceneMode: 'studio',
    capabilities: {
      parametricDimensions: false,
      foldingKinematics: false,
      dielineVectorExport: false,
      multiZoneArtwork: true,
    },
  },
]);

export const STUDIO_DOMAIN_STORAGE_KEY = 'labellab.studio.domain.v1';

export function isStudioDomainId(value: unknown): value is StudioDomainId {
  return value === 'beverage' || value === 'packaging' || value === 'apparel';
}

export function getStudioDomain(id?: string | null): StudioDomainMeta {
  const found = STUDIO_DOMAINS.find((domain) => domain.id === id && domain.available);
  return found ?? STUDIO_DOMAINS[0];
}

export function loadSavedDomain(storage?: Pick<Storage, 'getItem'>): StudioDomainId {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = target?.getItem(STUDIO_DOMAIN_STORAGE_KEY);
    return getStudioDomain(raw).id;
  } catch {
    return 'beverage';
  }
}

export function saveDomain(domain: StudioDomainId, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(STUDIO_DOMAIN_STORAGE_KEY, getStudioDomain(domain).id);
    return true;
  } catch {
    return false;
  }
}
