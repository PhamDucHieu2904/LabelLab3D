export type ArtworkDieline = { width: number; height: number; unit?: 'mm'; guideSrc?: string };
export type ArtworkTransform = { x: number; y: number; width: number; height: number };
export type ArtworkHandle = 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
/**
 * Rectangular print areas supplied by the product dielines (width × height,
 * in millimetres). The model id is the stable catalog id, so artwork keeps
 * the same frame when a user switches between tools or reloads the studio.
 */
export const ARTWORK_DIELINES: Readonly<Partial<Record<string, ArtworkDieline>>> = {
  // Cans
  'can-180': { width: 170, height: 107, unit: 'mm' },
  'can-250-short': { width: 216, height: 90, unit: 'mm' },
  'can-250-slim': { width: 177, height: 131, unit: 'mm' },
  'can-320': { width: 192, height: 143, unit: 'mm' },
  'can-mango': { width: 216, height: 114, unit: 'mm' },
  'can-500': { width: 216, height: 166, unit: 'mm' },

  // PET bottles
  'pet-320-full-nata': { width: 206, height: 125, unit: 'mm' },
  'pet-nata-watermelon': { width: 195, height: 50, unit: 'mm' },
  'pet-aloe': { width: 220, height: 77, unit: 'mm' },
  'pet-1000-juice': { width: 268, height: 217, unit: 'mm' },
  'pet-1000-short-juice': { width: 296, height: 190, unit: 'mm' },
  'pet-1500-juice': { width: 296, height: 257, unit: 'mm' },
  'pet-325-juice': { width: 192, height: 158, unit: 'mm' },
  'pet-330-energy': { width: 183, height: 77, unit: 'mm' },
  'pet-350-juice': { width: 206, height: 132, unit: 'mm' },

  // Glass bottles with rectangular label areas
  'glass-300-milk': { width: 193, height: 84, unit: 'mm' },
  'glass-280-latte': { width: 211, height: 156, unit: 'mm' },
  'glass-280-short-latte': { width: 211, height: 143, unit: 'mm' },

  // Special glass shapes keep the rectangular print frame and add the
  // supplied magenta dieline as a non-exported alignment guide.
  'basil-strawberry': { width: 164, height: 108, unit: 'mm', guideSrc: '/assets/dielines/glass-290-screwcap.svg' },
  'glass-290-chia': { width: 164, height: 108, unit: 'mm', guideSrc: '/assets/dielines/glass-290-screwcap.svg' },
  'glass-290-milk': { width: 164, height: 108, unit: 'mm', guideSrc: '/assets/dielines/glass-290-screwcap.svg' },
  'glass-290-pullcap-basil': { width: 169, height: 97.5, unit: 'mm', guideSrc: '/assets/dielines/glass-290-pullcap.svg' },
  'glass-290-pullcap-chia': { width: 169, height: 97.5, unit: 'mm', guideSrc: '/assets/dielines/glass-290-pullcap.svg' },
  'glass-290-pullcap-milk': { width: 169, height: 97.5, unit: 'mm', guideSrc: '/assets/dielines/glass-290-pullcap.svg' },
  'glass-485-milk': { width: 166, height: 83, unit: 'mm', guideSrc: '/assets/dielines/glass-485.svg' },

  // PP bottles
  'pp-500': { width: 210, height: 185, unit: 'mm' },
  'pp-1000': { width: 300, height: 182, unit: 'mm' },
  'pp-1000-2': { width: 272, height: 237, unit: 'mm' },
  'pp-1250': { width: 300, height: 227, unit: 'mm' },
  'pp-2000': { width: 356, height: 242, unit: 'mm' },
};

/** Dielines recorded for models that are not in the catalog yet. */
export const PENDING_ARTWORK_DIELINES: Readonly<Partial<Record<string, ArtworkDieline>>> = {
  'pet-500-full-label': { width: 220, height: 153, unit: 'mm' },
  'pet-1500-short-label': { width: 296, height: 97, unit: 'mm' },
};

const MIN = 0.01;
const finite=(v:number,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function getArtworkDieline(modelId:string):ArtworkDieline { const d=ARTWORK_DIELINES[modelId]; return d ? {...d} : {width:3,height:2}; }
export function normalizeArtworkTransform(t:ArtworkTransform):ArtworkTransform { return {x:clamp(finite(t.x),-100,100),y:clamp(finite(t.y),-100,100),width:clamp(finite(t.width,1),MIN,100),height:clamp(finite(t.height,1),MIN,100)}; }
export function validArtworkTransform(v:unknown):v is ArtworkTransform { if(!v||typeof v!=='object') return false; const t=v as ArtworkTransform; return [t.x,t.y,t.width,t.height].every(Number.isFinite) && t.width>=MIN && t.height>=MIN; }
export function fitArtwork(imageWidth:number,imageHeight:number,dieline:ArtworkDieline,mode:'contain'|'cover'='contain'):ArtworkTransform {
 const iw=Math.max(finite(imageWidth,1),MIN), ih=Math.max(finite(imageHeight,1),MIN), fw=Math.max(finite(dieline.width,3),MIN), fh=Math.max(finite(dieline.height,2),MIN);
 const imageAspect=iw/ih, frameAspect=fw/fh; let width=1,height=1;
 if(mode==='contain'){ if(imageAspect>frameAspect) height=frameAspect/imageAspect; else width=imageAspect/frameAspect; }
 else { if(imageAspect>frameAspect) width=imageAspect/frameAspect; else height=frameAspect/imageAspect; }
 return {x:(1-width)/2,y:(1-height)/2,width,height};
}
export function panArtwork(start:ArtworkTransform,dx:number,dy:number):ArtworkTransform { const s=normalizeArtworkTransform(start); return normalizeArtworkTransform({...s,x:s.x+finite(dx),y:s.y+finite(dy)}); }
export function resizeArtwork(start:ArtworkTransform,handle:ArtworkHandle,dx:number,dy:number,lockRatio=false):ArtworkTransform {
 const s=normalizeArtworkTransform(start), x2=s.x+s.width,y2=s.y+s.height; let left=s.x,right=x2,top=s.y,bottom=y2;
 const ddx=finite(dx),ddy=finite(dy); const west=handle.includes('w'), east=handle.includes('e'), north=handle.includes('n'), south=handle.includes('s');
 if(east) right+=ddx; if(west) left+=ddx; if(south) bottom+=ddy; if(north) top+=ddy;
 if(lockRatio){ const scaleW=ddx*(west?-1:east?1:0)/s.width, scaleH=ddy*(north?-1:south?1:0)/s.height; const change=(east||west) && (!(south||north) || Math.abs(scaleW)>=Math.abs(scaleH)) ? scaleW : scaleH; const scale=Math.max(MIN/s.width,Math.min(100/s.width,Math.max(MIN/s.height,Math.min(100/s.height,1+change)))); const w=s.width*scale,h=s.height*scale; if(west) left=right-w; else if(east) right=left+w; else {const cx=(left+right)/2;left=cx-w/2;right=cx+w/2;} if(north) top=bottom-h; else if(south) bottom=top+h; else {const cy=(top+bottom)/2;top=cy-h/2;bottom=cy+h/2;} }
 if(right-left<MIN){ if(west) left=right-MIN; else right=left+MIN; } if(bottom-top<MIN){ if(north) top=bottom-MIN; else bottom=top+MIN; }
 return normalizeArtworkTransform({x:left,y:top,width:right-left,height:bottom-top});
}



