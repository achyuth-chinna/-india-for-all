(() => {
 'use strict';
 const BASE='https://india-for-all-research-api.katojuachyuth.workers.dev';
 const $=id=>document.getElementById(id),tr=s=>window.SiteI18n?.t(s)||s;
 const store={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}},remove(k){try{localStorage.removeItem(k)}catch{}}};
 let token=store.get('ifa-community-session'),sessionPromise=null;
 async function connect(){if(token)return token;if(!sessionPromise)sessionPromise=fetch(BASE+'/api/community/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);token=j.token;store.set('ifa-community-session',token);return token}).finally(()=>sessionPromise=null);return sessionPromise}
 async function api(path,method='GET',data,privateRead=false){
  const headers={};if(method==='POST'||privateRead)headers['X-Community-Session']=await connect();
  if(data)headers['Content-Type']='application/json';
  const r=await fetch(BASE+path,{method,headers,body:data?JSON.stringify(data):undefined,cache:method==='GET'?'default':'no-store'});const j=await r.json();
  if(r.status===401){token=null;store.remove('ifa-community-session')}
  if(!r.ok)throw Error(j.error||'Service temporarily unavailable.');return j;
 }
 const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const authored=(tag,text,cls)=>{const n=element(tag,text,cls);n.setAttribute('translate','no');return n};
 function notice(text){if($('community-notice'))$('community-notice').textContent=text}
 async function action(button,task){button.disabled=true;try{await task()}catch(e){notice(e.message)}finally{button.disabled=false}}
 let campaignReaction=0,myVote=0,replyTo=null,nextRoot=null,roots=[],threads=new Map(),ownComments=new Set(),currentTopic=null;
 async function stats(){if(!$('support-count')||document.hidden)return;try{const j=await api('/api/community/stats');for(const [id,key] of [['support-count','support'],['oppose-count','oppose'],['comment-count','comments'],['like-count','likes'],['dislike-count','dislikes']])$(id).textContent=Number(j[key]||0).toLocaleString('en-IN')}catch(e){notice(e.message)}}
 async function supporters(){if(!$('supporters-list')||document.hidden)return;try{const j=await api('/api/community/supporters'),list=$('supporters-list');list.replaceChildren();if(!j.items.length){list.append(element('p','No public profiles yet. Be the first to share your support.'));return}for(const item of j.items){const card=element('article',undefined,'community-voice');card.append(authored('strong',[item.alias,item.city].filter(Boolean).join(' · ')),element('p',item.choice===1?'My vote is for education and healthcare.':'I disagree with this proposal.'));list.append(card)}}catch{}}
 function voteMessage(){if(!$('my-vote'))return;$('my-vote').textContent=myVote===1?'Your current vote: support.':myVote===-1?'Your current vote: disagree.':'You have not voted in this browser.'}
 async function me(){if(!token||!$('community'))return;try{const j=await api('/api/community/me','GET',undefined,true);ownComments=new Set(j.own_comments||[]);myVote=j.vote?.choice||0;campaignReaction=j.reaction;voteMessage();for(const [id,v] of [['campaign-like',1],['campaign-dislike',-1]])$(id).setAttribute('aria-pressed',String(campaignReaction===v));if(j.vote?.is_public){$('public-name').value=j.vote.alias;$('public-city').value=j.vote.city;$('profile-consent').checked=true}renderComments()}catch(e){notice(e.message)}}
 async function vote(value,button){await action(button,async()=>{await api('/api/community/vote','POST',{choice:value,alias:$('public-name').value,city:$('public-city').value,public_profile:$('profile-consent').checked});myVote=value;voteMessage();notice('Vote saved. Public totals may take up to 30 seconds to refresh.');await stats()})}
 async function react(target,value,button){await action(button,async()=>{const chosen=target==='campaign'&&campaignReaction===value?0:value;await api('/api/community/react','POST',{target_id:target,choice:chosen});if(target==='campaign'){campaignReaction=chosen;$('campaign-like').setAttribute('aria-pressed',String(chosen===1));$('campaign-dislike').setAttribute('aria-pressed',String(chosen===-1))}notice('Reaction saved. Counts refresh shortly.');await stats()})}
 function button(text,handler,cls='outline'){const b=element('button',text,cls);b.type='button';b.onclick=()=>handler(b);return b}
 function drawComment(item,children,seen=new Set()){
  if(seen.has(item.id))return element('div');seen.add(item.id);
  const card=element('article',undefined,'community-comment');card.dataset.commentId=item.id;
  if(item.topic){card.append(authored('h4',item.body))}else if(item.status==='hidden'){card.append(element('p','Comment hidden by moderator.','community-hidden'))}else{
   card.append(authored('strong',[item.alias,item.city].filter(Boolean).join(' · ')),authored('p',item.body,'comment-body'));
   const time=element('time',new Date(item.created_at*1000).toLocaleString(document.documentElement.lang||'en'));time.dateTime=new Date(item.created_at*1000).toISOString();card.append(time);
   const actions=element('div',undefined,'community-actions');
   actions.append(button(tr('Like')+' '+item.likes,b=>react(item.id,1,b)),button(tr('Dislike')+' '+item.dislikes,b=>react(item.id,-1,b)));
   if(item.depth<5)actions.append(button('Reply',()=>{replyTo=item.id;$('reply-context').textContent=tr('Replying to a comment');$('cancel-reply').hidden=false;$('comment-body').focus()}));
   actions.append(button('Report',b=>action(b,async()=>{await api('/api/community/report','POST',{comment_id:item.id});notice('Report sent to the moderator.')})));
   if(ownComments.has(item.id))actions.append(button('Remove my comment',b=>action(b,async()=>{if(!confirm(tr('Permanently remove your comment text and public details?')))return;await api('/api/community/remove-comment','POST',{id:item.id});notice('Comment removed. Public display refreshes shortly.');setTimeout(()=>comments(),16000)})));card.append(actions);
  }
  const nested=children.get(item.id)||[];if(nested.length){const holder=element('div',undefined,'comment-children');for(const child of nested)holder.append(drawComment(child,children,seen));card.append(holder)}
  return card;
 }
 function renderComments(){const list=$('comments-list');list.replaceChildren();if(!roots.length){list.append(element('p','No comments yet. Share your opinion.'));return}for(const root of roots){const thread=threads.get(root.id),byParent=new Map();for(const item of thread?.items||[]){if(item.id===root.id)continue;const a=byParent.get(item.parent_id)||[];a.push(item);byParent.set(item.parent_id,a)}const card=drawComment(root,byParent);card.append(button(thread?.next?'More replies':'View replies',b=>action(b,()=>loadThread(root.id,Boolean(thread?.next)))));list.append(card)}$('more-comments').hidden=!nextRoot}
 async function comments(more=false){try{const j=await api('/api/community/comments'+(more&&nextRoot?'?before='+nextRoot:''));roots=more?[...roots,...j.items]:[...(currentTopic?[currentTopic]:[]),...j.items];nextRoot=j.next;renderComments()}catch(e){notice(e.message)}}
 async function loadThread(root,more=false){const old=threads.get(root);const j=await api('/api/community/comments?root='+encodeURIComponent(root)+(more&&old?.next?'&after='+old.next:''));threads.set(root,{items:more?[...old.items,...j.items]:j.items,next:j.next});renderComments()}
 if($('community')){
  $('vote-support').onclick=()=>vote(1,$('vote-support'));$('vote-oppose').onclick=()=>vote(-1,$('vote-oppose'));
  $('vote-withdraw').onclick=()=>action($('vote-withdraw'),async()=>{await api('/api/community/withdraw','POST',{});myVote=0;voteMessage();notice('Your vote and public profile have been removed. Counts refresh shortly.');await stats()});
  $('campaign-like').onclick=()=>react('campaign',1,$('campaign-like'));$('campaign-dislike').onclick=()=>react('campaign',-1,$('campaign-dislike'));
  $('cancel-reply').onclick=()=>{replyTo=null;$('reply-context').textContent='';$('cancel-reply').hidden=true};
  $('comment-form').onsubmit=e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');action(b,async()=>{const j=await api('/api/community/comment','POST',{alias:$('comment-name').value,city:$('comment-city').value,body:$('comment-body').value,parent_id:replyTo,public_consent:$('comment-consent').checked});ownComments.add(j.id);$('comment-body').value='';$('comment-consent').checked=false;replyTo=null;$('reply-context').textContent='';$('cancel-reply').hidden=true;notice('Comment posted. It will appear after the short cache refresh.');setTimeout(()=>comments().then(()=>loadThread(j.root_id)).catch(()=>{}),16000)})};
  $('refresh-comments').onclick=()=>comments();$('more-comments').onclick=()=>comments(true);
  voteMessage();stats();supporters();comments();me();
  setInterval(()=>{if(!document.hidden){stats();supporters()}},30000);
  window.addEventListener('site:languagechange',()=>{voteMessage();renderComments()});
 }
 window.CommunityClient={api,connect,notice,openDiscussion:async(root,title)=>{currentTopic={id:root,root_id:root,parent_id:null,depth:0,topic:true,body:title,status:'hidden'};roots=[currentTopic,...roots.filter(x=>x.id!==root&&!x.topic)];replyTo=root;$('reply-context').textContent='Replying to a comment';$('cancel-reply').hidden=false;await loadThread(root);$('comment-body').focus()}};
 // Optional analytics. No event is sent until the visitor opts in.
 let heartbeat=null;
 async function visit(pageview){if(store.get('ifa-analytics')!=='yes'||document.hidden)return;try{await api('/api/community/visit','POST',{consent:true,path:location.pathname,pageview})}catch{}}
 function startAnalytics(){visit(true);if(!heartbeat)heartbeat=setInterval(()=>visit(false),60000)}
 function showAnalytics(){
  document.getElementById('analytics-choice')?.remove();const panel=element('aside',undefined,'analytics-choice');panel.id='analytics-choice';panel.setAttribute('aria-label','Visitor statistics');
  panel.append(element('p','Allow anonymous visitor statistics? We record your page, broad region and device category for up to 30 days. No names, raw IP addresses or precise location. Voting works without analytics.'));
  const allow=button('Allow statistics',async b=>{b.disabled=true;try{await api('/api/community/analytics-consent','POST',{consent:true});store.set('ifa-analytics','yes');panel.remove();startAnalytics()}catch{b.disabled=false}});const decline=button('No thanks',()=>{store.set('ifa-analytics','no');panel.remove();clearInterval(heartbeat);heartbeat=null;if(token)api('/api/community/forget-analytics','POST',{}).catch(()=>{})});panel.append(allow,decline);const link=element('a','Privacy and community rules');link.href='/privacy.html';panel.append(link);document.querySelector('footer').before(panel);
 }
 if(store.get('ifa-analytics')==='yes')startAnalytics();else if(!store.get('ifa-analytics'))showAnalytics();
 const settings=document.getElementById('analytics-settings');if(settings)settings.onclick=()=>showAnalytics();
 const stop=document.getElementById('analytics-stop');if(stop)stop.onclick=async()=>{store.set('ifa-analytics','no');clearInterval(heartbeat);heartbeat=null;try{if(token)await api('/api/community/forget-analytics','POST',{})}catch{}stop.textContent='Statistics disabled.'};
})();
