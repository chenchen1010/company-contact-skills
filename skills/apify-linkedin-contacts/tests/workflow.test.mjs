import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {start,download,validateSpec} from '../scripts/apify.mjs';
import {normalize} from '../scripts/normalize.mjs';
const spec={kind:'profiles',input:{profileScraperMode:'Profile details + email search ($10 per 1k)',queries:['https://www.linkedin.com/in/example-person']}};
test('uncertain POST persists attempt and blocks duplicate billing',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'apify-skill-'));let calls=0;
 try{
  await assert.rejects(start(spec,.1,dir,'fixture-key',async()=>{calls++;throw Error('network');}));
  const s=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));assert.equal(s.status,'START_UNCERTAIN');
  await assert.rejects(start(spec,.1,dir,'fixture-key',async()=>{calls++;}));assert.equal(calls,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('API destination, authorization header, cap and restart control',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'apify-skill-'));
 try{await start(spec,.12,dir,'fixture-key',async(url,opts)=>{
  assert.equal(new URL(url).origin,'https://api.apify.com');assert.equal(new URL(url).searchParams.get('maxTotalChargeUsd'),'0.12');assert.equal(new URL(url).searchParams.get('restartOnError'),'false');assert.equal(opts.headers.Authorization,'Bearer fixture-key');assert.equal(url.includes('fixture-key'),false);
  return new Response(JSON.stringify({data:{id:'RUN1',defaultDatasetId:'DATA1',status:'READY'}}));
 });assert.equal(JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).runId,'RUN1');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('dataset pagination fetches every row without dropping item-level errors',async()=>{
 const calls=[];const r=await download('DATA1','fixture-key',async url=>{
  const o=Number(new URL(url).searchParams.get('offset'));calls.push(o);
  return new Response(JSON.stringify(o===0?Array.from({length:500},(_,i)=>({id:i})):[{error:'Profile not found'}]),{headers:{'x-apify-pagination-total':'501'}});
 });assert.deepEqual(calls,[0,500]);assert.equal(r.items.length,501);assert.equal(r.items.at(-1).error,'Profile not found');
});
test('validation rejects wrong page type and unlimited employee query',()=>{
 assert.throws(()=>validateSpec({kind:'employees',input:{companies:spec.input.queries,profileScraperMode:'Full'}}));
 assert.throws(()=>validateSpec({kind:'employees',input:{companies:['https://www.linkedin.com/company/example'],profileScraperMode:'Full'}}));
});
test('normalization separates former employer, private email and collection judgments',()=>{
 const a=normalize([{linkedinUrl:'https://www.linkedin.com/in/example-person',firstName:'Example',lastName:'Person',currentPosition:[{companyName:'Another Company',companyLinkedinUrl:'https://www.linkedin.com/company/another',position:'Buyer'}],emails:[{email:'buyer@example.com',status:'valid',catchAllDomain:false},{email:'person@gmail.com',free:true},{email:'uncertain@example.com',status:'risky',catchAllDomain:true}]}],{companyUrl:'https://www.linkedin.com/company/target'});
 assert.equal(a.excluded.length,1);assert.equal(a.contacts[0].deliveryConfirmed,false);assert.match(a.contacts[0].companyAssociation,/未匹配/);assert.match(a.contacts[1].emailAssessment,/未能确认/);
});
test('unusable addresses are excluded even if the domain accepts arbitrary addresses',()=>{
 const r=normalize([{linkedinUrl:'https://www.linkedin.com/in/example-person',emails:[{email:'bad@example.com',status:'invalid',catchAllDomain:true}]}]);
 assert.equal(r.contacts.length,0);assert.equal(r.excluded.length,1);assert.match(r.excluded[0].emailAssessment,/不可用/);
});
