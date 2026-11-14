(() => {
 const $=id=>document.getElementById(id),client=window.CommunityClient;
 if(!$('public-posts')||!$('issue-form')||!client)return;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const authored=(tag,text)=>{const n=el(tag,text);n.setAttribute('translate','no');return n};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.className='outline';b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){$('issue-notice').textContent=e.message}finally{b.disabled=false}};return b};
 let items=[],cursor=null;
 async function list(more=false){try{const j=await client.api('/api/community/posts'+(more&&cursor?'?before='+cursor:''));items=more?[...items,...j.items]:j.items;cursor=j.next;const area=$('issue-list');area.replaceChildren();if(!items.length)area.append(el('p','No approved posts yet.'));for(const p of items){const card=el('article');card.className='community-comment';card.append(authored('h4',p.title),authored('strong',[p.alias,p.city].filter(Boolean).join(' · ')),authored('p',p.body));if(p.media_id){const media=el(p.kind==='photo'?'img':'video');media.src='https://india-for-all-research-api.katojuachyuth.workers.dev/api/community/media/'+p.media_id;media.style.maxWidth='100%';if(p.kind==='photo'){media.alt=p.title;media.loading='lazy'}else{media.controls=true;media.preload='none'}card.append(media)}else if(p.media_url){const a=el('a',p.kind==='photo'?'Open photo in a new tab ↗':'Open video in a new tab ↗');a.href=p.media_url;a.target='_blank';a.rel='noopener noreferrer nofollow ugc';card.append(a,el('p','External media opens only when you choose to view it.'))}const actions=el('div');actions.className='community-actions';actions.append(button('Discuss this post',()=>client.openDiscussion(p.root_id,p.title)),button('Report post',async()=>{await client.api('/api/community/post-report','POST',{id:p.id});$('issue-notice').textContent='Report sent to the moderator.'}));card.append(actions);area.append(card)}$('issue-more').hidden=!cursor}catch(e){$('issue-notice').textContent=e.message}}
 client.api('/api/community/uploads').then(j=>{if(j.enabled){$('issue-file').disabled=false;$('upload-note').textContent='Images up to 5 MB; videos up to 25 MB. JPEG, PNG, WebP, MP4 or WebM. Uploads remain private until approval.'}}).catch(()=>{});
 $('issue-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{
  let mediaId=null;const kind=$('issue-kind').value,file=$('issue-file').files[0];
  if(file&&kind!=='text'){
   const r=await fetch('https://india-for-all-research-api.katojuachyuth.workers.dev/api/community/uploads',{method:'POST',headers:{'X-Community-Session':await client.connect(),'Content-Type':file.type},body:file});const j=await r.json();if(!r.ok)throw Error(j.error);mediaId=j.id;
  }
  await client.api('/api/community/posts','POST',{alias:$('issue-name').value,city:$('issue-city').value,title:$('issue-title').value,body:$('issue-body').value,kind,media_url:$('issue-link').value,media_id:mediaId,consent:$('issue-consent').checked});e.target.reset();$('issue-notice').textContent='Submission received. It will be public only after administrator approval.';
 }catch(error){$('issue-notice').textContent=error.message}finally{b.disabled=false}};
 $('issue-more').onclick=()=>list(true);list();
})();
