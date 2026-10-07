(() => {
  const state = { view:'overview', reportType:'corn', rows:[], summary:null, mode:'', sources:[], requestSeq:0, activeController:null, activeKey:'' };
  const reportCache = new Map();
  const reportRequests = new Map();
  const CLIENT_CACHE_LIMIT = 12;
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
  function fmt(v,d=2){ if(v===null||v===undefined||v==='') return '-'; const n=Number(v); return Number.isFinite(n)?n.toFixed(d):String(v); }
  function fmtDate(v){ if(!v) return '-'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}); }
  function statusClass(s){ const x=String(s||'unknown').toLowerCase(); if(x==='accept')return'accept';if(x==='reject')return'reject';if(x==='hold')return'hold';if(x==='measurement')return'measurement';return'unknown'; }
  function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

  async function api(path, options={}){ const r=await fetch(path, options); const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.error||`HTTP ${r.status}`); return body; }

  async function boot(){
    try{
      const h=await api('/api/health'); state.mode=h.mode;
      const pill=$('#mode-pill'); pill.textContent=h.mode==='legacy-api'?'LIVE ADAPTER':'DEMO MODE'; pill.classList.add(h.mode==='legacy-api'?'live':'demo');
      await Promise.all([loadSources(), loadReport('corn', true)]);
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
    const cacheKey=qs.toString();
    const requestId=++state.requestSeq;
    if(state.activeController && state.activeKey!==cacheKey) state.activeController.abort();
    $('#load-btn').textContent='Loading...'; $('#load-btn').disabled=true;
    try{
      let data=reportCache.get(cacheKey);
      if(!data){
        let pending=reportRequests.get(cacheKey);
        if(!pending){
          const controller=new AbortController();
          state.activeController=controller; state.activeKey=cacheKey;
          pending=api('/api/report?'+qs.toString(),{signal:controller.signal}).finally(()=>reportRequests.delete(cacheKey));
          reportRequests.set(cacheKey,pending);
        }
        data=await pending;
        reportCache.set(cacheKey,data);
        while(reportCache.size>CLIENT_CACHE_LIMIT) reportCache.delete(reportCache.keys().next().value);
      }
      if(requestId!==state.requestSeq) return;
      state.rows=data.rows; state.summary=data.summary;
      renderSummary(data.summary); renderTable(data.rows); renderActivity(data.rows); renderTrend(data.rows);
      $('#last-updated').textContent='Updated '+new Date().toLocaleTimeString('id-ID');
      updateExport(); if(!quiet) toast(`${data.rows.length} rows loaded`);
    }catch(e){
      if(e.name==='AbortError' || requestId!==state.requestSeq) return;
      state.rows=[]; state.summary=null; renderSummary(null); renderTable([], `Unable to load report: ${e.message}`); renderActivity([]); renderTrend([]); toast('Data source: '+e.message);
    }
    finally{
      if(requestId===state.requestSeq){ $('#load-btn').textContent='Load Report'; $('#load-btn').disabled=false; if(state.activeKey===cacheKey) state.activeController=null; }
    }
  }

  function renderSummary(s){
    s=s||{}; $('#kpi-total').textContent=s.total??0; $('#kpi-accept').textContent=s.accepted??0; $('#kpi-hold').textContent=s.hold??0; $('#kpi-reject').textContent=s.rejected??0; $('#kpi-moisture').textContent=s.avgMoisture==null?'-':fmt(s.avgMoisture,2)+'%'; $('#kpi-sources').textContent=s.activeSources??0;
  }

  function renderActivity(rows){
    const host=$('#activity-list'); if(!rows.length){host.className='activity-list empty-state';host.textContent='No records in selected period.';return}
    host.className='activity-list'; host.innerHTML=rows.slice(0,7).map(r=>`<div class="activity-row" data-key="${esc(r.rowKey)}"><div class="id">${esc(r.idLap||r.rowKey)}</div><div class="desc">${esc(r.truckNo||r.materialName||r.type)}<small>${esc(r.supplier||r.materialName||'')} · ${fmtDate(r.date)}</small></div><span class="badge ${statusClass(r.finalResult)}">${esc(r.finalResult)}</span></div>`).join('');
    host.querySelectorAll('.activity-row').forEach(el=>el.addEventListener('click',()=>openDetailLazy(rows.find(r=>r.rowKey===el.dataset.key))));
  }

  function renderTrend(rows){
    const host=$('#trend-chart'), summary=$('#trend-summary');
    const daily=new Map();
    rows.forEach(row=>{
      const date=new Date(row.date);
      if(Number.isNaN(date.getTime())) return;
      const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
      daily.set(key,(daily.get(key)||0)+1);
    });
    if(daily.size){
      const start=new Date(`${$('#start-date').value}T00:00:00`),end=new Date(`${$('#end-date').value}T00:00:00`);
      const days=Number.isNaN(start.getTime())||Number.isNaN(end.getTime())?Infinity:Math.floor((end-start)/86400000)+1;
      if(days>0&&days<=366){
        for(const date=new Date(start);date<=end;date.setDate(date.getDate()+1)){
          const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
          if(!daily.has(key)) daily.set(key,0);
        }
      }
    }
    const points=[...daily.entries()].sort(([a],[b])=>a.localeCompare(b));
    const total=points.reduce((sum,[,value])=>sum+value,0);
    summary.textContent=`${total} transaction${total===1?'':'s'} · ${points.length} day${points.length===1?'':'s'}`;
    if(!points.length){ host.className='trend-chart empty-state'; host.textContent='No dated records in selected period.'; return; }

    const width=520,height=250,pad={top:16,right:14,bottom:42,left:42};
    const plotWidth=width-pad.left-pad.right,plotHeight=height-pad.top-pad.bottom;
    const maximum=Math.max(...points.map(([,value])=>value));
    const yMaximum=Math.max(4,Math.ceil(maximum/4)*4);
    const xAt=index=>points.length===1?pad.left+plotWidth/2:pad.left+(index/(points.length-1))*plotWidth;
    const yAt=value=>pad.top+plotHeight-(value/yMaximum)*plotHeight;
    const line=points.map(([,value],index)=>`${index?'L':'M'} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`).join(' ');
    const area=`${line} L ${xAt(points.length-1).toFixed(1)} ${pad.top+plotHeight} L ${xAt(0).toFixed(1)} ${pad.top+plotHeight} Z`;
    const labelStep=Math.max(1,Math.ceil(points.length/6));
    const grid=[0,1,2,3,4].map(index=>{
      const value=yMaximum-(yMaximum/4)*index,y=pad.top+(plotHeight/4)*index;
      return `<line class="trend-grid" x1="${pad.left}" y1="${y}" x2="${width-pad.right}" y2="${y}"></line><text class="trend-axis-label" x="${pad.left-9}" y="${y+4}" text-anchor="end">${value}</text>`;
    }).join('');
    const labels=points.map(([key],index)=>({key,index}));
    const xLabels=labels.filter(({index})=>index===0||index===points.length-1||index%labelStep===0).map(({key,index})=>{
      const date=new Date(`${key}T00:00:00`),label=date.toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
      return `<text class="trend-axis-label" x="${xAt(index)}" y="${height-13}" text-anchor="middle">${esc(label)}</text>`;
    }).join('');
    const dots=points.map(([key,value],index)=>{
      if(points.length>31&&value===0) return '';
      const label=new Date(`${key}T00:00:00`).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
      return `<circle class="trend-dot" cx="${xAt(index)}" cy="${yAt(value)}" r="4"><title>${esc(label)}: ${value} transactions</title></circle>`;
    }).join('');
    host.className='trend-chart';
    host.innerHTML=`<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily QC transaction volume"><defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c61920" stop-opacity=".22"></stop><stop offset="100%" stop-color="#c61920" stop-opacity=".02"></stop></linearGradient></defs>${grid}<path class="trend-area" d="${area}"></path><path class="trend-line" d="${line}"></path>${dots}${xLabels}</svg><div class="trend-legend"><span><i></i>Transactions per day</span><strong>Peak ${maximum}</strong></div>`;
  }

  function renderTable(rows, emptyMessage='Choose a date range and load the report.'){
    const body=$('#report-body'),empty=$('#table-empty'); $('#result-count').textContent=`${rows.length} rows`;
    empty.textContent=emptyMessage;
    if(!rows.length){ body.innerHTML=''; empty.style.display='block'; return } empty.style.display='none';
    body.innerHTML=rows.map(r=>`<tr data-key="${esc(r.rowKey)}"><td data-label="Date">${fmtDate(r.date)}</td><td data-label="ID_LAP"><b>${esc(r.idLap||'–')}</b></td><td data-label="Truck">${esc(r.truckNo||'–')}</td><td data-label="PO">${esc(r.poNumber||'–')}</td><td data-label="Supplier">${esc(r.supplier||'–')}</td><td data-label="Material">${esc(r.materialCode||'')} ${esc(r.materialName||'')}</td><td data-label="Moisture">${fmt(r.moisture)}</td><td data-label="Density">${fmt(r.density)}</td><td data-label="Result"><span class="badge ${statusClass(r.finalResult)}">${esc(r.finalResult)}</span></td><td data-label="Source">${(r.source||[]).map(s=>`<span class="source-chip">${esc(s)}</span>`).join('')}</td></tr>`).join('');
    body.querySelectorAll('tr').forEach(el=>el.addEventListener('click',()=>openDetailLazy(rows.find(r=>r.rowKey===el.dataset.key))));
  }

  function openDetail(r){ if(!r)return; $('#modal-title').textContent=r.idLap||r.rowKey; const items=[['Type',r.type],['Date',fmtDate(r.date)],['ID_LAP',r.idLap],['ID Antrian',r.idAntrian],['QC Doc',r.qcDoc],['Truck',r.truckNo],['Truck Type',r.truckType],['PO',r.poNumber],['Shelter',r.shelter],['Supplier',r.supplier],['Material Code',r.materialCode],['Material',r.materialName],['Sampling 1',r.sampling1],['Sampling 2',r.sampling2],['Final Result',r.finalResult],['Reason',r.reason],['Moisture',fmt(r.moisture)],['Moisture 2',fmt(r.moisture2)],['Density',fmt(r.density)],['Density 2',fmt(r.density2)],['Screen Test',fmt(r.screenTest)],['Temperature',fmt(r.temperature)],['Operator',r.operator],['Source',(r.source||[]).join(' + ')]];
    $('#modal-body').innerHTML=`<div class="detail-grid">${items.map(([k,v])=>`<div class="detail-item"><label>${esc(k)}</label><strong>${esc(v||'–')}</strong></div>`).join('')}</div><div class="trace-box"><h3>Raw source payload</h3><pre>${esc(JSON.stringify(r.raw,null,2))}</pre></div>`;
    $('#detail-modal').classList.add('open'); $('#detail-modal').setAttribute('aria-hidden','false');
  }
  async function openDetailLazy(r){
    if(!r)return;
    $('#modal-title').textContent=r.idLap||r.rowKey;
    $('#modal-body').innerHTML='<div class="empty-state">Loading record detail...</div>';
    $('#detail-modal').classList.add('open'); $('#detail-modal').setAttribute('aria-hidden','false');
    let detail=r;
    if(!detail.raw){
      const qs=new URLSearchParams({type:r.type,start:$('#start-date').value,end:$('#end-date').value,rowKey:r.rowKey});
      try{ const response=await api('/api/report/detail?'+qs.toString()); detail=response.row; }
      catch(e){ $('#modal-body').innerHTML=`<div class="empty-state">Unable to load detail: ${esc(e.message)}</div>`; return; }
    }
    const items=[['Type',detail.type],['Date',fmtDate(detail.date)],['ID_LAP',detail.idLap],['ID Antrian',detail.idAntrian],['QC Doc',detail.qcDoc],['Truck',detail.truckNo],['Truck Type',detail.truckType],['PO',detail.poNumber],['Shelter',detail.shelter],['Supplier',detail.supplier],['Material Code',detail.materialCode],['Material',detail.materialName],['Sampling 1',detail.sampling1],['Sampling 2',detail.sampling2],['Final Result',detail.finalResult],['Reason',detail.reason],['Moisture',fmt(detail.moisture)],['Moisture 2',fmt(detail.moisture2)],['Density',fmt(detail.density)],['Density 2',fmt(detail.density2)],['Screen Test',fmt(detail.screenTest)],['Temperature',fmt(detail.temperature)],['Operator',detail.operator],['Source',(detail.source||[]).join(' + ')]];
    $('#modal-body').innerHTML=`<div class="detail-grid">${items.map(([k,v])=>`<div class="detail-item"><label>${esc(k)}</label><strong>${esc(v===null||v===undefined||v===''?'-':v)}</strong></div>`).join('')}</div><div class="trace-box"><h3>Raw source payload</h3><pre>${esc(JSON.stringify(detail.raw||{},null,2))}</pre></div>`;
  }

  function closeModal(){ $('#detail-modal').classList.remove('open'); $('#detail-modal').setAttribute('aria-hidden','true'); }

  function updateExport(){ const qs=new URLSearchParams({type:state.reportType,start:$('#start-date').value,end:$('#end-date').value,format:'xlsx'}); if($('#search').value)qs.set('search',$('#search').value); if($('#status-filter').value)qs.set('status',$('#status-filter').value); $('#export-btn').href='/api/export?'+qs.toString(); }

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
