const ORIGIN='https://india-for-all.katojuachyuth.workers.dev';
const encoder=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const uid=/^[a-f0-9-]{36}$/;
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin',...extra}});
class Problem extends Error {constructor(message,status=400){super(message);this.status=status}}
async function key(env){if(!env.ADMIN_TOKEN)throw new Problem('Community temporarily unavailable.',503);return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function digest(env,value){const bytes=await crypto.subtle.sign('HMAC',await key(env),encoder.encode('community-v1:'+value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
async function mint(env){const id=crypto.randomUUID(),expires=now()+86400*180,payload=id+'.'+expires;return payload+'.'+await digest(env,'session:'+payload)}
async function session(req,env){
 const token=req.headers.get('X-Community-Session')||'',parts=token.split('.');
 if(parts.length!==3||!uid.test(parts[0])||!/^\d{10}$/.test(parts[1])||Number(parts[1])<now()||!/^[a-f0-9]{64}$/.test(parts[2]))throw new Problem('Please reconnect to participate.',401);
 const signature=new Uint8Array(parts[2].match(/../g).map(x=>parseInt(x,16)));
 const valid=await crypto.subtle.verify('HMAC',await key(env),signature,encoder.encode('community-v1:session:'+parts[0]+'.'+parts[1]));
 if(!valid)throw new Problem('Please reconnect to participate.',401);return parts[0];
}
async function body(req,maxBytes=8000){
 if(!(req.headers.get('Content-Type')||'').startsWith('application/json'))throw new Problem('JSON required.',415);
 if(Number(req.headers.get('Content-Length'))>maxBytes)throw new Problem('Message too large.',413);
 const reader=req.body?.getReader();if(!reader)throw new Problem('Message required.');let chunks=[],size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Problem('Message too large.',413)}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{const x=JSON.parse(new TextDecoder().decode(bytes));if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x}catch{throw new Problem('Invalid message.')}
}
function text(value,max,required=false){if(value==null&&!required)return '';if(typeof value!=='string')throw new Problem('Invalid text.');const clean=value.trim();if((required&&!clean)||clean.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean))throw new Problem('Please check the text length.');return clean}
function choice(value){if(value!==1&&value!==-1)throw new Problem('Choose support or disagree.');return value}
async function rate(req,env,scope){
 if(!env.COMMUNITY_LIMITER)throw new Problem('Community temporarily unavailable.',503);
 const address=req.headers.get('CF-Connecting-IP')||'unknown';
 const hash=await digest(env,'rate:'+new Date().toISOString().slice(0,10)+':'+address);
 const binding=scope==='session'?env.SESSION_LIMITER:scope==='read'||scope==='research-read'?env.READ_LIMITER:env.COMMUNITY_LIMITER;
 if(!binding)throw new Problem('Community temporarily unavailable.',503);
 const r=await binding.limit({key:scope+':'+hash});if(!r.success)throw new Problem('Too many requests. Please try again in a minute.',429);
}
async function cached(req,ctx,cache,build){
 const cacheKey=publicCacheKey(req);let r=cache?await cache.match(cacheKey):null;if(r)return r;
 r=await build();r.headers.set('Cache-Control','public, max-age=10, s-maxage=15');
 if(cache&&ctx)ctx.waitUntil(cache.put(cacheKey,r.clone()));return r;
}
const publicComment=c=>({id:c.id,parent_id:c.parent_id,root_id:c.root_id,depth:c.depth,alias:c.status==='hidden'?'':c.alias,city:c.status==='hidden'?'':c.city,body:c.status==='hidden'?'Comment hidden by moderator.':c.body,status:c.status,likes:c.likes,dislikes:c.dislikes,created_at:c.created_at});
export function publicCacheKey(req){
 const source=new URL(req.url),url=new URL(req.url);url.search='';
 const names=source.pathname==='/api/research'?['limit','region','category']:source.pathname==='/api/community/comments'?['root','after','before']:[];
 for(const name of names){const value=source.searchParams.get(name);if(value!==null)url.searchParams.set(name,value.slice(0,150))}return new Request(url,{method:'GET'});
}
export async function cleanupCommunity(env){const cutoff=now()-86400*30;await env.DB.batch([env.DB.prepare('DELETE FROM community_visitors WHERE last_seen<?').bind(cutoff),env.DB.prepare('DELETE FROM community_pageviews WHERE day<?').bind(new Date(cutoff*1000).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM community_analytics_optouts WHERE created_at<?').bind(cutoff)])}
export async function guardAdmin(req,env,authorized){
 if(!new URL(req.url).pathname.startsWith('/api/admin/'))return null;
 if(authorized(req,env))return null;
 if(!env.ADMIN_LIMITER||!env.ADMIN_TOKEN)return json({error:'Administrator access temporarily unavailable.'},503);
 const hash=await digest(env,'admin-attempt:'+new Date().toISOString().slice(0,10)+':'+(req.headers.get('CF-Connecting-IP')||'unknown'));
 const result=await env.ADMIN_LIMITER.limit({key:hash});
 return json({error:result.success?'Unauthorized':'Too many login attempts. Try again later.'},result.success?401:429,result.success?{}:{'Retry-After':'60'});
}
export async function protectResearch(req,env,cache=globalThis.caches?.default){
 if(req.method!=='GET'||new URL(req.url).pathname!=='/api/research')return null;
 try{await rate(req,env,'research-read');return cache?await cache.match(publicCacheKey(req)):null}catch(e){return json({error:e.message},e.status||503)}
}
export async function handleCommunity(req,env,ctx,authorized,cache=globalThis.caches?.default){
 const url=new URL(req.url),path=url.pathname,isAdmin=path.startsWith('/api/admin/community');
 if(!path.startsWith('/api/community/')&&!isAdmin)return null;
 try{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Community-Session','Access-Control-Max-Age':'86400','Vary':'Origin'}});
  if(!env.DB)throw new Problem('Community temporarily unavailable.',503);
  if(isAdmin){if(!authorized(req,env))throw new Problem('Unauthorized',401);return await admin(req,env,url)}
  if(req.method==='POST'){
   if(req.headers.get('Origin')!==ORIGIN)throw new Problem('This action must come from the website.',403);
   await rate(req,env,path==='/api/community/session'?'session':path==='/api/community/visit'?'visit':'write');
  }
  if(req.method==='GET')await rate(req,env,'read');
  if(req.method==='POST'&&path==='/api/community/session'){return json({token:await mint(env)})}
  if(req.method==='GET'&&path==='/api/community/stats')return await cached(req,ctx,cache,async()=>json({...await env.DB.prepare('SELECT support,oppose,likes,dislikes,comments FROM community_totals WHERE id=1').first(),as_of:now()}));
  if(req.method==='GET'&&path==='/api/community/supporters')return await cached(req,ctx,cache,async()=>{const r=await env.DB.prepare('SELECT alias,city,choice,updated_at FROM community_votes WHERE is_public=1 ORDER BY updated_at DESC LIMIT 20').all();return json({items:r.results||[]})});
  if(req.method==='GET'&&path==='/api/community/comments')return await cached(req,ctx,cache,async()=>{
   const root=url.searchParams.get('root');
   if(root){const topic=await env.DB.prepare('SELECT status FROM community_posts WHERE root_id=?').bind(root).first();if(topic&&topic.status!=='published')throw new Problem('Not found.',404);if(!uid.test(root))throw new Problem('Invalid thread.');const after=Number(url.searchParams.get('after'))||0;const r=await env.DB.prepare('SELECT rowid AS cursor,* FROM community_comments WHERE root_id=? AND rowid>? ORDER BY rowid LIMIT 51').bind(root,after).all();const rows=r.results||[];return json({items:rows.slice(0,50).map(publicComment),next:rows.length>50?rows[49].cursor:null})}
   const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
   const r=await env.DB.prepare('SELECT rowid AS cursor,* FROM community_comments WHERE parent_id IS NULL AND NOT EXISTS(SELECT 1 FROM community_posts p WHERE p.root_id=community_comments.id) AND rowid<? ORDER BY rowid DESC LIMIT 11').bind(before).all();const rows=r.results||[];return json({items:rows.slice(0,10).map(publicComment),next:rows.length>10?rows[9].cursor:null});
  });
  const id=await session(req,env);
  if(req.method==='GET'&&path==='/api/community/me'){
   const vote=await env.DB.prepare('SELECT choice,alias,city,is_public FROM community_votes WHERE session_id=?').bind(id).first();
   const reactions=await env.DB.prepare("SELECT choice FROM community_reactions WHERE session_id=? AND target_id='campaign'").bind(id).first();const own=await env.DB.prepare('SELECT id FROM community_comments WHERE session_id=? AND body<>\'\' ORDER BY created_at DESC LIMIT 100').bind(id).all();return json({vote,reaction:reactions?.choice||0,own_comments:own.results.map(x=>x.id)});
  }
  if(req.method!=='POST')throw new Problem('Not found.',404);
  const data=await body(req),stamp=now();
  if(path==='/api/community/vote'){
   const value=choice(data.choice),isPublic=data.public_profile===true;
   const alias=isPublic?text(data.alias,50,true):'',city=isPublic?text(data.city,80):'';
   await env.DB.prepare('INSERT INTO community_votes(session_id,choice,alias,city,is_public,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET choice=excluded.choice,alias=excluded.alias,city=excluded.city,is_public=excluded.is_public,updated_at=excluded.updated_at').bind(id,value,alias,city,Number(isPublic),stamp,stamp).run();return json({ok:true,choice:value});
  }
  if(path==='/api/community/withdraw'){
   await env.DB.prepare('DELETE FROM community_votes WHERE session_id=?').bind(id).run();return json({ok:true});
  }
  if(path==='/api/community/comment'){
   if(data.public_consent!==true)throw new Problem('Please agree to publish your comment.');
   const alias=text(data.alias,50,true),city=text(data.city,80),content=text(data.body,1500,true),parent=data.parent_id||null;
   let root='',depth=0;if(parent){if(!uid.test(parent))throw new Problem('Invalid reply.');const p=await env.DB.prepare('SELECT root_id,depth,status FROM community_comments WHERE id=?').bind(parent).first();if(!p)throw new Problem('This comment cannot receive replies.');if(p.status!=='visible'){const topic=await env.DB.prepare("SELECT id FROM community_posts WHERE root_id=? AND status='published'").bind(parent).first();if(!topic)throw new Problem('This comment cannot receive replies.');}depth=p.depth+1;if(depth>5)throw new Problem('Reply depth limit reached.');root=p.root_id}
   const recent=await env.DB.prepare('SELECT created_at FROM community_comments WHERE session_id=? AND body<>\'\' ORDER BY created_at DESC LIMIT 1').bind(id).first();if(recent&&stamp-recent.created_at<15)throw new Problem('Please wait 15 seconds between comments.',429);
   const commentId=crypto.randomUUID();const inserted=await env.DB.prepare('INSERT INTO community_comments(id,parent_id,root_id,depth,session_id,alias,city,body,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM community_comments WHERE session_id=? AND created_at>? AND body<>\'\')').bind(commentId,parent,root||commentId,depth,id,alias,city,content,stamp,id,stamp-15).run();if(inserted.meta?.changes!==1)throw new Problem('Please wait 15 seconds between comments.',429);return json({ok:true,id:commentId,root_id:root||commentId},201);
  }
  if(path==='/api/community/react'){
   const target=data.target_id;if(target!=='campaign'&&!uid.test(target||''))throw new Problem('Invalid reaction.');
   if(target!=='campaign'){const c=await env.DB.prepare("SELECT id FROM community_comments WHERE id=? AND status='visible'").bind(target).first();if(!c)throw new Problem('Comment not available.',404)}
   if(data.choice===0){await env.DB.prepare('DELETE FROM community_reactions WHERE session_id=? AND target_id=?').bind(id,target).run()}else{const value=choice(data.choice);await env.DB.prepare('INSERT INTO community_reactions(session_id,target_id,choice) VALUES(?,?,?) ON CONFLICT(session_id,target_id) DO UPDATE SET choice=excluded.choice').bind(id,target,value).run()}
   return json({ok:true});
  }
  if(path==='/api/community/report'){
   if(!uid.test(data.comment_id||''))throw new Problem('Invalid comment.');
   const c=await env.DB.prepare('SELECT id FROM community_comments WHERE id=?').bind(data.comment_id).first();if(!c)throw new Problem('Comment not available.',404);
   await env.DB.prepare('INSERT OR IGNORE INTO community_reports(comment_id,session_id,created_at) VALUES(?,?,?)').bind(data.comment_id,id,stamp).run();return json({ok:true});
  }
  if(path==='/api/community/remove-comment'){
   if(!uid.test(data.id||''))throw new Problem('Invalid comment.');
   const r=await env.DB.prepare("UPDATE community_comments SET status='hidden',alias='',city='',body='' WHERE id=? AND session_id=?").bind(data.id,id).run();
   if(r.meta?.changes!==1)throw new Problem('Comment not available in this browser.',403);return json({ok:true});
  }
  if(path==='/api/community/analytics-consent'){
   if(data.consent!==true)throw new Problem('Analytics consent required.');await env.DB.prepare('DELETE FROM community_analytics_optouts WHERE session_id=?').bind(id).run();return json({ok:true});
  }
  if(path==='/api/community/visit'){
   if(data.consent!==true)throw new Problem('Analytics consent required.');
   const day=new Date().toISOString().slice(0,10),visitor=await digest(env,'visitor:'+day+':'+id);
   const allowed=['/','/dashboard.html','/states.html','/methodology.html','/privacy.html','/families.html'];const page=allowed.includes(data.path)?data.path:'/';
   const country=String(req.cf?.country||'Unknown').slice(0,60),region=String(req.cf?.region||'Unknown').slice(0,80);
   const device=/mobile|android|iphone/i.test(req.headers.get('User-Agent')||'')?'Mobile':'Desktop or tablet';const increment=data.pageview===true?1:0;
   await env.DB.batch([
    env.DB.prepare('INSERT INTO community_visitors(day,visitor_key,country,region,device,path,first_seen,last_seen,views) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM community_analytics_optouts WHERE session_id=?) ON CONFLICT(day,visitor_key) DO UPDATE SET last_seen=excluded.last_seen,path=excluded.path,views=community_visitors.views+excluded.views').bind(day,visitor,country,region,device,page,stamp,stamp,increment,id),
    env.DB.prepare('INSERT INTO community_pageviews(day,path,views) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM community_analytics_optouts WHERE session_id=?) ON CONFLICT(day,path) DO UPDATE SET views=views+excluded.views').bind(day,page,increment,id)
   ]);return json({ok:true});
  }
  if(path==='/api/community/forget-analytics'){
   const statements=[env.DB.prepare('INSERT INTO community_analytics_optouts(session_id,created_at) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET created_at=excluded.created_at').bind(id,stamp)];for(let n=0;n<31;n++){const day=new Date(Date.now()-n*86400000).toISOString().slice(0,10),visitor=await digest(env,'visitor:'+day+':'+id);statements.push(env.DB.prepare('DELETE FROM community_visitors WHERE day=? AND visitor_key=?').bind(day,visitor))}await env.DB.batch(statements);return json({ok:true});
  }
  throw new Problem('Not found.',404);
 }catch(e){return json({error:e instanceof Problem?e.message:'Community temporarily unavailable. Please try again later.'},e instanceof Problem?e.status:503,e?.status===429?{'Retry-After':'60'}:{})}
}
async function admin(req,env,url){
 const stamp=now();
 if(req.method==='GET'&&url.pathname==='/api/admin/community/analytics'){
  const day=new Date().toISOString().slice(0,10),live=await env.DB.prepare('SELECT country,region,device,path,last_seen FROM community_visitors WHERE last_seen>? ORDER BY last_seen DESC LIMIT 50').bind(stamp-300).all();
  const total=await env.DB.prepare('SELECT COUNT(*) AS visitors,COALESCE(SUM(views),0) AS pageviews FROM community_visitors WHERE day=?').bind(day).first();
  const active=await env.DB.prepare('SELECT COUNT(*) AS count FROM community_visitors WHERE last_seen>?').bind(stamp-300).first();
  const pages=await env.DB.prepare('SELECT path,views FROM community_pageviews WHERE day=? ORDER BY views DESC LIMIT 10').bind(day).all();
  return json({today:total,active:active.count,recent:live.results,pages:pages.results,as_of:stamp,consent_only:true});
 }
 if(req.method==='GET'&&url.pathname==='/api/admin/community/comments'){
  const r=await env.DB.prepare('SELECT c.id,c.alias,c.city,c.body,c.status,c.created_at,(SELECT COUNT(*) FROM community_reports r WHERE r.comment_id=c.id) AS reports FROM community_comments c WHERE NOT EXISTS(SELECT 1 FROM community_posts p WHERE p.root_id=c.id) ORDER BY reports DESC,c.created_at DESC LIMIT 100').all();return json({items:r.results});
 }
 if(req.method==='POST'&&url.pathname==='/api/admin/community/moderate'){
  const data=await body(req);if(!uid.test(data.id||'')||!['visible','hidden'].includes(data.status))throw new Problem('Invalid moderation action.');
  await env.DB.batch([env.DB.prepare("UPDATE community_comments SET status=? WHERE id=? AND body<>''").bind(data.status,data.id),env.DB.prepare('INSERT INTO community_moderation(comment_id,action,occurred_at) VALUES(?,?,?)').bind(data.id,data.status,stamp)]);return json({ok:true});
 }
 throw new Problem('Not found.',404);
}

export {session,body,rate,json,Problem,text};
