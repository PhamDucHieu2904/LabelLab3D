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
// Follow internal reflections to the next real boundary. A ray still inside
// PET cannot be replaced by an opaque environment sample: doing so makes the
// clear flange a black/chrome band under a white cap.
vec3 petRingReflection(vec3 origin,vec3 direction,float medium) {
  vec3 color=vec3(0);float weight=1.0;
  for(int bounce=0;bounce<6;bounce++) {
    PetRingHit hit=petRingTrace(origin,direction);
    if(hit.distance>=999.0)return color+weight*petRingEnvironment(direction,petRingRoughness);
    vec3 point=origin+direction*hit.distance;
    if(hit.kind>4.5){vec4 rear=petRingReservoir(petRingProject(point));return color+weight*(rear.rgb+(1.0-rear.a)*petRingEnvironment(direction,petRingRoughness));}
    if(hit.kind>2.5)return color+weight*petRingCap(hit,direction);
    bool entering=dot(direction,hit.geometric)<0.0;
    float target=entering?petRingIor:1.0;
    vec3 n=entering?hit.normal:-hit.normal;
    if(dot(n,direction)>=-.0001)n=entering?hit.geometric:-hit.geometric;
    float cosine=clamp(-dot(n,direction),0.0,1.0),cosT;
    float f=petRingFresnel(cosine,medium,target,cosT);
    origin=point;
    if(f>.999999){direction=reflect(direction,n);origin+=(entering?hit.geometric:-hit.geometric)*petRingEpsilon*2.0;continue;}
    color+=weight*f*petRingEnvironment(reflect(direction,n),petRingRoughness);
    weight*=1.0-f;
    direction=normalize((medium/target)*direction+((medium/target)*cosine-cosT)*n);
    medium=target;origin+=(entering?-hit.geometric:hit.geometric)*petRingEpsilon*2.0;
  }
  return color+weight*petRingEnvironment(direction,petRingRoughness);
}
vec4 petRingShade() {
  vec3 origin=vPetRingPosition;
  vec3 direction=petRingOrthographic>.5?normalize(petRingView):normalize(origin-petRingCamera);
  vec3 geometric=normalize(cross(dFdx(origin),dFdy(origin)));
  if(dot(geometric,direction)>0.0)geometric=-geometric;
  vec3 n=normalize(vPetRingNormal);if(dot(n,direction)>=0.0)n=geometric;
  float cosine=clamp(-dot(n,direction),0.0,1.0),cosT;
  float f=petRingFresnel(cosine,1.0,petRingIor,cosT);
  vec3 color=f*petRingReflection(origin+geometric*petRingEpsilon*2.0,reflect(direction,n),1.0);
  float weight=1.0-f;
  direction=normalize(direction/petRingIor+(cosine/petRingIor-cosT)*n);
  origin-=geometric*petRingEpsilon*2.0;
  float medium=petRingIor;
  for(int bounce=0;bounce<12;bounce++) {
    PetRingHit hit=petRingTrace(origin,direction);
    if(hit.distance>=999.0){vec4 rear=petRingEscape(origin,direction);return vec4(color+weight*rear.rgb,1.0-weight*(1.0-rear.a));}
    vec3 point=origin+direction*hit.distance;
    if(hit.kind>4.5){vec4 rear=petRingReservoir(petRingProject(point));return vec4(color+weight*rear.rgb,1.0-weight*(1.0-rear.a));}
    if(hit.kind>2.5)return vec4(color+weight*petRingCap(hit,direction),1.0);
    bool entering=dot(direction,hit.geometric)<0.0;
    float target=entering?petRingIor:1.0;
    n=entering?hit.normal:-hit.normal;
    if(dot(n,direction)>=-.0001)n=entering?hit.geometric:-hit.geometric;
    cosine=clamp(-dot(n,direction),0.0,1.0);
    f=petRingFresnel(cosine,medium,target,cosT);
    origin=point;
    if(f>.999999){direction=reflect(direction,n);origin+=(entering?hit.geometric:-hit.geometric)*petRingEpsilon*2.0;continue;}
    vec3 reflected=reflect(direction,n);
    vec3 reflectedOrigin=origin+(entering?hit.geometric:-hit.geometric)*petRingEpsilon*2.0;
    vec3 reflection=bounce<2&&weight*f>.025?petRingReflection(reflectedOrigin,reflected,medium):petRingEnvironment(reflected,petRingRoughness);
    color+=weight*f*reflection;weight*=1.0-f;
    direction=normalize((medium/target)*direction+((medium/target)*cosine-cosT)*n);
    medium=target;origin+=(entering?-hit.geometric:hit.geometric)*petRingEpsilon*2.0;
  }
  vec4 rear=petRingEscape(origin,direction);
  return vec4(color+weight*rear.rgb,1.0-weight*(1.0-rear.a));
}
`;
