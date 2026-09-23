#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
const {values:v,positionals:[cmd]}=parseArgs({allowPositionals:true,options:{env:{type:'string'},input:{type:'string'},job:{type:'string'},out:{type:'string'},wait:{type:'string',default:'0'},help:{type:'boolean'},'dry-run':{type:'boolean'}}});
const hash=s=>createHash('sha256').update(s).digest('hex');
async function save(file,data){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await fs.rename(tmp,file);await fs.chmod(file,0o600);}
async function main(){
 if(v.help||!cmd){console.log('Node 22+; no npm packages\nremote.mjs status | filters --env private.env [--out file.json]\nremote.mjs submit --env private.env --input request.json --job state.json --out result.json [--wait 45] [--dry-run]\nremote.mjs collect --env private.env --job state.json --out result.json [--wait 45]\nDo not share the private.env file publicly. No Topyi login needed.');return;}
 if(!['status','filters','submit','collect'].includes(cmd))throw Error('不支持的命令');
 const wait=Number(v.wait);if(!Number.isFinite(wait)||wait<0||wait>50)throw Error('--wait 应为0至50秒');
 let input=v.input?JSON.parse(await fs.readFile(v.input,'utf8')):null;
 if(cmd==='submit'&&(!input||!['query','mine'].includes(input.type)||!input.input))throw Error('输入需要 type=query/mine 与 input 对象');
 if(v['dry-run']){if(cmd!=='submit')throw Error('dry-run 只用于 submit');console.log(JSON.stringify({network:false,request:input}));return;}
 const env={};if(v.env){for(const l of (await fs.readFile(v.env,'utf8')).split(/\r?\n/)){const m=l.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}}
 const token=process.env.TOPYI_SERVICE_TOKEN||env.TOPYI_SERVICE_TOKEN;
 if(!token||!/^[A-Za-z0-9_-]{32,200}$/.test(token))throw Error('请用管理员分配的服务凭证配置 TOPYI_SERVICE_TOKEN');
 const base=new URL(process.env.TOPYI_API_URL||env.TOPYI_API_URL||'https://topyi.movingcostcheck.com');
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('服务地址必须是完整 HTTPS 源地址，不接受明文 HTTP 或 URL 中的凭证');
 const api=async(route,body,key)=>{
  let r;try{r=await fetch(new URL(route,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('连接中断；保留任务文件，用 collect 恢复，勿换目录重复提交');}
  let data;try{data=await r.json();}catch{throw Error('服务未返回 JSON，请检查网络或联系管理员');}
  if(!r.ok)throw Error(data.error?.code+': '+data.error?.message);return data;
 };
 if(['status','filters'].includes(cmd)){const data=await api('/v1/'+cmd);if(v.out)await save(v.out,data);else console.log(JSON.stringify(data,null,2));return;}
 if(!v.job||!v.out)throw Error('需要 --job 和 --out，以便恢复任务并保存结果');
 const credentialId=hash(token).slice(0,16);let state;
 if(cmd==='submit'){
  state={url:base.origin,credentialId,input,idempotencyKey:randomUUID(),status:'submitting',createdAt:new Date().toISOString()};
  await fs.mkdir(path.dirname(v.job),{recursive:true,mode:0o700});await fs.writeFile(v.job,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
 }else state=JSON.parse(await fs.readFile(v.job,'utf8'));
 if(state.url!==base.origin||state.credentialId!==credentialId)throw Error('任务文件属于其他服务或访问凭证，不能混用');
 if(!state.jobId){const started=await api('/v1/jobs',state.input,state.idempotencyKey);state.jobId=started.job.id;state.reused=started.reused;await save(v.job,state);}
 const deadline=Date.now()+wait*1000;
 for(;;){
  const job=await api('/v1/jobs/'+state.jobId);Object.assign(state,{status:job.status,job});await save(v.job,state);
  if(job.resultAvailable){const result=await api('/v1/jobs/'+state.jobId+'/result');await save(v.out,{jobId:state.jobId,reused:state.reused,service:base.origin,...result});console.log(JSON.stringify({saved:v.out,jobId:state.jobId,status:job.status,complete:job.complete,rows:result.rows?.length,total:result.total,counts:result.counts,reused:state.reused}));if(job.status==='partial')process.exitCode=2;return;}
  if(['failed','interrupted','cancelled'].includes(job.status)){console.log(JSON.stringify({jobId:state.jobId,status:job.status,error:job.error}));process.exitCode=2;return;}
  if(Date.now()>=deadline){console.log(JSON.stringify({jobId:state.jobId,status:job.status,next:'collect with the same job file'}));return;}
  await new Promise(r=>setTimeout(r,Math.min(2000,deadline-Date.now())));
 }
}
main().catch(e=>{console.error(e.code==='EEXIST'?'任务文件已存在，请用 collect 继续，不要重复提交':e.message);process.exitCode=1;});
