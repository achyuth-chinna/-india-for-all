/* Public pages only. Local dictionaries; no third-party translation service. */
(() => {
 'use strict';
 const languages = {en:'English',hi:'हिन्दी',te:'తెలుగు',ta:'தமிழ்',bn:'বাংলা',mr:'मराठी',kn:'ಕನ್ನಡ',ml:'മലയാളം'};
 const cache = {en:{}};
 const originals = new WeakMap(), attributes = new WeakMap();
 let locale='en', dictionary={}, revision=0, queued=false;
 const normalize = s => s.trim().replace(/\s+/g,' ');
 function t(text) {
  const key=normalize(text);
  if(Object.hasOwn(dictionary,key))return dictionary[key];
  // Published feed metadata combines region, period and publisher.
  if(key.includes(' · '))return key.split(' · ').map(x=>dictionary[x]||x).join(' · ');
  return text;
 }
 function translateNode(node) {
  if(!node.parentElement || node.parentElement.closest('script,style,noscript,#language,[translate="no"]'))return;
  const value=node.nodeValue;
  let record=originals.get(node);
  if(!record || value!==record.last){record={original:value,last:value};originals.set(node,record)}
  const source=record.original, key=normalize(source);
  if(!key)return;
  const translated=t(key);
  const leading=source.match(/^\s*/)[0], trailing=source.match(/\s*$/)[0];
  const next=leading+translated+trailing;
  if(value!==next)node.nodeValue=next;
  record.last=next;
 }
 function apply() {
  observer.disconnect();
  const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())translateNode(walker.currentNode);
  document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el=>{
   if(el.closest('[translate="no"]'))return;
   let records=attributes.get(el);if(!records){records={};attributes.set(el,records)}
   for(const name of ['placeholder','aria-label','title']){
    if(!el.hasAttribute(name))continue;
    const value=el.getAttribute(name);let r=records[name];
    if(!r || value!==r.last)r=records[name]={original:value,last:value};
    const next=t(r.original);if(next!==value)el.setAttribute(name,next);r.last=next;
   }
  });
  document.documentElement.lang=locale;
  observer.observe(document.body,{childList:true,characterData:true,subtree:true});
 }
 const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply()})});
 async function setLanguage(next) {
  if(!Object.hasOwn(languages,next))next='en';
  const current=++revision, select=document.getElementById('language');
  try {
   if(!cache[next]){
    const response=await fetch('/locales/'+next+'.json?v=20261114',{cache:'no-cache'});
    if(!response.ok)throw Error('Language unavailable');
    cache[next]=await response.json();
   }
   if(current!==revision)return;
   locale=next;dictionary=cache[next];select.value=next;
   try{localStorage.setItem('indiaforall-language',next)}catch{}
   apply();document.getElementById('language-error').textContent='';
   window.dispatchEvent(new CustomEvent('site:languagechange',{detail:{language:locale}}));
  }catch{
   if(current!==revision)return;
   select.value=locale;
   document.getElementById('language-error').textContent='Translation could not load. Please try again. / अनुवाद लोड नहीं हुआ। फिर से प्रयास करें।';
  }
 }
 const header=document.querySelector('header');
 let select=document.getElementById('language');
 if(!select){
  const label=document.createElement('label');label.className='site-language';
  const span=document.createElement('span');span.className='sr-only';span.textContent='Select language';
  select=document.createElement('select');select.id='language';select.setAttribute('aria-label','Select language');
  for(const [value,text] of Object.entries(languages))select.add(new Option(text,value));
  label.append(span,select);header.append(label);
 }
 const error=document.createElement('p');error.id='language-error';error.setAttribute('role','status');error.setAttribute('translate','no');header.after(error);
 select.addEventListener('change',event=>setLanguage(event.target.value));
 window.SiteI18n={t,setLanguage,get language(){return locale}};
 let saved='en';try{saved=localStorage.getItem('indiaforall-language')||'en'}catch{}
 setLanguage(saved);
})();
