const THREE = require('three');

/** Fits one oriented bounding ellipsoid per connected seed island. */
function fitSeedMesh(position, indices, matrix = new THREE.Matrix4()) {
  const points = Array.from({length: position.length / 3}, (_, i) => new THREE.Vector3(position[i*3], position[i*3+1], position[i*3+2]).applyMatrix4(matrix));
  const parent = points.map((_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a,b) => { a=root(a); b=root(b); if (a!==b) parent[b]=a; };
  for (let i=0;i<indices.length;i+=3) { join(indices[i],indices[i+1]); join(indices[i],indices[i+2]); }
  const groups = new Map(); for (const id of indices) { const r=root(id); if (!groups.has(r)) groups.set(r, new Set()); groups.get(r).add(id); }
  const fits=[];
  for (const ids of groups.values()) {
    const vs=[...ids].map(i=>points[i]); if (vs.length<4) continue;
    const c=new THREE.Vector3(); vs.forEach(v=>c.add(v)); c.multiplyScalar(1/vs.length);
    const a=Array.from({length:3},()=>Array(3).fill(0));
    vs.forEach(v=>{const d=v.clone().sub(c);for(let i=0;i<3;i++)for(let j=0;j<3;j++)a[i][j]+=d.getComponent(i)*d.getComponent(j);});
    let b=Array.from({length:3},(_,i)=>[i===0?1:0,i===1?1:0,i===2?1:0]);
    for(let it=0;it<32;it++){let p=0,r=1,max=Math.abs(a[0][1]);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(a[i][j])>max){max=Math.abs(a[i][j]);p=i;r=j;}if(max<1e-14)break;const t=.5*Math.atan2(2*a[p][r],a[r][r]-a[p][p]),co=Math.cos(t),si=Math.sin(t),app=a[p][p],arr=a[r][r],apr=a[p][r];a[p][p]=co*co*app-2*co*si*apr+si*si*arr;a[r][r]=si*si*app+2*co*si*apr+co*co*arr;a[p][r]=a[r][p]=0;for(let k=0;k<3;k++)if(k!==p&&k!==r){const kp=a[k][p],kr=a[k][r];a[k][p]=a[p][k]=co*kp-si*kr;a[k][r]=a[r][k]=si*kp+co*kr;}for(let k=0;k<3;k++){const bp=b[k][p],br=b[k][r];b[k][p]=co*bp-si*br;b[k][r]=si*bp+co*br;}}
    const axes=[0,1,2].map(i=>new THREE.Vector3(b[0][i],b[1][i],b[2][i]).normalize()); let lo=new THREE.Vector3(Infinity,Infinity,Infinity),hi=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    vs.forEach(v=>{const d=v.clone().sub(c),u=new THREE.Vector3(axes[0].dot(d),axes[1].dot(d),axes[2].dot(d));lo.min(u);hi.max(u);}); const off=lo.clone().add(hi).multiplyScalar(.5); c.addScaledVector(axes[0],off.x).addScaledVector(axes[1],off.y).addScaledVector(axes[2],off.z); const radii=hi.clone().sub(lo).multiplyScalar(.5);
    const inv=axes.map((axis,i)=>axis.clone().multiplyScalar(1/Math.max(radii.getComponent(i),1e-9))); let residual=0; vs.forEach(v=>{const d=v.clone().sub(c),u=new THREE.Vector3(inv[0].dot(d),inv[1].dot(d),inv[2].dot(d)); residual=Math.max(residual,Math.abs(1-1/u.length())*d.length());});
    fits.push({center:c.toArray(),inverseX:inv[0].toArray(),inverseY:inv[1].toArray(),inverseZ:inv[2].toArray(),maxRadialError:residual});
  }
  return fits.sort((a,b)=>a.center[1]-b.center[1]);
}
module.exports={fitSeedMesh};
