// Repository approval manifests contain public evidence only, never credentials.
const fields = ['title','summary','category','region','source_name','source_url','source_published_on','reporting_period','metric_value','metric_unit','evidence_note'];
export const sameResearch = (a,b) => fields.every(key => (a[key] ?? '') === (b[key] ?? ''));
export async function publishApproved(env, validate, fetcher = fetch) {
 const response = await fetcher('https://raw.githubusercontent.com/achyuth-chinna/-india-for-all/main/backend/intake/approved.json', {headers:{Accept:'application/json'},cf:{cacheTtl:0}});
 if(!response.ok) throw Error('Approval manifest unavailable');
 const text = await response.text();
 if(text.length > 500000) throw Error('Approval manifest too large');
 const data=JSON.parse(text);
 if(!Array.isArray(data.items)||data.items.length>50) throw Error('Invalid approval manifest');
 for(const entry of data.items) {
  if(validate(entry.item)||typeof entry.review_note!=='string'||!entry.review_note.trim()||entry.review_note.length>3000||entry.reviewed_by!=='automated-source-review'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_at)) throw Error('Invalid approval evidence');
 }
 let published=0, skipped=0;
 for(const entry of data.items) {
  const item=entry.item;
  // Match the complete reviewed snapshot, including caveats; never override rejections.
  const result=await env.DB.prepare("SELECT * FROM research_items WHERE source_url=? AND reporting_period=? AND region=? AND title=? AND status IN ('draft','in_review')").bind(item.source_url.trim(),item.reporting_period.trim(),item.region.trim(),item.title.trim()).all();
  for(const row of result.results||[]) {
   if(!sameResearch(row,item)){skipped++;continue;}
   const predicates=fields.map(key=>`COALESCE(${key},'')=?`).join(' AND ');
   const batch=await env.DB.batch([
    env.DB.prepare(`UPDATE research_items SET status='published',reviewed_by=?,reviewed_at=?,published_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND status IN ('draft','in_review') AND ${predicates}`).bind(entry.reviewed_by,entry.reviewed_at,row.id,...fields.map(key=>item[key]??'')),
    env.DB.prepare("INSERT INTO review_events(item_id,action,actor,note) SELECT ?, 'publish', ?, ? WHERE changes()=1").bind(row.id,entry.reviewed_by,entry.review_note)
   ]);
   published+=batch[0].meta?.changes||0;
  }
 }
 return {approved:data.items.length,published,skipped};
}
