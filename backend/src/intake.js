// Imports public research candidates only; never accepts review status or credentials.
export async function importDrafts(env, validate, fetcher = fetch) {
 const response = await fetcher('https://raw.githubusercontent.com/achyuth-chinna/-india-for-all/main/backend/intake/research.json', {headers:{'Accept':'application/json'}, cf:{cacheTtl:0}});
 if (!response.ok) throw new Error('Research intake unavailable');
 const text = await response.text();
 if (text.length > 250000) throw new Error('Intake too large');
 const data = JSON.parse(text);
 if (!Array.isArray(data.items) || data.items.length > 50) throw new Error('Invalid intake envelope');
 // Validate the entire batch before writing anything.
 for (const item of data.items) {
  const error = validate(item);
  if (error) throw new Error('Invalid intake: '+error);
  const source = new URL(item.source_url);
  if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Invalid source URL');
 }
 let imported = 0;
 for (const item of data.items) {
  const identity = JSON.stringify([item.source_url.trim(),item.reporting_period.trim(),item.region.trim(),item.title.trim()]);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  const hex = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const id = hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20,32);
  const result = await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO research_items (id,title,summary,category,region,source_name,source_url,source_published_on,reporting_period,metric_value,metric_unit,evidence_note,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft')").bind(id,item.title.trim(),item.summary.trim(),item.category,item.region.trim(),item.source_name.trim(),item.source_url.trim(),item.source_published_on||null,item.reporting_period.trim(),item.metric_value||null,item.metric_unit||null,item.evidence_note||''),
   env.DB.prepare("INSERT INTO review_events(item_id,action,actor,note) SELECT ?, 'created', 'daily-intake', 'Imported as draft; editorial verification required' WHERE changes()=1").bind(id)
  ]);
  imported += result[0].meta?.changes || 0;
 }
 return {candidates:data.items.length,imported};
}
