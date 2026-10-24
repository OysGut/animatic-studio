import { useMemo,useState } from 'react';
import { compareRevisions } from '@/core/storyboard/review';
import type { PanelSnapshotContent } from '@/core/storyboard';
import { t } from '@/core/i18n/keyed';
type Shared={id:string;title:string;expiresAt:string;panels:{key:string;label:string;revision:number;snapshot:PanelSnapshotContent}[]};
export function ReviewSetCompare({shares}:{shares:Shared[]}){
 const[a,setA]=useState(shares[0]?.id??''),[b,setB]=useState(shares[1]?.id??shares[0]?.id??'');
 const left=shares.find(s=>s.id===a),right=shares.find(s=>s.id===b);
 const changes=useMemo(()=>compareRevisions(left?.panels.map(p=>p.snapshot)??[],right?.panels.map(p=>p.snapshot)??[]),[left,right]);
 const options=shares.map(s=><option key={s.id} value={s.id}>{s.title} · {s.expiresAt}</option>);
 return <section className="space-y-2 border-t border-border py-3" data-testid="sb10-set-compare"><h3>{t('sb10.compare')}</h3><div className="flex flex-wrap gap-2"><select aria-label={t('sb10.before')} value={a} onChange={e=>setA(e.target.value)}>{options}</select><select aria-label={t('sb10.after')} value={b} onChange={e=>setB(e.target.value)}>{options}</select></div>{changes.map(c=><div key={c.id} className="grid grid-cols-2 gap-2 border-t border-border py-2"><span dir="auto">{left?.panels.find(p=>p.snapshot.composition.id===c.id)?.label??'—'}</span><span dir="auto">{right?.panels.find(p=>p.snapshot.composition.id===c.id)?.label??'—'} · {c.kind==='new'?t('sb10.new'):c.kind==='removed'?t('sb10.removed'):c.kind==='changed'?t('sb10.changed'):t('sb10.same')}</span></div>)}</section>;
}
