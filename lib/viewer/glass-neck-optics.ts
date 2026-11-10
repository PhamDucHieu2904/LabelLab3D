/** Hollow-glass path for the authored pull-cap Neck. Trace the retained glass,
 * cap and label triangles; the rest of the bottle keeps its web renderer. */
export const GLASS_NECK_OPTICS_GLSL = /* glsl */ `
uniform highp sampler2D glassNeckTriangles;
uniform highp sampler2D glassNeckNodes;
uniform highp sampler2D glassNeckUvs;
uniform int glassNeckDataWidth;
uniform float glassNeckEpsilon;
uniform float glassNeckRoughness;
uniform mat4 glassNeckToScene;
uniform mat4 glassNeckSceneToClip;
uniform float glassNeckBackgroundDistance;
uniform vec3 glassNeckCamera;
uniform vec3 glassNeckView;
uniform float glassNeckOrthographic;
uniform vec3 glassNeckCapColor;
uniform float glassNeckCapRoughness;
uniform float glassNeckCapMetalness;
uniform vec3 glassNeckLabelColor;
uniform sampler2D glassNeckLabelMap;
uniform float glassNeckHasLabelMap;
uniform mat3 glassNeckLabelUvMatrix;
uniform vec3 glassNeckLiquidColor;
uniform float glassNeckLiquidClarity;
uniform float glassNeckLiquidDensity;
uniform float glassNeckLiquidTurbidity;
uniform float glassNeckLiquidBrightness;
uniform float glassNeckLiquidScattering;
uniform float glassNeckLiquidRoughness;
uniform float glassNeckLiquidIor;
uniform float glassNeckLiquidSurfaceCapture;
varying vec3 vGlassNeckPosition;
varying vec3 vGlassNeckNormal;

struct GlassNeckHit { float distance; vec3 normal; vec3 geometric; float kind; vec2 uv; };
vec4 glassNeckFetch(highp sampler2D data, int index) {
  return texelFetch(data, ivec2(index % glassNeckDataWidth, index / glassNeckDataWidth), 0);
}
GlassNeckHit glassNeckTrace(vec3 origin, vec3 direction) {
  GlassNeckHit hit=GlassNeckHit(1000.0,vec3(0),vec3(0),0.0,vec2(0));
  vec3 safe=vec3(abs(direction.x)<1e-10?1e-10:direction.x,
    abs(direction.y)<1e-10?1e-10:direction.y,abs(direction.z)<1e-10?1e-10:direction.z);
  vec3 inverseDirection=1.0/safe;int node=0;
  int end=int(glassNeckFetch(glassNeckNodes,0).w),best=-1;vec2 bary=vec2(0);
  while(node<end) {
    vec4 lo=glassNeckFetch(glassNeckNodes,node*3),hi=glassNeckFetch(glassNeckNodes,node*3+1);
    vec4 range=glassNeckFetch(glassNeckNodes,node*3+2);
    vec3 t0=(lo.xyz-origin)*inverseDirection,t1=(hi.xyz-origin)*inverseDirection;
    vec3 nearV=min(t0,t1),farV=max(t0,t1);
    if(max(max(nearV.x,nearV.y),max(nearV.z,0.0))>min(min(farV.x,farV.y),min(farV.z,hit.distance))) {node=int(lo.w);continue;}
    for(int i=0;i<int(range.y);i++) {
      int id=int(range.x)+i,p=id*6;
      vec4 a=glassNeckFetch(glassNeckTriangles,p),e1=glassNeckFetch(glassNeckTriangles,p+1),e2=glassNeckFetch(glassNeckTriangles,p+2);
      vec3 crossD=cross(direction,e2.xyz);float det=dot(e1.xyz,crossD);
      if(abs(det)<max(1e-30,e2.w))continue;
      vec3 offset=origin-a.xyz;float u=dot(offset,crossD)/det;
      if(u<-.00001||u>1.00001)continue;
      vec3 q=cross(offset,e1.xyz);float v=dot(direction,q)/det;
      if(v<-.00001||u+v>1.00001)continue;
      float t=dot(e2.xyz,q)/det;
      if(t>glassNeckEpsilon*.5&&t<hit.distance){hit.distance=t;hit.kind=e1.w;best=id;bary=vec2(u,v);}
    }
    node++;
  }
  if(best>=0) {
    int p=best*6;
    vec3 e1=glassNeckFetch(glassNeckTriangles,p+1).xyz,e2=glassNeckFetch(glassNeckTriangles,p+2).xyz;
    hit.geometric=normalize(cross(e1,e2));
    hit.normal=normalize(glassNeckFetch(glassNeckTriangles,p+3).xyz*(1.0-bary.x-bary.y)
      +glassNeckFetch(glassNeckTriangles,p+4).xyz*bary.x+glassNeckFetch(glassNeckTriangles,p+5).xyz*bary.y);
    vec4 uv01=glassNeckFetch(glassNeckUvs,best*2),uv2=glassNeckFetch(glassNeckUvs,best*2+1);
    hit.uv=uv01.xy*(1.0-bary.x-bary.y)+uv01.zw*bary.x+uv2.xy*bary.y;
  }
  return hit;
}
float glassNeckFresnel(float cosine,float etaI,float etaT,out float cosineT) {
  float sinT2=(etaI*etaI)/(etaT*etaT)*max(0.0,1.0-cosine*cosine);
  cosineT=sqrt(max(0.0,1.0-sinT2));if(sinT2>=1.0)return 1.0;
  float rs=(etaI*cosine-etaT*cosineT)/max(.000001,etaI*cosine+etaT*cosineT);
  float rp=(etaT*cosine-etaI*cosineT)/max(.000001,etaT*cosine+etaI*cosineT);
  return clamp((rs*rs+rp*rp)*.5,0.0,1.0);
}
vec3 glassNeckEnvironment(vec3 direction,float roughness) {
  #ifdef USE_ENVMAP
    vec3 worldDirection=normalize(mat3(glassNeckToScene)*direction);
    vec3 viewDirection=normalize((viewMatrix*vec4(worldDirection,0.0)).xyz);
    return getIBLRadiance(viewDirection,viewDirection,roughness);
  #else
    return vec3(0);
  #endif
}
vec3 glassNeckLiquidCapture(vec3 point,vec3 direction) {
  point+=direction*glassNeckEpsilon*2.0;
  vec4 clip=glassNeckSceneToClip*vec4((glassNeckToScene*vec4(point,1.0)).xyz,1.0);
  vec2 uv=clip.xy/max(clip.w,.000001)*.5+.5;
  // Keep this call on Three's canonical helper. The export adapter rewrites
  // getTransmissionSample to the full-resolution atlas and tiled region;
  // direct sampler reads would incorrectly address the current tile only.
  float roughness=glassNeckLiquidSurfaceCapture>0.0
    ?min(glassNeckLiquidRoughness,glassNeckRoughness):glassNeckLiquidRoughness;
  return getTransmissionSample(uv,roughness,glassNeckLiquidIor).rgb;
}
vec3 glassNeckOpaque(GlassNeckHit hit,vec3 direction,vec3 point) {
  vec3 n=dot(direction,hit.normal)>0.0?-hit.normal:hit.normal;
  vec3 diffuse=glassNeckEnvironment(n,1.0);
  if(hit.kind>4.5) {
    float iorShift=clamp(abs(glassNeckLiquidIor-1.333)*.35,0.0,.2);
    float haze=clamp(glassNeckLiquidDensity*.72+glassNeckLiquidTurbidity*.65+glassNeckLiquidScattering*.18+iorShift,0.0,.96);
    vec3 pigment=pow(max(glassNeckLiquidColor,vec3(.003)),vec3(.18+1.35*glassNeckLiquidDensity));
    // Sample the renderer's captured opaque pass. Sampling the
    // projected liquid hit keeps authored water, seeds and basil membrane in
    // the hollow Neck instead of replacing them with an environment color.
    vec3 captured=glassNeckLiquidCapture(point,refract(direction,n,1.0/glassNeckLiquidIor));
    vec3 transmitted=mix(captured,glassNeckEnvironment(refract(direction,n,1.0/glassNeckLiquidIor),glassNeckLiquidRoughness),.18)*pigment;
    float transmission=glassNeckLiquidClarity*(1.0-.92*glassNeckLiquidDensity)*(1.0-.96*glassNeckLiquidTurbidity);
    vec3 rear=mix(mix(diffuse,pigment,haze),transmitted,transmission);
    if(glassNeckLiquidSurfaceCapture>0.0) {
      float cosine=clamp(-dot(direction,n),0.0,1.0),cosT;
      float f=glassNeckFresnel(cosine,1.0,glassNeckLiquidIor,cosT);
      // Keep the authored density/turbidity/scattering response as the
      // surface baseline. Capture adds a bounded refracted variation on top
      // instead of bypassing the existing liquid appearance controls.
      vec3 surfaceBase=mix(diffuse,pigment,haze);
      vec3 surface=mix(surfaceBase,captured,glassNeckLiquidSurfaceCapture);
      surface=surface*(1.0-f)+f*glassNeckEnvironment(reflect(direction,n),glassNeckLiquidRoughness);
      rear=mix(surface,transmitted,transmission);
    }
    return rear*glassNeckLiquidBrightness;
  }
  if(hit.kind>3.5) {
    vec3 pigment=glassNeckLabelColor;
    if(glassNeckHasLabelMap>.5) {
      vec2 uv=(glassNeckLabelUvMatrix*vec3(hit.uv,1.0)).xy;
      pigment*=texture2D(glassNeckLabelMap,uv).rgb;
    }
    return pigment*diffuse;
  }
  vec3 reflected=glassNeckEnvironment(reflect(direction,n),glassNeckCapRoughness);
  float f0=mix(.04,1.0,glassNeckCapMetalness);
  float f=f0+(1.0-f0)*pow(1.0-clamp(-dot(direction,n),0.0,1.0),5.0);
  return glassNeckCapColor*(diffuse*(1.0-glassNeckCapMetalness)+reflected*f);
}
// A reflected ray can see the cap/label through the cavity as well. Follow one
// secondary path without a recursive branching tree; retain Fresnel energy at
// each secondary interface and use the environment only when it really escapes.
vec3 glassNeckReflection(vec3 origin,vec3 direction,float medium) {
  vec3 color=vec3(0);float weight=1.0;
  for(int bounce=0;bounce<8;bounce++) {
    GlassNeckHit hit=glassNeckTrace(origin,direction);
    if(hit.distance>=999.0)return color+weight*glassNeckEnvironment(direction,glassNeckRoughness);
    if(hit.kind>2.5)return color+weight*glassNeckOpaque(hit,direction,origin+direction*hit.distance);
    bool entering=dot(direction,hit.geometric)<0.0;
    float target=entering?1.52:1.0;
    vec3 n=entering?hit.normal:-hit.normal;
    if(dot(n,direction)>=-.0001)n=entering?hit.geometric:-hit.geometric;
    float cosine=clamp(-dot(n,direction),0.0,1.0),cosT;
    float f=glassNeckFresnel(cosine,medium,target,cosT);
    origin+=direction*hit.distance;
    if(f>.999999) {
      direction=reflect(direction,n);origin+=(entering?hit.geometric:-hit.geometric)*glassNeckEpsilon*2.0;continue;
    }
    color+=weight*f*glassNeckEnvironment(reflect(direction,n),glassNeckRoughness);
    weight*=1.0-f;
    direction=normalize((medium/target)*direction+((medium/target)*cosine-cosT)*n);
    medium=target;origin+=(entering?-hit.geometric:hit.geometric)*glassNeckEpsilon*2.0;
  }
  return color+weight*glassNeckEnvironment(direction,glassNeckRoughness);
}
vec4 glassNeckEscape(vec3 origin,vec3 direction,vec3 color,float weight) {
  if(bottleBackdropEnabled>.5) {
    vec3 point=(glassNeckToScene*vec4(origin,1.0)).xyz;
    point+=normalize(mat3(glassNeckToScene)*direction)*glassNeckBackgroundDistance;
    vec4 clip=glassNeckSceneToClip*vec4(point,1.0);
    vec2 uv=clip.xy/max(clip.w,.000001)*.5+.5;
    // bottleBackdropAt applies the capture/tile region exactly once.
    return vec4(color+weight*bottleBackdropAt(uv),1.0);
  }
  // Unresolved throughput remains transparent even at the finite ray budget.
  // RGBA cannot encode distortion of an unknown future background.
  return vec4(color,clamp(1.0-weight,0.0,1.0));
}
vec4 glassNeckShade() {
  vec3 origin=vGlassNeckPosition;
  vec3 direction=glassNeckOrthographic>.5?normalize(glassNeckView):normalize(origin-glassNeckCamera);
  vec3 geometric=normalize(cross(dFdx(origin),dFdy(origin)));
  if(dot(geometric,direction)>0.0)geometric=-geometric;
  vec3 n=normalize(vGlassNeckNormal);if(dot(n,direction)>=0.0)n=geometric;
  float cosT,cosine=clamp(-dot(n,direction),0.0,1.0);
  float f=glassNeckFresnel(cosine,1.0,1.52,cosT);
  // The app's authored Neck is transparent with preserved metallic specular:
  // BaseColor=.3962264, smoothness=.85. Keep its stronger
  // surface reflection while the hollow-volume directions use glass IOR.
  float surfaceF=.3962264+(1.0-.3962264)*pow(1.0-cosine,5.0);
  f=max(f,surfaceF);
  vec3 color=f*glassNeckReflection(origin+geometric*glassNeckEpsilon*2.0,reflect(direction,n),1.0);
  float weight=1.0-f;
  direction=normalize(direction/1.52+(cosine/1.52-cosT)*n);
  origin-=geometric*glassNeckEpsilon*2.0;
  float medium=1.52;
  for(int bounce=0;bounce<12;bounce++) {
    GlassNeckHit hit=glassNeckTrace(origin,direction);
    if(hit.distance>=999.0)return glassNeckEscape(origin,direction,color,weight);
    if(hit.kind>2.5) {color+=weight*glassNeckOpaque(hit,direction,origin+direction*hit.distance);return vec4(color,1.0);}
    bool entering=dot(direction,hit.geometric)<0.0;
    float target=entering?1.52:1.0;
    n=entering?hit.normal:-hit.normal;
    if(dot(n,direction)>=-.0001)n=entering?hit.geometric:-hit.geometric;
    cosine=clamp(-dot(n,direction),0.0,1.0);
    f=glassNeckFresnel(cosine,medium,target,cosT);
    origin+=direction*hit.distance;
    if(f>.999999) {
      direction=reflect(direction,n);origin+=(entering?hit.geometric:-hit.geometric)*glassNeckEpsilon*2.0;continue;
    }
    vec3 reflected=reflect(direction,n);
    vec3 reflectedOrigin=origin+(entering?hit.geometric:-hit.geometric)*glassNeckEpsilon*2.0;
    vec3 reflection=bounce<3&&weight*f>.06
      ?glassNeckReflection(reflectedOrigin,reflected,medium)
      :glassNeckEnvironment(reflected,glassNeckRoughness);
    color+=weight*f*reflection;
    weight*=1.0-f;
    direction=normalize((medium/target)*direction+((medium/target)*cosine-cosT)*n);
    medium=target;origin+=(entering?-hit.geometric:hit.geometric)*glassNeckEpsilon*2.0;
  }
  return glassNeckEscape(origin,direction,color,weight);
}
`;
