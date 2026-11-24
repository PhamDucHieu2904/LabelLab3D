import { GLASS_NECK_OPTICS_GLSL } from './glass-neck-optics';

// Reuse the tested stackless BVH intersection and exact dielectric Fresnel
// functions. PET owns the medium, cap response and RGBA/capture integration.
const intersections = GLASS_NECK_OPTICS_GLSL.slice(
  GLASS_NECK_OPTICS_GLSL.indexOf('struct GlassNeckHit'),
  GLASS_NECK_OPTICS_GLSL.indexOf('vec3 glassNeckLiquidCapture'),
).replaceAll('GlassNeckHit', 'PetRingHit').replaceAll('glassNeck', 'petRing');

export const PET_RING_OPTICS_GLSL = /* glsl */`
uniform highp sampler2D petRingTriangles;
uniform highp sampler2D petRingNodes;
uniform highp sampler2D petRingUvs;
uniform int petRingDataWidth;
uniform int petRingMaxBounces;
uniform float petRingEpsilon;
uniform float petRingRoughness;
uniform float petRingIor;
uniform float aloeClearRadiance;
uniform mat4 petRingToScene;
uniform mat4 petRingSceneToClip;
uniform float petRingBackgroundDistance;
uniform vec3 petRingCamera;
uniform vec3 petRingView;
uniform float petRingOrthographic;
uniform vec3 petRingCapColor;
uniform float petRingCapRoughness;
uniform float petRingCapMetalness;
varying vec3 vPetRingPosition;
varying vec3 vPetRingNormal;
${intersections}
vec2 petRingProject(vec3 point) {
  vec4 clip=petRingSceneToClip*petRingToScene*vec4(point,1.0);
  return clip.xy/max(clip.w,.000001)*.5+.5;
}
vec4 petRingReservoir(vec2 uv) {
  vec4 sampleValue=getTransmissionSample(uv,petRingRoughness,petRingIor);
  float coverage=clamp(sampleValue.a*2.0-1.0,0.0,1.0);
  vec3 radiance=max(vec3(0),sampleValue.rgb-vec3(aloeClearRadiance*(1.0-coverage)));
  return vec4(radiance,coverage);
}
vec3 petRingCap(PetRingHit hit,vec3 direction) {
  vec3 n=dot(direction,hit.normal)>0.0?-hit.normal:hit.normal;
  float cosine=clamp(-dot(direction,n),0.0,1.0);
  float f0=mix(.04,1.0,petRingCapMetalness);
  float f=f0+(1.0-f0)*pow(1.0-cosine,5.0);
  return petRingCapColor*(petRingEnvironment(n,1.0)*(1.0-petRingCapMetalness)*(1.0-f)
    +petRingEnvironment(reflect(direction,n),petRingCapRoughness)*f);
}
vec4 petRingEscape(vec3 origin,vec3 direction) {
  vec3 worldDirection=normalize(mat3(petRingToScene)*direction);
  vec3 worldPoint=(petRingToScene*vec4(origin,1.0)).xyz+worldDirection*petRingBackgroundDistance;
  vec4 clip=petRingSceneToClip*vec4(worldPoint,1.0);
  vec2 uv=clip.xy/max(clip.w,.000001)*.5+.5;
  // The opaque reservoir supplies water; the separately composited Studio
  // matte supplies uncovered rays at their actual refracted exit direction.
  vec4 rear=petRingReservoir(uv);
  if(bottleBackdropEnabled>.5)return vec4(rear.rgb+(1.0-rear.a)*bottleBackdropAt(uv),1.0);
  return rear;
}
// Single-loop 2-ray state machine (primary refracted ray, then entry reflection).
// One petRingTrace call site keeps Windows D3D11/FXC shader compilation instant
// while preserving closed-flange internal reflections, liquid reservoir and cap hits.
vec4 petRingShade() {
  vec3 origin=vPetRingPosition;
  vec3 direction=petRingOrthographic>.5?normalize(petRingView):normalize(origin-petRingCamera);
  vec3 geometric=normalize(cross(dFdx(origin),dFdy(origin)));
  if(dot(geometric,direction)>0.0)geometric=-geometric;
  vec3 n=normalize(vPetRingNormal);if(dot(n,direction)>=0.0)n=geometric;
  float cosine=clamp(-dot(n,direction),0.0,1.0),cosT;
  float f=petRingFresnel(cosine,1.0,petRingIor,cosT);
  int primaryLimit=petRingMaxBounces>0?petRingMaxBounces:6;
  int reflLimit=min(4,primaryLimit);
  bool hasPending=f>.01;
  vec3 pOrigin=origin+geometric*petRingEpsilon*2.0;
  vec3 pDir=reflect(direction,n);
  float pWeight=f;
  vec3 rOrigin=origin-geometric*petRingEpsilon*2.0;
  vec3 rDir=normalize(direction/petRingIor+(cosine/petRingIor-cosT)*n);
  float rWeight=1.0-f;
  float rMedium=petRingIor;
  bool rPrimary=true;
  int rLeft=primaryLimit;
  vec3 color=vec3(0);
  float alpha=1.0;
  int totalSteps=primaryLimit+reflLimit+2;
  int step=0;
  while(step<totalSteps) {
    step++;
    PetRingHit hit=petRingTrace(rOrigin,rDir);
    bool done=false;
    if(hit.distance>=999.0) {
      if(rPrimary) {
        vec4 rear=petRingEscape(rOrigin,rDir);
        color+=rWeight*rear.rgb; alpha=1.0-rWeight*(1.0-rear.a);
      } else {
        color+=rWeight*petRingEnvironment(rDir,petRingRoughness);
      }
      done=true;
    } else {
      vec3 point=rOrigin+rDir*hit.distance;
      if(hit.kind>4.5) {
        vec4 rear=petRingReservoir(petRingProject(point));
        if(rPrimary) {
          color+=rWeight*rear.rgb; alpha=1.0-rWeight*(1.0-rear.a);
        } else {
          color+=rWeight*(rear.rgb+(1.0-rear.a)*petRingEnvironment(rDir,petRingRoughness));
        }
        done=true;
      } else if(hit.kind>2.5) {
        color+=rWeight*petRingCap(hit,rDir);
        if(rPrimary) alpha=1.0;
        done=true;
      } else {
        bool entering=dot(rDir,hit.geometric)<0.0;
        float target=entering?petRingIor:1.0;
        vec3 hn=entering?hit.normal:-hit.normal;
        if(dot(hn,rDir)>=-.0001)hn=entering?hit.geometric:-hit.geometric;
        float hc=clamp(-dot(hn,rDir),0.0,1.0),hCosT;
        float hf=petRingFresnel(hc,rMedium,target,hCosT);
        rOrigin=point;
        rLeft--;
        if(hf>.999999) {
          rDir=reflect(rDir,hn);
          rOrigin+=(entering?hit.geometric:-hit.geometric)*petRingEpsilon*2.0;
        } else {
          color+=rWeight*hf*petRingEnvironment(reflect(rDir,hn),petRingRoughness);
          rWeight*=1.0-hf;
          rDir=normalize((rMedium/target)*rDir+((rMedium/target)*hc-hCosT)*hn);
          rMedium=target;
          rOrigin+=(entering?-hit.geometric:hit.geometric)*petRingEpsilon*2.0;
        }
        if(rLeft<=0||rWeight<.005) {
          if(rPrimary) {
            vec4 rear=petRingEscape(rOrigin,rDir);
            color+=rWeight*rear.rgb; alpha=1.0-rWeight*(1.0-rear.a);
          } else {
            color+=rWeight*petRingEnvironment(rDir,petRingRoughness);
          }
          done=true;
        }
      }
    }
    if(done) {
      if(!hasPending) break;
      hasPending=false;
      rOrigin=pOrigin; rDir=pDir; rWeight=pWeight; rMedium=1.0; rPrimary=false; rLeft=reflLimit;
    }
  }
  return vec4(color,clamp(alpha,0.0,1.0));
}
`;
