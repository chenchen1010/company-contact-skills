#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const ACTORS={employees:'harvestapi~linkedin-company-employees',profiles:'harvestapi~linkedin-profile-scraper'};
export const terminal=new Set(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT']);
export async function save(file,data){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await fs.rename(tmp,file);await fs.chmod(file,0o600);}
export function validateSpec(s){
 if(!s||!ACTORS[s.kind]||!s.input||typeof s.input!=='object')throw Error('spec 需要 kind: employees/profiles 与 input 对象');
 const key=s.kind==='employees'?'companies':'queries';const urls=s.input[key];
 if(!Array.isArray(urls)||!urls.length||urls.length>100)throw Error(key+' 需要 1～100 个地址');
 for(const value of urls){let u;try{u=new URL(value);}catch{throw Error('请提供完整领英地址');}if(u.protocol!=='https:'||!/(^|\.)linkedin\.com$/.test(u.hostname)||!u.pathname.startsWith(s.kind==='employees'?'/company/':'/in/'))throw Error('领英地址类型不匹配');}
 if(s.kind==='employees'&&(!Number.isInteger(s.input.maxItems)||s.input.maxItems<1))throw Error('公司人员查询必须给定正整数 maxItems');
 if(!s.input.profileScraperMode)throw Error('必须明确 profileScraperMode，邮箱搜索不能依赖默认值');
 return s;
}
export async function request(endpoint,{token,body,fetchImpl=fetch}={}){
 if(!endpoint.startsWith('/'))throw Error('需要 Apify API 相对路径');
 let r;try{r=await fetchImpl('https://api.apify.com/v2'+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw Error('Apify 连接中断；若为提交操作，不要盲目重复提交');}
 let raw=(await r.text()).replaceAll(token,'[REDACTED]');let data;try{data=JSON.parse(raw);}catch{throw Error('Apify 返回非 JSON 响应');}
 if(!r.ok)throw Error('Apify HTTP '+r.status+'；请检查权限、额度或输入，不自动重试');
 return {checkedAt:new Date().toISOString(),endpoint,status:r.status,response:data};
}
export async function download(datasetId,token,fetchImpl=fetch){
 if(!/^[A-Za-z0-9]+$/.test(datasetId))throw Error('无效 datasetId');
 const items=[];let total=null;
 for(let offset=0;;offset+=500){
  const endpoint=`/datasets/${datasetId}/items?clean=false&offset=${offset}&limit=500&format=json`;
  const r=await fetchImpl('https://api.apify.com/v2'+endpoint,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw Error('数据下载失败 HTTP '+r.status+'；可用相同任务目录继续');
  const raw=(await r.text()).replaceAll(token,'[REDACTED]');const page=JSON.parse(raw);
  if(!Array.isArray(page))throw Error('数据集响应结构异常');
  const n=r.headers.get('x-apify-pagination-total');if(n!==null){if(total!==null&&total!==Number(n))throw Error('数据集下载过程中总数变化，请重新 collect');total=Number(n);}
  items.push(...page);
  if(page.length<500||(total!==null&&items.length>=total))break;
 }
 if(total!==null&&items.length!==total)throw Error('数据集下载不完整');
 return {items,total:total??items.length,downloadComplete:true};
}
export async function start(spec,cap,dir,token,fetchImpl=fetch){
 validateSpec(spec);if(!Number.isFinite(cap)||cap<=0)throw Error('必须提供大于0的本次费用上限');
 await fs.mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,'state.json');
 const state={actor:ACTORS[spec.kind],kind:spec.kind,company:spec.company||'',input:spec.input,inputHash:createHash('sha256').update(JSON.stringify(spec.input)).digest('hex'),cap,status:'STARTING',createdAt:new Date().toISOString()};
 // Exclusive creation also blocks concurrent/double submission and uncertain network retries.
 await fs.writeFile(file,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
 try{
  const r=await request(`/acts/${state.actor}/runs?maxTotalChargeUsd=${cap}&timeout=300&restartOnError=false`,{token,body:spec.input,fetchImpl});
  await save(path.join(dir,'start.json'),r);
  const d=r.response.data;if(!d?.id||!d?.defaultDatasetId)throw Error('缺少运行标识，不重复提交；先检查控制台');
  Object.assign(state,{runId:d.id,datasetId:d.defaultDatasetId,status:d.status});await save(file,state);return state;
 }catch(e){state.status='START_UNCERTAIN';state.error=e.message;await save(file,state);throw e;}
}
async function tokenFrom(file){
 if(process.env.APIFY_API_TOKEN)return process.env.APIFY_API_TOKEN.trim();
 if(!file)throw Error('设置 APIFY_API_TOKEN 或用 --env 指定自己的本地凭证文件');
 const lines=await fs.readFile(file,'utf8');let t=lines.match(/^\s*(?:export\s+)?APIFY_API_TOKEN\s*=\s*(.+)$/m)?.[1]?.trim();
 if(t&&(t.startsWith('"')&&t.endsWith('"')||t.startsWith("'")&&t.endsWith("'")))t=t.slice(1,-1);
 if(!t)throw Error('凭证文件中缺少 APIFY_API_TOKEN');return t;
}
export async function main(){
 const {values:v,positionals:[cmd]}=parseArgs({allowPositionals:true,options:{spec:{type:'string'},budget:{type:'string'},out:{type:'string'},env:{type:'string'},wait:{type:'string',default:'0'},'run-id':{type:'string'},'dry-run':{type:'boolean'},help:{type:'boolean'}}});
 if(v.help||!cmd){console.log('apify.mjs start --spec job.json --budget USD --out private-job [--env local.env] [--dry-run]\napify.mjs collect --out private-job [--wait 45] [--env local.env]\napify.mjs attach --out private-job --run-id ID (recover ambiguous start after checking console)\napify.mjs describe --spec job.json --out private-info [--env local.env]\ncollect never starts another paid run. Node 22+, no npm dependencies.');return;}
 if(!['start','collect','attach','describe'].includes(cmd))throw Error('未知命令');
 if(!v.out)throw Error('需要 --out 私有任务目录');const dir=path.resolve(v.out);
 const spec=v.spec?validateSpec(JSON.parse(await fs.readFile(v.spec,'utf8'))):null;
 if(v['dry-run']){if(cmd!=='start'||!spec||!(Number(v.budget)>0))throw Error('dry-run 用于 start 且需要 spec 与 budget');console.log(JSON.stringify({actor:ACTORS[spec.kind],input:spec.input,maxTotalChargeUsd:Number(v.budget),network:false}));return;}
 const token=await tokenFrom(v.env);
 if(cmd==='describe'){
  if(!spec)throw Error('需要 --spec');const r=await request('/acts/'+ACTORS[spec.kind],{token});await save(path.join(dir,'actor.json'),r);
  const build=await request('/acts/'+ACTORS[spec.kind]+'/builds/default',{token});await save(path.join(dir,'build.json'),build);
  console.log(JSON.stringify({saved:dir,actor:ACTORS[spec.kind],readOnly:true}));return;
 }
 if(cmd==='start'){if(!spec)throw Error('需要 --spec');const s=await start(spec,Number(v.budget),dir,token);console.log(JSON.stringify({runId:s.runId,status:s.status,cap:s.cap}));return;}
 const file=path.join(dir,'state.json');let s=JSON.parse(await fs.readFile(file,'utf8'));
 if(cmd==='attach'){
  if(s.runId)throw Error('已有运行标识，不允许覆盖');if(!/^[A-Za-z0-9]+$/.test(v['run-id']||''))throw Error('无效运行标识');
  const r=await request('/actor-runs/'+v['run-id'],{token});const d=r.response.data;
  const actor=await request('/acts/'+s.actor,{token});
  if(d.actId!==actor.response.data.id)throw Error('运行不属于原定采集器');
  const input=await request('/key-value-stores/'+d.defaultKeyValueStoreId+'/records/INPUT',{token});
  const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  if(canonical(input.response)!==canonical(s.input))throw Error('运行输入与待恢复任务不一致，不能自动关联');
  Object.assign(s,{runId:d.id,datasetId:d.defaultDatasetId,status:d.status});await save(file,s);console.log(JSON.stringify({attached:s.runId}));return;
 }
 if(!s.runId)throw Error('提交结果不明：先在控制台确认是否生成任务，再用 attach，不要新建重试');
 const wait=Number(v.wait);if(!Number.isFinite(wait)||wait<0||wait>50)throw Error('--wait 为0～50秒');const deadline=Date.now()+wait*1000;
 let r;
 do{
  r=await request('/actor-runs/'+s.runId,{token});const d=r.response.data;
  if(!d?.status)throw Error('运行状态缺失');Object.assign(s,{status:d.status,usageTotalUsd:d.usageTotalUsd??null,checkedAt:r.checkedAt,buildId:d.buildId,datasetId:d.defaultDatasetId});
  await save(path.join(dir,'status.json'),r);await save(file,s);
  if(terminal.has(s.status)||Date.now()>=deadline)break;
  await new Promise(resolve=>setTimeout(resolve,Math.min(5000,deadline-Date.now())));
 }while(true);
 if(terminal.has(s.status)){
  const data=await download(s.datasetId,token);await save(path.join(dir,'items.json'),data.items);
  Object.assign(s,{itemCount:data.items.length,datasetDownloadComplete:data.downloadComplete,runSucceeded:s.status==='SUCCEEDED',scope:'仅本次输入和账号限额内的返回结果，不代表公司全员或每人都有邮箱'});await save(file,s);
 }
 console.log(JSON.stringify({runId:s.runId,status:s.status,count:s.itemCount,costUsd:s.usageTotalUsd,downloaded:s.datasetDownloadComplete||false}));
 if(terminal.has(s.status)&&s.status!=='SUCCEEDED')process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.code==='EEXIST'?'任务目录已提交过，请 collect；不允许重复启动':e.message);process.exitCode=1;});
