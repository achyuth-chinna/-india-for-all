import {handlePosts} from './posts.js';
import {handleCommunity,cleanupCommunity,guardAdmin,protectResearch,publicCacheKey} from './community.js';
import { importDrafts } from './intake.js';
import { adminHtml } from './admin-page.js';
// Cloudflare Worker API backed by D1. Review required before publication.
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const fail=(message,status=400)=>reply({error:message},status);
function authorized(req,env){
 const provided=req.headers.get('authorization')||'';
 const expected=env.ADMIN_TOKEN;
 if(!expected || !provided.startsWith('Bearer ')) return false;
 const token=provided.slice(7);
 if(token.length!==expected.length) return false;
 let diff=0;for(let i=0;i<token.length;i++)diff|=token.charCodeAt(i)^expected.charCodeAt(i);
 return diff===0;
}
const columns='id,title,summary,category,region,source_name,source_url,source_published_on,reporting_period,metric_value,metric_unit,evidence_note,status,created_at,updated_at,reviewed_at,reviewed_by,published_at';
const validCategories=new Set(['education','healthcare','public_spending','crime','other']);
const allowedStates=new Set(['draft','in_review','published','rejected']);
function validate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'JSON object required';
 for(const key of ['title','summary','category','region','source_name','source_url','reporting_period']){
  if(typeof raw[key]!=='string'||!raw[key].trim())return key+' is required';
 }
 if(!validCategories.has(raw.category))return 'Invalid category';
 if(!/^https:\/\/[^\s/]+/i.test(raw.source_url))return 'HTTPS source_url required';
 for(const [key,limit] of Object.entries({title:180,summary:3000,region:100,source_name:180,source_url:2000,reporting_period:120,evidence_note:3000,metric_value:120,metric_unit:120,source_published_on:30})){
  if(raw[key]!=null && (typeof raw[key]!=='string'||raw[key].length>limit))return 'Invalid '+key;
 }
 return null;
}
async function audit(db,id,action,actor,note=''){
 await db.prepare('INSERT INTO review_events(item_id,action,actor,note) VALUES(?,?,?,?)').bind(id,action,actor,note).run();
}
export default {
 async scheduled(event,env,ctx){ ctx.waitUntil(importDrafts(env,validate).then(result=>console.log('Research intake',JSON.stringify(result))));ctx.waitUntil(cleanupCommunity(env)); },
 async fetch(req,env,ctx){
  const researchCached=await protectResearch(req,env);if(researchCached)return researchCached;
  const gate=await guardAdmin(req,env,authorized);if(gate)return gate;
  const postResponse=await handlePosts(req,env,ctx,authorized);if(postResponse)return postResponse;
  const community=await handleCommunity(req,env,ctx,authorized);if(community)return community;
  const url=new URL(req.url),path=url.pathname;
  if(req.method==='GET'&&path==='/admin'){const nonce=crypto.randomUUID().replaceAll('-','');return new Response(adminHtml.replace('<script>','<script nonce="'+nonce+'">'),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; media-src blob:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}})}
  if(!path.startsWith('/api/'))return fail('Not found',404);
  if(!env.DB)return fail('Database not configured',503);
  try{
   if(req.method==='GET'&&path==='/api/health')return reply({ok:true,service:'india-for-all-research'});
   if(req.method==='GET'&&path==='/api/research'){
    const limit=Math.min(50,Math.max(1,Math.floor(Number(url.searchParams.get('limit')))||20));
    const region=url.searchParams.get('region'),category=url.searchParams.get('category');
    const where=["status='published'"],args=[];
    if(region){where.push('region=?');args.push(region.slice(0,100))}
    if(category){if(!validCategories.has(category))return fail('Invalid category');where.push('category=?');args.push(category)}
    const result=await env.DB.prepare('SELECT '+columns+' FROM research_items WHERE '+where.join(' AND ')+' ORDER BY published_at DESC LIMIT ?').bind(...args,limit).all();
    const response=reply({items:result.results||[],count:(result.results||[]).length});
    response.headers.set('Access-Control-Allow-Origin',req.headers.get('Origin')==='https://india-for-all.katojuachyuth.workers.dev'?'https://india-for-all.katojuachyuth.workers.dev':'https://wevotefor.in');
    response.headers.set('Vary','Origin');
    response.headers.set('Cache-Control','public, max-age=10, s-maxage=15');
    if(ctx&&globalThis.caches?.default)ctx.waitUntil(caches.default.put(publicCacheKey(req),response.clone()));
    return response;
   }
   if(!authorized(req,env))return fail('Unauthorized',401);
   if(req.method==='GET'&&path==='/api/admin/research'){
    const status=url.searchParams.get('status')||'in_review';
    if(!allowedStates.has(status))return fail('Invalid status');
    const result=await env.DB.prepare('SELECT '+columns+' FROM research_items WHERE status=? ORDER BY updated_at DESC LIMIT 100').bind(status).all();
    return reply({items:result.results||[]});
   }
   if(req.method==='POST'&&path==='/api/admin/research'){
    const raw=await req.json();const error=validate(raw);if(error)return fail(error);
    const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO research_items (id,title,summary,category,region,source_name,source_url,source_published_on,reporting_period,metric_value,metric_unit,evidence_note,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft')`).bind(id,raw.title.trim(),raw.summary.trim(),raw.category,raw.region.trim(),raw.source_name.trim(),raw.source_url.trim(),raw.source_published_on||null,raw.reporting_period.trim(),raw.metric_value||null,raw.metric_unit||null,raw.evidence_note||'').run();
    await audit(env.DB,id,'created','admin');
    return reply({id,status:'draft'},201);
   }
   const match=path.match(/^\/api\/admin\/research\/([a-f0-9-]+)\/(submit|publish|reject)$/);
   if(req.method==='POST'&&match){
    const [,id,action]=match;const item=await env.DB.prepare('SELECT status FROM research_items WHERE id=?').bind(id).first();
    if(!item)return fail('Item not found',404);
    const transitions={submit:['draft','in_review'],publish:['in_review','published'],reject:['in_review','rejected']};
    const [from,to]=transitions[action];
    if(item.status!==from)return fail('Invalid transition: '+item.status+' to '+to,409);
    let note='';try{const body=await req.json();note=typeof body.note==='string'?body.note.slice(0,1000):''}catch{}
    if(action==='publish'&&!note.trim())return fail('Review evidence note required before publication');
    const result=await env.DB.prepare(`UPDATE research_items SET status=?,updated_at=datetime('now'),reviewed_at=CASE WHEN ?='published' THEN datetime('now') ELSE reviewed_at END,reviewed_by=CASE WHEN ?='published' THEN 'admin' ELSE reviewed_by END,published_at=CASE WHEN ?='published' THEN datetime('now') ELSE published_at END WHERE id=? AND status=?`).bind(to,to,to,to,id,from).run();
    if(result.meta?.changes!==1)return fail('Concurrent update; retry',409);
    await audit(env.DB,id,action,'admin',note);
    return reply({id,status:to});
   }
   return fail('Not found',404);
  }catch(e){return fail('Request failed. Check database migrations and server logs.',500)}
 }
};
