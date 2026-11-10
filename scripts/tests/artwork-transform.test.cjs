const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const ts=require('typescript'); const Module=require('node:module');
function load(file){const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);return m.exports;}
const t=load(path.resolve(__dirname,'../../lib/labellab/artwork-transform.ts')); function assertClose(a,b){for(const k of Object.keys(b)) assert.ok(Math.abs(a[k]-b[k])<1e-9);}
test('fit contain and cover produce normalized literal transforms',()=>{assertClose(t.fitArtwork(4,2,{width:3,height:2},'contain'),{x:0,y:.125,width:1,height:.75});assertClose(t.fitArtwork(4,2,{width:3,height:2},'cover'),{x:-1/6,y:0,width:4/3,height:1});});
test('pan translates and sanitizes finite deltas',()=>{assert.deepEqual(t.panArtwork({x:.1,y:-.2,width:1,height:.5},.25,.4),{x:.35,y:.2,width:1,height:.5});assert.deepEqual(t.panArtwork({x:.1,y:-.2,width:1,height:.5},Infinity,NaN),{x:.1,y:-.2,width:1,height:.5});});
test('resize anchors keep opposite edges fixed',()=>{const s={x:.2,y:.3,width:.4,height:.5};assertClose(t.resizeArtwork(s,'e',.1,0),{x:.2,y:.3,width:.5,height:.5});assertClose(t.resizeArtwork(s,'nw',-.1,-.2),{x:.1,y:.1,width:.5,height:.7});assertClose(t.resizeArtwork(s,'s',0,.2),{x:.2,y:.3,width:.4,height:.7});});
test('proportional corner resize preserves ratio and centers perpendicular edge',()=>{const s={x:.2,y:.3,width:.4,height:.2};const r=t.resizeArtwork(s,'se',.2,.1,true);assert.ok(Math.abs(r.width/r.height-2)<1e-9);assertClose(r,{x:.2,y:.3,width:.6,height:.3});});
test('all handles return finite minimum-sized transforms',()=>{for(const h of ['nw','n','ne','e','se','s','sw','w']){const r=t.resizeArtwork({x:0,y:0,width:.02,height:.02},h,-10,-10,true);for(const v of Object.values(r))assert.ok(Number.isFinite(v));assert.ok(r.width>=.01&&r.height>=.01)}});
test('known rectangular model dielines use supplied millimetre dimensions',()=>{
 const cases={
  'can-180':[170,107], 'can-250-short':[216,90], 'can-250-slim':[177,131], 'can-320':[192,143], 'can-mango':[216,114], 'can-500':[216,166],
  'pet-320-full-nata':[206,125], 'pet-nata-watermelon':[195,50], 'pet-aloe':[220,77],
  'pet-1000-juice':[268,217], 'pet-1000-short-juice':[296,190], 'pet-1500-juice':[296,257],
  'glass-300-milk':[193,84], 'pet-325-juice':[192,158], 'pet-330-energy':[183,77], 'pet-350-juice':[206,132],
  'glass-280-latte':[211,156], 'glass-280-short-latte':[211,143],
  'basil-strawberry':[164,108], 'glass-290-chia':[164,108], 'glass-290-milk':[164,108],
  'glass-290-pullcap-basil':[169,97.5], 'glass-290-pullcap-chia':[169,97.5], 'glass-290-pullcap-milk':[169,97.5], 'glass-485-milk':[166,83],
  'pp-500':[210,185], 'pp-1000':[300,182],
  'pp-1000-2':[272,237], 'pp-1250':[300,227], 'pp-2000':[356,242],
 };
 for(const [id,[width,height]] of Object.entries(cases)) {
  const actual=t.getArtworkDieline(id);
  assert.deepEqual({width:actual.width,height:actual.height,unit:actual.unit},{width,height,unit:'mm'},id);
 }
});

test('pending models and unknown dimensions remain provisional',()=>{
 for(const id of ['unknown','pet-500-full-label','pet-1500-short-label','pp-500-2']) {
  assert.deepEqual(t.getArtworkDieline(id),{width:3,height:2},id);
 }
});

test('special bottle families share the supplied dieline guide across liquid variants',()=>{
 for(const id of ['basil-strawberry','glass-290-chia','glass-290-milk']) assert.equal(t.getArtworkDieline(id).guideSrc,'/assets/dielines/glass-290-screwcap.svg');
 for(const id of ['glass-290-pullcap-basil','glass-290-pullcap-chia','glass-290-pullcap-milk']) assert.equal(t.getArtworkDieline(id).guideSrc,'/assets/dielines/glass-290-pullcap.svg');
 assert.equal(t.getArtworkDieline('glass-485-milk').guideSrc,'/assets/dielines/glass-485.svg');
 assert.equal(t.getArtworkDieline('pet-nata-watermelon').guideSrc,undefined);
});

test('pending model dimensions are recorded without activating provisional model ids',()=>{
 assert.deepEqual(t.PENDING_ARTWORK_DIELINES,{
  'pet-500-full-label':{width:220,height:153,unit:'mm'},
  'pet-1500-short-label':{width:296,height:97,unit:'mm'},
 });
});

test('fitting a matching print file fills each supplied frame without stretching',()=>{
 for(const id of Object.keys(t.ARTWORK_DIELINES)) {
  const d=t.getArtworkDieline(id);
  assertClose(t.fitArtwork(d.width*10,d.height*10,d),{x:0,y:0,width:1,height:1});
  const placement=t.fitArtwork(1000,1000,d);
  assert.ok(Math.abs(placement.width*d.width/(placement.height*d.height)-1)<1e-9,`${id}: square source stays square`);
 }
 const editable=t.getArtworkDieline('pet-nata-watermelon'); editable.width=1;
 assert.equal(t.getArtworkDieline('pet-nata-watermelon').width,195,'returned dimensions cannot mutate the registry');
});
test('each of eight handles moves only its literal edges',()=>{
 const fixtures=[['nw',{x:.375,y:.375,width:.375,height:.375}],['n',{x:.25,y:.375,width:.5,height:.375}],['ne',{x:.25,y:.375,width:.625,height:.375}],['e',{x:.25,y:.25,width:.625,height:.5}],['se',{x:.25,y:.25,width:.625,height:.625}],['s',{x:.25,y:.25,width:.5,height:.625}],['sw',{x:.375,y:.25,width:.375,height:.625}],['w',{x:.375,y:.25,width:.375,height:.5}]];
 for(const [handle,want] of fixtures)assertClose(t.resizeArtwork({x:.25,y:.25,width:.5,height:.5},handle,.125,.125),want);
});
test('horizontal proportional corner drag controls both sizes',()=>{assertClose(t.resizeArtwork({x:.25,y:.25,width:.5,height:.25},'se',.25,0,true),{x:.25,y:.25,width:.75,height:.375});});
test('proportional edge drag centers perpendicular axis and preserves opposite edge',()=>{assertClose(t.resizeArtwork({x:.25,y:.25,width:.5,height:.25},'w',-.25,0,true),{x:0,y:.1875,width:.75,height:.375});});
test('proportional shrinking maintains ratio at the minimum',()=>{assertClose(t.resizeArtwork({x:.25,y:.25,width:.5,height:.25},'nw',10,10,true),{x:.73,y:.49,width:.02,height:.01});});
test('normalization rejects nonfinite persistence and bounds malformed placement',()=>{assert.equal(t.validArtworkTransform({x:NaN,y:0,width:1,height:1}),false);assert.equal(t.validArtworkTransform({x:0,y:0,width:-1,height:1}),false);assert.deepEqual(t.normalizeArtworkTransform({x:Infinity,y:-1000,width:NaN,height:-1}),{x:0,y:-100,width:1,height:.01});});


