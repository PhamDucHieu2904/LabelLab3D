/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/thietke06.VINUT/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{await page.goto('http://127.0.0.1:3005/studio?model=pet-330-energy#workspace');await page.waitForFunction(()=>document.querySelector('.viewer-host')?.dataset.viewerReady==='true',{},{timeout:60000});await page.getByRole('button',{name:'View 1',exact:true}).last().click();await page.waitForFunction(()=>document.querySelector('.viewer-host')?.dataset.cameraPresetState==='settled',{},{timeout:15000});
await page.locator('.viewer-host').focus(); for(let i=0;i<3;i++){await page.locator('.viewer-host').press('s');await page.waitForTimeout(200);} for(let i=0;i<7;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click(); await page.waitForTimeout(500); for(let i=0;i<2;i++){await page.locator('.viewer-host').press('s');await page.waitForTimeout(250);} console.log(await page.locator('.viewer-host').evaluate(e=>e.dataset));console.log(await page.getByRole('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')||e.textContent).filter(Boolean)));
await page.screenshot({path:path.join(__dirname,'app-studio.png')});fs.writeFileSync(path.join(__dirname,'app-errors.json'),JSON.stringify(errors,null,2));if(errors.length)throw Error(errors.join('\n'));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});



