(() => {
  const state = { view:'overview', reportType:'corn', rows:[], summary:null, mode:'', sources:[] };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const titles = {
    overview:['Operational E-Report','corn','ALL / SUMMARY'],
    corn:['Corn Q1ST Report','corn','DATAQC + BulkSampler20'],
    rmlocal:['RM Local Q1ST Report','rmlocal','DATAQC'],
    moisture:['Moisture Analysis / PRG','moisture','BulkSampler20'],
    kett:['Kett / Dryer Report','kett','DATAPRODUKSI'],
    vdm:['Videometer Report','vdm','DATAQC + BulkSampler20'],
    sources:['Data Source Monitor',null,'INTEGRATION STATUS']
  };

  function isoDate(d){ return d.toISOString().slice(0,10); }
  const now = new Date();
  const ago = new Date(now); ago.setDate(now.getDate()-7);
  $('#start-date').value = isoDate(ago); $('#end-date').value = isoDate(now);

  function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }
  function fmt(v,d=2){ if(v===null||v===undefined||v==='') return '–'; const n=Number(v); return Number.isFinite(n)?n.toFixed(d):String(v); }
  function fmtDate(v){ if(!v) return '–'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}); }
  function statusClass(s){ const x=String(s||'unknown').toLowerCase(); if(x==='accept')return'accept';if(x==='reject')return'reject';if(x==='hold')return'hold';if(x==='measurement')return'measurement';return'unknown'; }
  function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function api(path){ const r=await fetch(path); const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.error||`HTTP ${r.status}`); return body; }

  async function boot(){
    try{
      const h=await api('/api/health'); state.mode=h.mode;
      const pill=$('#mode-pill'); pill.textContent=h.mode==='legacy-api'?'LIVE ADAPTER':'DEMO MODE'; pill.classList.add(h.mode==='legacy-api'?'live':'demo');
      await loadSources();
      await loadReport('corn', true);
    }catch(e){ toast(e.message); }
  }

  function showView(view){
    state.view=view;
    $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
    $$('.view').forEach(x=>x.classList.remove('active'));
    $('#filter-panel').style.display = view==='sources' ? 'none' : 'grid';
    const [title,type,kicker]=titles[view]; $('#page-title').textContent=title;
    if(view==='overview') $('#overview-view').classList.add('active');
    else if(view==='sources') $('#sources-view').classList.add('active');
    else { $('#report-view').classList.add('active'); $('#report-title').textContent=title; $('#report-kicker').textContent=kicker; state.reportType=type; loadReport(type); }
  }

  async function loadReport(type=state.reportType, quiet=false){
    if(!type) return;
    state.reportType=type;
    const start=$('#start-date').value,end=$('#end-date').value,search=$('#search').value,status=$('#status-filter').value;
    const qs=new URLSearchParams({type,start,end}); if(search)qs.set('search',search); if(status)qs.set('status',status);
    $('#load-btn').textContent='Loading…'; $('#load-btn').disabled=true;
    try{
      const data=await api('/api/report?'+qs.toString()); state.rows=data.rows; state.summary=data.summary;
      renderSummary(data.summary); renderTable(data.rows); renderActivity(data.rows);
      $('#last-updated').textContent='Updated '+new Date().toLocaleTimeString('id-ID');
      updateExport(); if(!quiet) toast(`${data.rows.length} rows loaded`);
    }catch(e){ state.rows=[]; renderTable([]); toast('Data source: '+e.message); }
    finally{ $('#load-btn').textContent='Load Report'; $('#load-btn').disabled=false; }
  }

  function renderSummary(s){
    s=s||{}; $('#kpi-total').textContent=s.total??0; $('#kpi-accept').textContent=s.accepted??0; $('#kpi-hold').textContent=s.hold??0; $('#kpi-reject').textContent=s.rejected??0; $('#kpi-moisture').textContent=s.avgMoisture==null?'–':fmt(s.avgMoisture,2)+'%'; $('#kpi-sources').textContent=s.activeSources??0;
  }

  function renderActivity(rows){
    const host=$('#activity-list'); if(!rows.length){host.className='activity-list empty-state';host.textContent='No records in selected period.';return}
    host.className='activity-list'; host.innerHTML=rows.slice(0,7).map(r=>`<div class="activity-row" data-key="${esc(r.rowKey)}"><div class="id">${esc(r.idLap||r.rowKey)}</div><div class="desc">${esc(r.truckNo||r.materialName||r.type)}<small>${esc(r.supplier||r.materialName||'')} · ${fmtDate(r.date)}</small></div><span class="badge ${statusClass(r.finalResult)}">${esc(r.finalResult)}</span></div>`).join('');
    host.querySelectorAll('.activity-row').forEach(el=>el.addEventListener('click',()=>openDetail(rows.find(r=>r.rowKey===el.dataset.key))));
  }

  function renderTable(rows){
    const body=$('#report-body'),empty=$('#table-empty'); $('#result-count').textContent=`${rows.length} rows`;
    if(!rows.length){ body.innerHTML=''; empty.style.display='block'; return } empty.style.display='none';
    body.innerHTML=rows.map(r=>`<tr data-key="${esc(r.rowKey)}"><td>${fmtDate(r.date)}</td><td><b>${esc(r.idLap||'–')}</b></td><td>${esc(r.truckNo||'–')}</td><td>${esc(r.poNumber||'–')}</td><td>${esc(r.supplier||'–')}</td><td>${esc(r.materialCode||'')} ${esc(r.materialName||'')}</td><td>${fmt(r.moisture)}</td><td>${fmt(r.density)}</td><td><span class="badge ${statusClass(r.finalResult)}">${esc(r.finalResult)}</span></td><td>${(r.source||[]).map(s=>`<span class="source-chip">${esc(s)}</span>`).join('')}</td></tr>`).join('');
    body.querySelectorAll('tr').forEach(el=>el.addEventListener('click',()=>openDetail(rows.find(r=>r.rowKey===el.dataset.key))));
  }

  function openDetail(r){ if(!r)return; $('#modal-title').textContent=r.idLap||r.rowKey; const items=[['Type',r.type],['Date',fmtDate(r.date)],['ID_LAP',r.idLap],['ID Antrian',r.idAntrian],['QC Doc',r.qcDoc],['Truck',r.truckNo],['Truck Type',r.truckType],['PO',r.poNumber],['Shelter',r.shelter],['Supplier',r.supplier],['Material Code',r.materialCode],['Material',r.materialName],['Sampling 1',r.sampling1],['Sampling 2',r.sampling2],['Final Result',r.finalResult],['Reason',r.reason],['Moisture',fmt(r.moisture)],['Moisture 2',fmt(r.moisture2)],['Density',fmt(r.density)],['Density 2',fmt(r.density2)],['Screen Test',fmt(r.screenTest)],['Temperature',fmt(r.temperature)],['Operator',r.operator],['Source',(r.source||[]).join(' + ')]];
    $('#modal-body').innerHTML=`<div class="detail-grid">${items.map(([k,v])=>`<div class="detail-item"><label>${esc(k)}</label><strong>${esc(v||'–')}</strong></div>`).join('')}</div><div class="trace-box"><h3>Raw source payload</h3><pre>${esc(JSON.stringify(r.raw,null,2))}</pre></div>`;
    $('#detail-modal').classList.add('open'); $('#detail-modal').setAttribute('aria-hidden','false');
  }
  function closeModal(){ $('#detail-modal').classList.remove('open'); $('#detail-modal').setAttribute('aria-hidden','true'); }

  function updateExport(){ const qs=new URLSearchParams({type:state.reportType,start:$('#start-date').value,end:$('#end-date').value}); if($('#search').value)qs.set('search',$('#search').value); if($('#status-filter').value)qs.set('status',$('#status-filter').value); $('#export-btn').href='/api/export?'+qs.toString(); }

  async function loadSources(){
    const d=await api('/api/source-status'); state.sources=d.sources;
    $('#source-grid').innerHTML=d.sources.map(s=>`<article class="source-card" data-source="${esc(s.id)}"><div class="source-card-top"><div><h3>${esc(s.name)}</h3><p>${esc(s.role)}</p></div><span class="probe-status" id="probe-${esc(s.id)}">Configured</span></div><div class="source-meta">Via: <b>${esc(s.via)}</b><br>Reports: ${esc((s.reports||[]).join(', ')||'legacy manual data')}</div></article>`).join('');
  }

  async function probeAll(){
    const map={dataqc:'corn',bulk1:'moisture',production:'kett'}; for(const [source,type] of Object.entries(map)){ const el=$(`#probe-${source}`); if(!el)continue; el.textContent='Testing…';el.className='probe-status'; try{const r=await api('/api/probe?type='+type);el.textContent=`OK · ${r.latencyMs}ms`;el.classList.add('ok')}catch(e){el.textContent='Unavailable';el.classList.add('fail')}}
    const q=$('#probe-qcportal'); if(q){q.textContent='Not used';}
  }

  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#load-btn').addEventListener('click',()=>loadReport());
  $('#refresh-btn').addEventListener('click',()=>loadReport());
  $('#print-btn').addEventListener('click',()=>window.print());
  $('#probe-all').addEventListener('click',probeAll);
  $('#search').addEventListener('keydown',e=>{if(e.key==='Enter')loadReport()});
  $('#status-filter').addEventListener('change',()=>loadReport());
  $$('[data-close]').forEach(x=>x.addEventListener('click',closeModal));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

  boot();
})();
