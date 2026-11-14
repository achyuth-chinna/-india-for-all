import {session,body,rate,json,Problem,text,publicCacheKey} from './community.js';
const ORIGIN='https://wevotefor.in',uuid=/^[a-f0-9-]{36}$/;
const stamp=()=>Math.floor(Date.now()/1000);
function publicLink(value){if(!value)return '';const s=text(value,2000);let u;try{u=new URL(s)}catch{throw new Problem('Use a public HTTPS media link.')}if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(\d|\[)/.test(u.hostname)||/\.(local|internal|localhost)$/.test(u.hostname))throw new Problem('Use a public HTTPS media link.');return u.href}
export async function handlePosts(req,env,ctx,authorized){
 const url=new URL(req.url),path=url.pathname;
 if(!/^\/api\/(community\/(posts|post-report|uploads|media)(\/|$)|admin\/community\/(posts|post-action|comment-delete|media)(\/|$))/.test(path))return null;
 try{
  const admin=path.startsWith('/api/admin/');if(admin&&!authorized(req,env))throw new Problem('Unauthorized',401);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Content-Type, X-Community-Session, X-Upload-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'86400'}});
  if(!admin&&env.PUBLIC_POSTS_ENABLED!=='true'){if(req.method==='GET'&&path==='/api/community/uploads')return json({enabled:false,posts_enabled:false});throw new Problem('Public issue posts are disabled until storage is ready.',503)}
  if(req.method==='GET')await rate(req,env,'read');
  if(!admin&&req.method==='POST'){if(req.headers.get('Origin')!==ORIGIN)throw new Problem('This action must come from the website.',403);await rate(req,env,'write')}
  if(req.method==='GET'&&path==='/api/community/uploads')return json({enabled:Boolean(env.MEDIA),image_limit:5242880,video_limit:26214400});
  if(req.method==='POST'&&path==='/api/community/uploads'){
   const owner=await session(req,env);if(!env.MEDIA)throw new Problem('Direct uploads are not active. Add a public media link instead.',503);
   const size=Number(req.headers.get('Content-Length')),mime=req.headers.get('Content-Type');const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];
   if(!allowed.includes(mime))throw new Problem('Use JPEG, PNG, WebP, MP4 or WebM.',415);
   if(!Number.isSafeInteger(size)||size<=0)throw new Problem('Upload size required.',411);if(size>(mime.startsWith('image/')?5242880:26214400))throw new Problem('File exceeds the upload limit.',413);
   const id=crypto.randomUUID(),key='community/'+id,now=stamp();
   const reservation=await env.DB.prepare('INSERT INTO community_media(id,session_id,object_key,mime,bytes,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(bytes),0) FROM community_media WHERE created_at>?) + ? <= 104857600 AND (SELECT COUNT(*) FROM community_media WHERE session_id=? AND created_at>?) < 5').bind(id,owner,key,mime,size,now,now-86400,size,owner,now-86400).run();if(reservation.meta.changes!==1)throw new Problem('Upload quota reached. Use a public link instead.',429);
   const reader=req.body.getReader();const first=await reader.read();const b=first.value||new Uint8Array();const chars=(from,to)=>String.fromCharCode(...b.slice(from,to));
   const ok=mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:mime==='image/png'?b[0]===137&&chars(1,4)==='PNG':mime==='image/webp'?chars(0,4)==='RIFF'&&chars(8,12)==='WEBP':mime==='video/mp4'?chars(4,8)==='ftyp':b[0]===26&&b[1]===69&&b[2]===223&&b[3]===163;
   if(!ok){await reader.cancel();await env.DB.prepare('DELETE FROM community_media WHERE id=?').bind(id).run();throw new Problem('The file contents do not match its type.',415)}
   const stream=new FixedLengthStream(size),writer=stream.writable.getWriter();const upload=env.MEDIA.put(key,stream.readable,{httpMetadata:{contentType:mime}});
   const pump=(async()=>{try{await writer.write(b);while(true){const part=await reader.read();if(part.done)break;await writer.write(part.value)}await writer.close()}catch(e){await writer.abort(e);throw e}})();
   try{await Promise.all([upload,pump])}catch{await env.MEDIA.delete(key);await env.DB.prepare('DELETE FROM community_media WHERE id=?').bind(id).run();throw new Problem('Upload failed. Please retry.',503)}
   return json({id},201);
  }
  const mediaMatch=path.match(/^\/api\/(community|admin\/community)\/media\/([a-f0-9-]{36})$/);
  if(req.method==='GET'&&mediaMatch){
   if(!env.MEDIA)throw new Problem('Not found.',404);
   const row=await env.DB.prepare("SELECT m.* FROM community_media m JOIN community_posts p ON p.media_id=m.id WHERE m.id=? AND p.status"+(admin?"<>'deleted'":"='published'")).bind(mediaMatch[2]).first();if(!row)throw new Problem('Not found.',404);
   const object=await env.MEDIA.get(row.object_key);if(!object)throw new Problem('Not found.',404);
   return new Response(object.body,{headers:{'Content-Type':row.mime,'Content-Length':String(row.bytes),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Access-Control-Allow-Origin':ORIGIN}});
  }
  if(req.method==='GET'&&path==='/api/community/posts'){
   const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
   const r=await env.DB.prepare("SELECT p.rowid AS cursor,p.id,p.alias,p.city,p.title,p.body,p.kind,p.media_url,p.media_id,p.root_id,p.created_at FROM community_posts p WHERE status='published' AND p.rowid<? ORDER BY p.rowid DESC LIMIT 11").bind(before).all();const items=r.results;return json({items:items.slice(0,10),next:items.length>10?items[9].cursor:null});
  }
  if(req.method==='GET'&&path==='/api/admin/community/posts'){
   const r=await env.DB.prepare("SELECT p.id,p.alias,p.city,p.title,p.body,p.kind,p.media_url,p.media_id,p.root_id,p.status,p.created_at,(SELECT COUNT(*) FROM community_post_reports r WHERE r.post_id=p.id) AS reports FROM community_posts p WHERE status<>'deleted' ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100").all();return json({items:r.results});
  }
  if(req.method!=='POST')throw new Problem('Not found.',404);
  const data=await body(req,16000),now=stamp();
  if(admin){
   if(path==='/api/admin/community/comment-delete'){
    if(!uuid.test(data.id||''))throw new Problem('Invalid comment.');
    await env.DB.batch([env.DB.prepare("WITH RECURSIVE affected(id) AS (SELECT id FROM community_comments WHERE id=? UNION ALL SELECT c.id FROM community_comments c JOIN affected a ON c.parent_id=a.id) UPDATE community_comments SET status='hidden',alias='',city='',body='' WHERE id IN (SELECT id FROM affected)").bind(data.id),env.DB.prepare('INSERT INTO community_moderation(comment_id,action,occurred_at) VALUES(?,?,?)').bind(data.id,'admin-erased-thread',now)]);return json({ok:true});
   }
   if(path==='/api/admin/community/post-action'){
    if(!uuid.test(data.id||'')||!['publish','delete'].includes(data.action))throw new Problem('Invalid post action.');const p=await env.DB.prepare("SELECT * FROM community_posts WHERE id=? AND status<>'deleted'").bind(data.id).first();if(!p)throw new Problem('Not found.',404);
    if(data.action==='publish')await env.DB.prepare("UPDATE community_posts SET status='published' WHERE id=?").bind(p.id).run();
    else{
     await env.DB.batch([env.DB.prepare("UPDATE community_posts SET status='deleted',alias='',city='',title='',body='',media_url='' WHERE id=?").bind(p.id),env.DB.prepare("UPDATE community_comments SET status='hidden',alias='',city='',body='' WHERE root_id=?").bind(p.root_id)]);
     if(p.media_id){const m=await env.DB.prepare('SELECT object_key FROM community_media WHERE id=?').bind(p.media_id).first();if(m&&env.MEDIA)await env.MEDIA.delete(m.object_key)}
    }
    await env.DB.prepare('INSERT INTO community_moderation(comment_id,action,occurred_at) VALUES(?,?,?)').bind(p.id,'post-'+data.action,now).run();return json({ok:true});
   }
   throw new Problem('Not found.',404);
  }
  const owner=await session(req,env);
  if(path==='/api/community/posts'){
   if(data.consent!==true)throw new Problem('Please agree to publish your submission.');const alias=text(data.alias,50,true),city=text(data.city,80),title=text(data.title,160,true),content=text(data.body,3000,true),kind=data.kind;
   if(!['text','photo','video'].includes(kind))throw new Problem('Choose text, photo or video.');const link=kind==='text'?'':publicLink(data.media_url),mid=kind==='text'?null:data.media_id||null;
   if(kind!=='text'&&!link&&!mid)throw new Problem('Add a public media link or an uploaded file.');if(mid){const m=await env.DB.prepare('SELECT id,mime FROM community_media WHERE id=? AND session_id=?').bind(mid,owner).first();if(!m||!m.mime.startsWith(kind==='photo'?'image/':'video/'))throw new Problem('Invalid attachment.')}
   const id=crypto.randomUUID(),root=crypto.randomUUID();
   const saved=await env.DB.batch([env.DB.prepare("INSERT INTO community_comments(id,parent_id,root_id,depth,session_id,alias,city,body,status,created_at) SELECT ?,NULL,?,0,?,'','','','hidden',? WHERE NOT EXISTS(SELECT 1 FROM community_posts WHERE session_id=? AND created_at>?) AND (SELECT COUNT(*) FROM community_posts WHERE session_id=? AND created_at>?)<5").bind(root,root,owner,now,owner,now-60,owner,now-86400),env.DB.prepare('INSERT INTO community_posts(id,session_id,alias,city,title,body,kind,media_url,media_id,root_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM community_comments WHERE id=?)').bind(id,owner,alias,city,title,content,kind,link,mid,root,now,root)]);if(saved[1].meta.changes!==1)throw new Problem('Please wait a minute between posts. Maximum five posts per day.',429);return json({ok:true,id,status:'pending'},201);
  }
  if(path==='/api/community/post-report'){if(!uuid.test(data.id||''))throw new Problem('Invalid post.');const p=await env.DB.prepare("SELECT id FROM community_posts WHERE id=? AND status='published'").bind(data.id).first();if(!p)throw new Problem('Not found.',404);await env.DB.prepare('INSERT OR IGNORE INTO community_post_reports(post_id,session_id,created_at) VALUES(?,?,?)').bind(p.id,owner,now).run();return json({ok:true})}
  throw new Problem('Not found.',404);
 }catch(e){return json({error:e instanceof Problem?e.message:'Posts temporarily unavailable.'},e instanceof Problem?e.status:503)}
}
