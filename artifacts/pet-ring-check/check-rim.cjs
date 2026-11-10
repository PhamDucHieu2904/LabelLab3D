/* eslint-disable @typescript-eslint/no-require-imports */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {chromium}=require('C:/Users/thietke06.VINUT/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let f=p==='/'?path.join(__dirname,'harness.html'):path.join(base,/^\/(lib|node_modules|artifacts)\//.test(p)?p:path.join('/public',p));if(!fs.existsSync(f)&&fs.existsSync(f+'.ts'))f+='.ts';try{let d=fs.readFileSync(f),ext=path.extname(f);if(ext==='.ts'){d=ts.transpileModule(d.toString(),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;ext='.js';}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[ext]||'application/octet-stream');res.end(d);}catch(e){res.statusCode=404;res.end(String(e));}});
(async()=>{let browser;const errors=[];try{await new Promise(r=>server.listen(3086,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:3086/');await page.waitForFunction(()=>window.ready);const r=await page.evaluate(()=>window.debug.experiment({id:'pet-350-juice',above:true,pink:true}));fs.writeFileSync(path.join(__dirname,'rim-regression.png'),Buffer.from(r.png.split(',')[1],'base64'));
 const sharp=require('sharp'),{data,info}=await sharp(Buffer.from(r.png.split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});let isolated=0;
 // Smooth source and smooth lighting should not produce hundreds of isolated
 // one-pixel caustic samples. Exclude silhouette and long coherent highlights.
 for(let y=400;y<550;y++)for(let x=100;x<900;x++){const i=(y*info.width+x)*3;let dot=false;for(let c=0;c<3;c++){const center=data[i+c],a=data[i-3+c],b=data[i+3+c],u=data[i-info.width*3+c],d=data[i+info.width*3+c];if(Math.abs(a-b)<20&&Math.abs(u-d)<20&&Math.abs(center-(a+b+u+d)/4)>35)dot=true;}if(dot)isolated++;}
 console.log({isolated,errors});if(errors.length)throw Error(errors.join('\n'));// Diagnostic only: minimizing isolated dots previously rewarded an opaque TIR shortcut. Optical correctness is checked by check-clear-pet.cjs.

 }finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

