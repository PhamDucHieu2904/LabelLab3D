import type { ArtworkDieline, ArtworkTransform } from './artwork-transform';
export async function renderArtworkCrop(source: CanvasImageSource, transform: ArtworkTransform, dieline: ArtworkDieline, maxEdge = 4096): Promise<Blob> {
 if (typeof document === 'undefined' || typeof document.createElement !== 'function') throw new Error('Canvas rendering requires a browser document');
 const edge = Math.max(1, Math.floor(Number.isFinite(maxEdge) ? maxEdge : 4096));
 const aspect = Math.max(0.0001, dieline.width / dieline.height); const width = aspect >= 1 ? edge : Math.max(1, Math.round(edge * aspect)); const height = aspect >= 1 ? Math.max(1, Math.round(edge / aspect)) : edge;
 const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height; const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas 2D context unavailable');
 ctx.fillStyle='white'; ctx.fillRect(0,0,width,height); ctx.save(); ctx.beginPath(); ctx.rect(0,0,width,height); ctx.clip();
 const sx=transform.x*width, sy=transform.y*height, sw=transform.width*width, sh=transform.height*height; ctx.drawImage(source,sx,sy,sw,sh); ctx.restore();
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Canvas export failed')),'image/png'));
}
