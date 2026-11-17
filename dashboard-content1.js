(async()=>{
const target=document.getElementById('reviewed-feed');if(!target)return;
const base=location.hostname.endsWith('.workers.dev')?'https://india-for-all-research-api.katojuachyuth.workers.dev':'https://api.wevotefor.in';
const make=(tag,value)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;return el};
const render=async()=>{
 try{
 const [candidateResponse,approvedResponse]=await Promise.all([fetch(base+'/api/research/latest'),fetch(base+'/api/research?limit=20')]);
 if(!candidateResponse.ok||!approvedResponse.ok)throw Error('Feed unavailable');
 const candidates=(await candidateResponse.json()).items||[],approved=(await approvedResponse.json()).items||[];
 const approvedIds=new Set(approved.map(x=>[x.title,x.source_url,x.reporting_period].join('|')));
 const fresh=candidates.filter(x=>!approvedIds.has([x.title,x.source_url,x.reporting_period].join('|')));
 target.replaceChildren();
 const intro=make('p','Updated from the research intake every few minutes. Published research may refer to older reporting years. Source-linked candidates below have NOT yet passed independent editorial verification.');intro.className='meta';target.append(intro);
 const updated=make('p','Feed checked: '+new Date().toLocaleString());updated.className='meta';target.append(updated);
 const section=(label,items,verified)=>{const heading=make('h3',label+' ('+items.length+')');target.append(heading);
 if(!items.length){target.append(make('p','No entries available.'));return}
 for(const item of items){const card=make('article');card.style.cssText='margin:18px 0;padding:14px 0;border-bottom:1px solid #52636a';const title=make('h4',item.title),summary=make('p',item.summary),meta=make('p',item.region+' · Reporting period: '+item.reporting_period+' · Source: '+item.source_name+(item.source_published_on?' · Source published: '+item.source_published_on:''));meta.className='meta';const label=make('p',verified?'Editorially approved':'Source-linked candidate — not yet independently verified');label.className='meta';const link=make('a','Original source ↗');link.href=item.source_url;link.target='_blank';link.rel='noopener noreferrer';card.append(title,summary,meta,label,link);target.append(card)}};
 section('Editorially approved research',approved,true);section('Daily research candidates — verification pending',fresh,false);
 }catch(e){target.textContent='Daily research feed temporarily unavailable. Please try again later.'}
};await render();
})();