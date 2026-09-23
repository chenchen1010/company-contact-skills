#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {save} from './apify.mjs';
const canon=url=>{try{const u=new URL(url);return u.pathname.replace(/\/+$/,'').toLowerCase();}catch{return '';}};
export function readableEmail(e){
 if(['invalid','undeliverable'].includes(e.status))return '采集工具判断不可用，需保留原始证据';
 if(e.status==='valid'&&e.catchAllDomain===false)return '采集工具判断可用，尚未独立确认能否收件';
 if(e.catchAllDomain===true)return '采集工具未能确认此邮箱是否真实存在';
 return '已找到邮箱线索，能否收件尚未确认';
}
export function normalize(items,{companyUrl='',domain='',runId=''}={}){
 const rows=[],excluded=[],errors=[],seen=new Set();
 for(const [index,p] of items.entries()){
  if(p.error||!p.linkedinUrl){errors.push({index,query:p.query||null,error:p.error||'缺少人员主页，需查看原记录'});continue;}
  const positions=p.currentPosition||[];
  const matched=companyUrl?positions.find(x=>canon(x.companyLinkedinUrl)&&canon(x.companyLinkedinUrl)===canon(companyUrl)):null;
  const association=matched?'职业资料显示在目标公司任职':positions.length&&companyUrl?'当前任职资料未匹配目标公司':'尚未核对人员所属公司';
  const base={name:[p.firstName,p.lastName].filter(Boolean).join(' '),profileUrl:p.linkedinUrl,profileId:p.id||p.publicIdentifier||null,query:p.query||null,headline:p.headline||'',currentPositions:positions.map(x=>({company:x.companyName,role:x.position,url:x.companyLinkedinUrl})),companyAssociation:association,role:matched?.position||positions[0]?.position||p.headline||'',sourceChannel:'Apify 采集',sourceUrl:runId?'https://console.apify.com/actors/runs/'+runId:'',checkedAt:new Date().toISOString(),deliveryConfirmed:false};
  if(!p.emails?.length){rows.push({...base,email:'',emailAssessment:'该次未返回邮箱，不代表公司没有联系方式'});continue;}
  for(const item of p.emails){
   const e=typeof item==='string'?{email:item}:item;
   const email=String(e.email||'').trim().toLowerCase();if(!email)continue;
   const key=p.linkedinUrl.toLowerCase()+'|'+email;if(seen.has(key))continue;seen.add(key);
   const row={...base,email,emailAssessment:readableEmail(e),providerEvidence:e};
   if(['invalid','undeliverable'].includes(e.status)){excluded.push({...row,reason:'采集工具已判断不可用，不列入发送名单'});continue;}
   if(e.free===true||/@(?:gmail|hotmail|outlook|yahoo|live|icloud)\./.test(email)){excluded.push({...row,reason:'个人邮箱，不自动列为商务开发地址'});continue;}
   row.domainAssociation=domain?(email.split('@')[1]===domain.toLowerCase()?'与指定公司邮箱域名一致':'与指定域名不同，需核实集团或子公司关系'):'尚未提供公司邮箱域名';
   rows.push(row);
  }
 }
 return {contacts:rows,excluded,errors,counts:{contacts:rows.length,emails:rows.filter(x=>x.email).length,excluded:excluded.length,errors:errors.length}};
}
async function main(){
 const {values:v}=parseArgs({options:{items:{type:'string'},state:{type:'string'},out:{type:'string'},'company-url':{type:'string'},domain:{type:'string'},help:{type:'boolean'}}});
 if(v.help){console.log('normalize.mjs --items job/items.json --state job/state.json --out contacts.json [--company-url https://www.linkedin.com/company/...] [--domain company.example]');return;}
 if(!v.items||!v.out)throw Error('需要 --items 与 --out');
 const items=JSON.parse(await fs.readFile(v.items,'utf8'));if(!Array.isArray(items))throw Error('items 必须为数组');
 const state=v.state?JSON.parse(await fs.readFile(v.state,'utf8')):{};
 const data=normalize(items,{companyUrl:v['company-url']||(state.input?.companies?.length===1?state.input.companies[0]:''),domain:v.domain||'',runId:state.runId||''});
 await save(v.out,data);console.log(JSON.stringify(data.counts));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
