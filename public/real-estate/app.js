const $ = (s) => document.querySelector(s);
const regions = [
  {name:'Duhok',kurdish:'دهۆک',lat:36.867,lng:42.988,available:true},
  {name:'Erbil',kurdish:'هەولێر',lat:36.191,lng:44.009},
  {name:'Sulaymaniyah',kurdish:'سلێمانی',lat:35.558,lng:45.435},
  {name:'Halabja',kurdish:'هەڵەبجە',lat:35.177,lng:45.986}
];
const duhokDistricts = [
  {name:'Duhok',lat:36.867,lng:42.988,zoom:13},
  {name:'Zakho',lat:37.145,lng:42.682,zoom:13},
  {name:'Semel',lat:36.859,lng:42.848,zoom:13},
  {name:'Amedi',lat:37.092,lng:43.488,zoom:13},
  {name:'Akre',lat:36.743,lng:43.891,zoom:13},
  {name:'Bardarash',lat:36.498,lng:43.583,zoom:13},
  {name:'Shekhan',lat:36.695,lng:43.354,zoom:13}
];
let districts=duhokDistricts;
const listings = SOURCED_LISTINGS;
regions.forEach(r=>{r.available=true;r.slug=r.name.toLowerCase();});
function regionByName(name){return regions.find(r=>r.name===name)||regions[0];}
function regionAreas(name){
  const base=name==='Duhok'?duhokDistricts:[];
  return [...base,...[...new Set(listings.filter(p=>p.region===name).map(p=>p.district))].filter(area=>!base.some(d=>d.name===area)).sort().map(area=>{
    const p=listings.find(p=>p.region===name&&p.district===area&&mapPosition(p));
    const point=p?mapPosition(p):null;return {name:area,lat:point?.[0],lng:point?.[1],zoom:14,sourceArea:true};
  })];
}
function hasPlayableVideo(p){return (p.videos||[]).some(v=>v.embedAvailable===true&&normalizeVideoLink(v.url));}
function regionInventory(name){return listings.filter(p=>p.region===name);}

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hasVerifiedLocation = p => p.location.status==='verified' && Number.isFinite(p.lat) && Number.isFinite(p.lng);
// Display source evidence without promoting it to a verified property position.
function mapPosition(p){
  const point=hasVerifiedLocation(p)?[p.lat,p.lng]:[p.location.sourceLat,p.location.sourceLng];
  return point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180?point:null;
}
const pointAreas=new Map();
for(const p of listings){const pos=mapPosition(p);if(!pos)continue;const key=pos.join(',');if(!pointAreas.has(key))pointAreas.set(key,new Set());pointAreas.get(key).add(p.neighborhood);}
function sourcePointConflict(p){const point=mapPosition(p);return !!point&&!hasVerifiedLocation(p)&&(pointAreas.get(point.join(','))?.size||0)>1;}
function groupMapListings(items,project){
 const groups=[],buckets=new Map(),exact=new Map(),size=75;
 for(const p of items){const position=mapPosition(p);if(!position)continue;
  if(!project){const key=position.join(',');let g=exact.get(key);if(!g){g={position,projected:null,items:[]};groups.push(g);exact.set(key,g);}g.items.push(p);continue;}
  const projected=project(position),x=Math.floor(projected.x/size),y=Math.floor(projected.y/size);let group;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const g of buckets.get((x+dx)+','+(y+dy))||[])if(Math.hypot(g.projected.x-projected.x,g.projected.y-projected.y)<size&&(!group||g.index<group.index))group=g;
  if(group)group.items.push(p);else{group={position,projected,items:[p],index:groups.length};groups.push(group);const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(group);}
 }return groups;
}
function inMapView(p){const point=mapPosition(p);return !!point&&(!map||map.getBounds().contains(point));}
const formatDate = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
function listingVisual(p, extra=''){
  const photos=getListingPhotos(p),photo=photos[0];
  if(!photo)return '';
  return `<div class="listing-visual property-photo ${extra}"><img src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.alt)}" loading="lazy"><span>${photo.kind==='example'?'Example photo · not this property':photos.length+' advertiser photo'+(photos.length===1?'':'s')}</span>${hasPlayableVideo(p)?'<b class="video-badge">▷ Video</b>':''}</div>`;
}
function propertyFacts(p){
  return `${p.type==='Land'?'<span>Residential land</span>':`${p.beds!==null?`<span>${p.beds} beds</span>`:''}${p.baths!==null?`<span>${p.baths} baths</span>`:''}`}<span>${p.area} m²</span>`;
}
function locationDetails(p){
  return `<section class="location-evidence" aria-label="Location and property evidence">
    <div class="location-status">EXACT LOCATION NOT VERIFIED</div><h3>About this location</h3>
    <dl><dt>Advertised area</dt><dd>${escapeHTML(p.neighborhood)}, ${escapeHTML(p.region)}</dd>
    <dt>Property type</dt><dd>${p.type} — reported by the advertiser</dd>
    <dt>Measured accuracy</dt><dd>Unknown; no surveyed location supplied</dd>
    <dt>${p.type==='Land'?'Parcel boundary':'Building location'}</dt><dd>Not verified</dd>
    ${p.type==='Apartment'?`<dt>Advertised floor</dt><dd>${escapeHTML(p.location.floor || 'Not supplied')}</dd><dt>Apartment unit</dt><dd>Not supplied or verified</dd>`:''}</dl>
    <p>The map shows the source-provided point, labelled unverified. It may identify a general area or be incorrect. Zooming closer does not confirm the property’s exact position.</p>
    ${sourcePointConflict(p)?'<p><strong>Location conflict:</strong> advertisements naming different areas share this same source point. Confirm the location with the advertiser before using it for directions.</p>':''}
    ${p.type==='Land'?'<p>No parcel boundary or parcel number has been supplied. The advertised area is not a measurement from this map.</p>':''}
  </section>`;
}
let saved;
try { saved = new Set(JSON.parse(localStorage.getItem('nishtiman-saved') || '[]').filter(id=>listings.some(p=>p.id===id))); } catch { saved = new Set(); }
const state = {view:'regions',region:'Duhok',videoOnly:false,type:'All',district:'All',query:'',sort:'featured',inView:false,savedOnly:false,selected:null,minPrice:0,maxPrice:0,minBeds:0,layout:'split',page:1,pageSize:24,filterKey:''};
let map, tiles, regionLayer, districtLayer, listingLayer;
const money = value => '$' + value.toLocaleString('en-US');
function toast(message){ $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500); }
function updateSaved(){ $('#savedCount').textContent=saved.size;try{localStorage.setItem('nishtiman-saved',JSON.stringify([...saved]));}catch{} }
function toggleSave(id){ saved.has(id)?saved.delete(id):saved.add(id);updateSaved();if(state.view==='explore')renderResults();toast(saved.has(id)?'Added to your saved places':'Removed from saved places'); }
function showDialog(html){stopDialogMedia();$('#dialogContent').innerHTML=html;$('#detailDialog').scrollTop=0;const heading=$('#dialogContent h2');if(heading){heading.id='dialogTitle';$('#detailDialog').setAttribute('aria-labelledby','dialogTitle');}else{$('#detailDialog').removeAttribute('aria-labelledby');}if(!$('#detailDialog').open)$('#detailDialog').showModal();}
function closeDialog(){stopDialogMedia();releaseCreatorUrls();$('#detailDialog').close();}
$('.dialog-close').onclick=closeDialog;
$('#detailDialog').addEventListener('close',()=>{stopDialogMedia();releaseCreatorUrls();});
$('#detailDialog').addEventListener('click',e=>{if(e.target===$('#detailDialog'))closeDialog();});
function showRegions(){
  state.view='regions';state.savedOnly=false;
  document.body.classList.remove('detail-mode');document.body.classList.add('home-mode');
  $('#exploreNav').classList.add('active');$('#savedNav').classList.remove('active');
  $('#homePage').innerHTML=homeContent();bindHome();
  if(map){listingLayer.clearLayers();districtLayer.clearLayers();regionLayer.clearLayers();}
  window.scrollTo({top:0,behavior:'instant'});
}
function selectRegion(name){const r=regionByName(name);if(location.hash==='#'+r.slug)showRegion(r.name);else location.hash=r.slug;}
function showDuhok(savedMode=false){showRegion('Duhok',savedMode);}
function showRegion(name,savedMode=false){
  const region=regionByName(name);state.region=region.name;districts=regionAreas(region.name);state.videoOnly=false;
  state.view='explore';state.savedOnly=savedMode;state.type='All';state.district='All';state.query='';state.inView=false;state.sort='featured';state.selected=null;state.minPrice=0;state.maxPrice=0;state.minBeds=0;
  document.body.classList.remove('home-mode');document.body.classList.add('detail-mode');initializeMap();$('#exploreNav').classList.toggle('active',!savedMode);$('#savedNav').classList.toggle('active',savedMode);
  $('#intro').innerHTML=`<div><div class="eyebrow">KURDISTAN REGION / ${region.name.toUpperCase()}</div><h1>Find your place in <em>${region.name}.</em></h1><p>Explore homes, apartments and land, one neighborhood at a time.</p></div><div class="view-switch" role="group" aria-label="Property browsing layout"><button data-layout="list">List</button><button data-layout="split">Split view</button><button data-layout="map">Map</button></div>`;
  $('#sidebar').innerHTML=`<div class="browse-header"><button class="back" id="backRegions">← All regions</button><div class="browse-title"><h2>${savedMode?'Saved in '+region.name:'Discover '+region.name}</h2><span>FOR SALE</span></div><label class="region-switch-label">Region<select id="browseRegion" aria-label="Choose region">${regions.map(r=>`<option ${r.name===region.name?'selected':''}>${r.name}</option>`).join('')}</select></label><p>Published asking prices from Paya Real Estate.<br>Confirm availability with the advertiser.</p><div class="search-wrap"><span>⌕</span><input id="search" type="search" aria-label="Search properties, areas or districts" placeholder="Search an area or property…"></div><div class="filters" aria-label="Property type">${['All','House','Apartment','Land'].map(t=>`<button class="filter ${t==='All'?'active':''}" data-type="${t}" aria-pressed="${t==='All'}">${{All:'All types',House:'Houses',Apartment:'Apartments',Land:'Land'}[t]}</button>`).join('')}</div><div class="select-row"><select id="district" aria-label="Select district or advertised area"><option value="All">All districts / areas</option>${districts.map(d=>`<option>${escapeHTML(d.name)}</option>`).join('')}</select><select id="sort" aria-label="Sort properties"><option value="featured">Featured first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="area">Largest area</option></select></div></div><details class="more-filters"><summary>Price &amp; bedrooms <span>Refine your search</span></summary><div class="budget-row"><label>Min price · USD<input id="minPrice" type="number" min="0" step="1000" inputmode="numeric" placeholder="No minimum"></label><label>Max price · USD<input id="maxPrice" type="number" min="0" step="1000" inputmode="numeric" placeholder="No maximum"></label><label>Bedrooms<select id="minBeds"><option value="0">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></label></div></details><div id="activeFilters" class="active-filters" aria-label="Active search filters"></div><div class="results-top"><strong id="resultCount" role="status" aria-live="polite"></strong><span>Asking prices · USD</span></div><p class="inventory-note">Prices checked 1 Nov 2026 · Availability unconfirmed.<br>Pins use source-provided coordinates and may be inaccurate.</p><label class="viewport-check"><input id="inView" type="checkbox"> Only listings with source pins in this map view</label><label class="viewport-check video-check"><input id="videoOnly" type="checkbox"> With advertiser video (${regionInventory(region.name).filter(hasPlayableVideo).length})</label>${regionInventory(region.name).length<30?`<p class="coverage-note">${regionInventory(region.name).length} sourced listings available. More inventory is needed for this region. No demo properties are included.</p>`:''}<div id="listingList" class="listing-list"></div><nav id="resultPages" class="result-pages" aria-label="Listing pages"></nav>`;
  ['minPrice','maxPrice','minBeds'].forEach(key=>$('#'+key).oninput=e=>{state[key]=Math.max(0,Number(e.target.value)||0);renderResults();});
  document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>setBrowseLayout(b.dataset.layout));
  setBrowseLayout(state.layout);
  $('#browseRegion').onchange=e=>{history.pushState(null,'','#'+(savedMode?'saved-':'')+regionByName(e.target.value).slug);showRegion(e.target.value,savedMode);};
  $('#videoOnly').onchange=e=>{state.videoOnly=e.target.checked;renderResults();};
  $('#backRegions').onclick=()=>location.hash='regions';
  $('#search').oninput=e=>{state.query=e.target.value.trim().toLowerCase();renderResults();};
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;document.querySelectorAll('[data-type]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b);});renderResults();});
  $('#district').onchange=e=>chooseDistrict(e.target.value);
  $('#sort').onchange=e=>{state.sort=e.target.value;renderResults();};
  $('#inView').onchange=e=>{state.inView=e.target.checked;renderResults();};
  $('#mapHeading').innerHTML=`<span class="live-dot"></span><span>${region.name.toUpperCase()}</span><span class="map-heading-sub">Zoom in to explore</span>`;
  $('#mapKey').textContent='Source locations · Unverified';
  if(map){regionLayer.clearLayers();map.invalidateSize();map.setView([region.lat,region.lng],12);renderDistricts();}
  renderResults();$('#sidebar').scrollTop=0;window.scrollTo({top:0,behavior:'instant'});
}
function chooseDistrict(name){state.district=name;$('#district').value=name;state.selected=null;if(map){const r=regionByName(state.region);if(name==='All')map.setView([r.lat,r.lng],12);else{const d=districts.find(d=>d.name===name);if(d&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)){map.setView([d.lat,d.lng],d.zoom);if(d.sourceArea)toast('Area view uses an unverified advertiser coordinate');}else toast('No source pin for this area. Browse its listings below.');}}renderResults();}
function getFiltered(){
  return listings.filter(p=>p.region===state.region&&(!state.videoOnly||hasPlayableVideo(p))&&(!state.savedOnly||saved.has(p.id))&&(state.type==='All'||p.type===state.type)&&(!state.minPrice||p.price>=state.minPrice)&&(!state.maxPrice||p.price<=state.maxPrice)&&(!state.minBeds||(p.beds!==null&&p.beds>=state.minBeds))&&(state.district==='All'||p.district===state.district)&&(!state.query||`${p.title} ${p.neighborhood} ${p.district} ${p.type}`.toLowerCase().includes(state.query))&&(!state.inView||inMapView(p))).sort((a,b)=>state.sort==='low'?a.price-b.price:state.sort==='high'?b.price-a.price:state.sort==='area'?b.area-a.area:0);
}
function renderResults(){
  if(state.view!=='explore')return;
  const filterKey=JSON.stringify([state.region,state.type,state.district,state.query,state.minPrice,state.maxPrice,state.minBeds,state.videoOnly,state.savedOnly,state.sort,state.inView,state.inView?map?.getBounds().toBBoxString?.():null]);if(filterKey!==state.filterKey){state.page=1;state.filterKey=filterKey;}
  const results=getFiltered();const pages=Math.max(1,Math.ceil(results.length/state.pageSize));state.page=Math.min(state.page,pages);const pageStart=(state.page-1)*state.pageSize;const shown=results.slice(pageStart,pageStart+state.pageSize);$('#resultCount').textContent=`${results.length} ${results.length===1?'listing':'listings'}`;
  $('#listingList').innerHTML=results.length?shown.map(p=>`<article class="listing-card ${p.id===state.selected?'selected':''}" id="listing-${p.id}"><button class="listing-open" data-open="${p.id}" aria-label="View ${escapeHTML(p.title)} for ${money(p.price)}">${listingVisual(p)}<span class="listing-badge">${p.type.toUpperCase()} · FOR SALE</span><div class="listing-info"><div class="listing-price">${money(p.price)}<small>USD</small></div><h3>${escapeHTML(p.title)}</h3><p>⌖ ${escapeHTML(p.neighborhood)}, ${escapeHTML(p.region)}</p><div class="listing-meta">${propertyFacts(p)}</div><div class="listing-source">Paya Real Estate · #${p.source.id}</div></div></button><button class="save-btn ${saved.has(p.id)?'saved':''}" data-save="${p.id}" aria-label="${saved.has(p.id)?'Unsave':'Save'} ${escapeHTML(p.title)}" aria-pressed="${saved.has(p.id)}">${saved.has(p.id)?'♥':'♡'}</button></article>`).join(''):`<div class="empty"><strong>${state.savedOnly&&!saved.size?'Your next favorite place is out there.':'No properties in this selection.'}</strong><br>${state.savedOnly&&!saved.size?'Tap the heart on a property to save it here.':'Try another advertised area or fewer filters.'}<button id="clearFilters">${state.savedOnly?'Explore all properties':'Reset filters'}</button></div>`;
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>showProperty(Number(b.dataset.open)));
  document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>toggleSave(Number(b.dataset.save)));
  if($('#clearFilters'))$('#clearFilters').onclick=()=>{if(state.savedOnly){history.replaceState(null,'','#'+regionByName(state.region).slug);showRegion(state.region);}else clearSearchFilter('all');};
  $('#resultPages').innerHTML=results.length?'<span>Showing '+(pageStart+1)+'–'+Math.min(pageStart+state.pageSize,results.length)+' of '+results.length.toLocaleString('en-US')+'</span><div><button id="prevPage" '+(state.page===1?'disabled':'')+' aria-label="Previous listing page">← Previous</button><b>'+state.page+' / '+pages+'</b><button id="nextPage" '+(state.page===pages?'disabled':'')+' aria-label="Next listing page">Next →</button></div>':'';
  if($('#prevPage'))$('#prevPage').onclick=()=>{if(state.page>1){state.page--;renderResults();$('#sidebar').scrollTop=0;}};
  if($('#nextPage'))$('#nextPage').onclick=()=>{if(state.page<pages){state.page++;renderResults();$('#sidebar').scrollTop=0;}};
  renderActiveFilters();renderMarkers(results);renderDistricts();
}
function renderMarkers(results){
  if(!map)return;listingLayer.clearLayers();
  groupMapListings(results,point=>map.latLngToLayerPoint(point)).forEach(group=>{
    const p=group.items[0],multiple=group.items.length>1,selected=group.items.some(p=>p.id===state.selected);
    const unverified=group.items.some(p=>!hasVerifiedLocation(p));
    const conflict=group.items.some(sourcePointConflict);
    const label=multiple?`${group.items.length} listings`:`${money(p.price)} · ${{House:'H',Apartment:'A',Land:'L'}[p.type]}`;
    const detail=conflict?'Location conflict':unverified?'Unverified location':'Verified location';
    const marker=L.marker(group.position,{icon:L.divIcon({className:`price-marker source-marker type-${p.type.toLowerCase()} ${unverified?'unverified':''} ${selected?'selected':''}`,html:`<button aria-label="${escapeHTML(label)} — ${detail}"><span>${label}</span><small>${detail}</small></button>`,iconSize:[0,0],iconAnchor:[0,0]}),keyboard:false,zIndexOffset:selected?1000:500}).addTo(listingLayer);
    marker.getElement().querySelector('button').onclick=()=>multiple?showMapGroup(group):showProperty(p.id);
  });
  $('#mapKey').textContent=`${results.filter(p=>mapPosition(p)).length} mapped listings · Source locations unverified`;
}
function showMapGroup(group,page=1){
  const pages=Math.ceil(group.items.length/40);const shown=group.items.slice((page-1)*40,page*40);
  showDialog(`<div class="dialog-body"><div class="eyebrow">SOURCE MAP POINTS · UNVERIFIED</div><h2>${group.items.length} listings in this map group</h2><p>These advertisements share a source point or are close together on this map. This grouping does not confirm that they share a building or parcel.</p>${group.items.some(sourcePointConflict)?'<p class="disclaimer"><strong>Location conflict:</strong> some ads name different areas but use the same source coordinate. Ask the advertiser to confirm the location.</p>':''}<div class="map-group-list">${shown.map(p=>`<button data-group-property="${p.id}"><span><b>${escapeHTML(p.title)}</b><small>${p.area} m² · Source #${p.source.id}</small></span><strong>${money(p.price)} ↗</strong></button>`).join('')}</div></div>`);
  if(pages>1){$('#dialogContent .dialog-body').insertAdjacentHTML('beforeend','<nav class="result-pages" aria-label="Map group pages"><span>Page '+page+' of '+pages+'</span><div><button id="groupPrev" '+(page===1?'disabled':'')+'>← Previous</button><button id="groupNext" '+(page===pages?'disabled':'')+'>Next →</button></div></nav>');$('#groupPrev').onclick=()=>showMapGroup(group,page-1);$('#groupNext').onclick=()=>showMapGroup(group,page+1);}
  document.querySelectorAll('[data-group-property]').forEach(b=>b.onclick=()=>showProperty(Number(b.dataset.groupProperty)));
}
function renderDistricts(){
  if(!map)return;districtLayer.clearLayers();if(state.view!=='explore'||map.getZoom()>11)return;
  districts.filter(d=>!d.sourceArea&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)).forEach(d=>{const marker=L.marker([d.lat,d.lng],{icon:L.divIcon({className:'district-marker',html:`<button aria-label="Explore ${escapeHTML(d.name)}; ${d.sourceArea?'unverified source area point':'approximate town center'}, not a verified property">${escapeHTML(d.name)} ↗<small>${d.sourceArea?'Source area point':'District center'}</small></button>`,iconSize:[105,40],iconAnchor:[50,20]}),keyboard:false}).addTo(districtLayer);marker.getElement().querySelector('button').onclick=()=>chooseDistrict(d.name);});
}
function showProperty(id){
  const p=listings.find(x=>x.id===id);if(!p)return;state.selected=id;
  showDialog(`${photoGalleryMarkup(p)}<div class="dialog-body"><div class="eyebrow">${p.type.toUpperCase()} / ${p.region.toUpperCase()} / SOURCE ADVERTISEMENT</div><h2>${escapeHTML(p.title)}</h2><div class="listing-price">${money(p.price)}<small>USD · Asking price</small></div><p>${escapeHTML(p.description)}</p><div class="detail-stats"><div><b>${p.area} m²</b>Advertised area</div>${p.beds!==null?`<div><b>${p.beds}</b>Bedrooms</div>`:''}${p.baths!==null?`<div><b>${p.baths}</b>Bathrooms</div>`:''}</div><section class="source-evidence"><h3>Original advertisement</h3><dl><dt>Source</dt><dd>Paya Real Estate</dd><dt>Advertiser</dt><dd>${escapeHTML(p.source.agency||'See source')}</dd><dt>Reference</dt><dd>${escapeHTML(p.source.reference)}</dd><dt>Posted</dt><dd>${formatDate(p.source.postedDate)}</dd><dt>Price checked</dt><dd>${formatDate(p.source.checkedDate)}</dd></dl><a class="primary source-link" href="${escapeHTML(p.source.url)}" target="_blank" rel="noopener noreferrer">View original ad &amp; contact advertiser ↗</a><p>Images are supplied by the advertiser. Confirm details on the original source page.</p></section>${locationDetails(p)}<div class="dialog-buttons"><button class="outline" id="showOnMap">Show unverified source pin</button><button class="outline" id="detailSave">${saved.has(id)?'♥ Saved':'♡ Save property'}</button></div><p class="disclaimer">Price and specifications are a snapshot of the source advertisement. Confirm current availability, price, ownership and exact location with the advertiser. This platform has not independently verified them.</p></div>`);
  const body=$('#dialogContent .dialog-body');
  body.classList.add('property-detail');
  const price=body.querySelector('.listing-price');
  price.insertAdjacentHTML('afterend', '<div class="detail-quick-actions"><a class="primary" href="'+escapeHTML(p.source.url)+'" target="_blank" rel="noopener noreferrer">Contact via original ad ↗</a><button class="outline" id="quickSave">'+(saved.has(id)?'♥ Saved':'♡ Save property')+'</button></div><p class="detail-area">'+escapeHTML(p.neighborhood)+', '+escapeHTML(p.region)+' · Source location unverified</p>');
  const evidence=body.querySelector('.source-evidence');
  const wrapper=document.createElement('details');wrapper.className='evidence-disclosure';
  evidence.before(wrapper);wrapper.innerHTML='<summary>Advertisement details &amp; source</summary>';wrapper.append(evidence);
  bindPhotoGallery(p);
  const videoSection=listingVideoMarkup(p);body.querySelector('.detail-stats').insertAdjacentHTML('afterend',videoSection);bindVideoLinks();
  $('#showOnMap').onclick=()=>{closeDialog();if(state.view==='regions'||state.region!==p.region){history.pushState(null,'','#'+regionByName(p.region).slug);showRegion(p.region);}setBrowseLayout('map');if(map){state.inView=false;$('#inView').checked=false;const point=mapPosition(p);if(!point){toast('This advertisement has no usable source coordinates');return;}map.setView(point,15);renderResults();$('.map-wrap').scrollIntoView({behavior:'smooth',block:'center'});toast('Source-provided point — exact property location is unverified');}};
  $('#quickSave').onclick=()=>$('#detailSave').click();
  $('#detailSave').onclick=()=>{toggleSave(id);$('#detailSave').textContent=saved.has(id)?'♥ Saved':'♡ Save property';$('#quickSave').textContent=$('#detailSave').textContent;};
}
function resetMap(){if(!map)return;if(state.view==='regions'){map.fitBounds([[35.08,42.65],[37.2,46.12]],{paddingTopLeft:[35,85],paddingBottomRight:[130,80]});}else{const points=getFiltered().map(mapPosition).filter(Boolean);if(points.length)map.fitBounds(points,{padding:[75,90],maxZoom:14});}}
function about(){showDialog(`<div class="dialog-body"><div class="eyebrow">KURDSTAY PROPERTY ATLAS</div><h2>Four regions. One place to explore.</h2><p>Interactive OpenStreetMap street maps, displayed with Leaflet, are available for Duhok, Erbil, Sulaymaniyah and Halabja. This is not Google Maps.</p><div class="inventory-summary">${regions.map(r=>`<p><strong>${r.name}</strong> · ${regionInventory(r.name).length} sourced advertisements · ${regionInventory(r.name).filter(hasPlayableVideo).length} with advertiser video</p>`).join('')}</div><p>Total asking prices were checked on 1 November 2026 against Paya Real Estate’s public advertisement catalog. Deposit-only and per-square-metre quotes are excluded. Availability, ownership and exact locations are unverified. Only videos explicitly linked from the corresponding ad are included; playback depends on the source host.</p><p>Price pins use unverified source coordinates. Groups combine nearby or identical points. District navigation uses approximate centers; other area navigation uses advertiser points, not official district boundaries. No cadastral or surveyed parcel data is loaded.</p><div class="district-grid">${regions.map(r=>`<button data-region-jump="${r.name}">Explore ${r.name} ↗</button>`).join('')}</div><p>Saved properties and listing drafts stay in this browser. Draft photos and video are stored on this device; cloud seller publication is not connected.</p><p><a href="https://krso.gov.krd/en/map/kurdistan-region" target="_blank" rel="noopener">Administrative reference: KRSO ↗</a><br><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Map: OpenStreetMap contributors ↗</a></p></div>`);document.querySelectorAll('[data-region-jump]').forEach(b=>b.onclick=()=>{closeDialog();selectRegion(b.dataset.regionJump);});}
function setBrowseLayout(layout){
  state.layout=['map','list','split'].includes(layout)?layout:'split';
  if(state.layout==='split'&&window.matchMedia?.('(max-width:760px)')?.matches)state.layout='list';
  document.body.dataset.browseLayout=state.layout;
  document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout)));
  if(map)requestAnimationFrame(()=>map.invalidateSize({pan:false}));
}
function clearSearchFilter(key){
  if(key==='all'){
    state.type='All';state.district='All';state.query='';state.minPrice=0;state.maxPrice=0;state.minBeds=0;state.inView=false;state.videoOnly=false;
  }else state[key]=['type','district'].includes(key)?'All':key==='query'?'':['inView','videoOnly'].includes(key)?false:0;
  $('#search').value=state.query;$('#district').value=state.district;$('#inView').checked=state.inView;$('#videoOnly').checked=state.videoOnly;
  ['minPrice','maxPrice','minBeds'].forEach(k=>$('#'+k).value=state[k]|| (k==='minBeds'?'0':''));
  document.querySelectorAll('[data-type]').forEach(b=>{b.classList.toggle('active',b.dataset.type===state.type);b.setAttribute('aria-pressed',String(b.dataset.type===state.type));});
  renderResults();
}
function renderActiveFilters(){
  const root=$('#activeFilters');if(!root)return;
  const chips=[];
  if(state.type!=='All')chips.push(['type',state.type]);
  if(state.district!=='All')chips.push(['district',state.district]);
  if(state.query)chips.push(['query','“'+state.query+'”']);
  if(state.minPrice)chips.push(['minPrice','From '+money(state.minPrice)]);
  if(state.maxPrice)chips.push(['maxPrice','Up to '+money(state.maxPrice)]);
  if(state.minBeds)chips.push(['minBeds',state.minBeds+'+ bedrooms']);
  if(state.videoOnly)chips.push(['videoOnly','With video']);
  if(state.inView)chips.push(['inView','In map view']);
  root.innerHTML=chips.map(([key,label])=>'<button data-clear-filter="'+key+'" aria-label="Remove '+escapeHTML(label)+' filter">'+escapeHTML(label)+' <span aria-hidden="true">×</span></button>').join('')+(chips.length?'<button class="clear-all" data-clear-filter="all">Clear all</button>':'');
  root.hidden=!chips.length;
  root.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>clearSearchFilter(b.dataset.clearFilter));
}

$('#aboutBtn').onclick=about;
$('#referenceBtn').onclick=about;
$('#listBtn').onclick=openListingCreator;
$('#savedNav').onclick=()=>{history.replaceState(null,'','#saved-'+regionByName(state.region).slug);showRegion(state.region,true);};
$('#fitBtn').title='Show all filtered listing pins';$('#fitBtn').setAttribute('aria-label','Show all filtered listing pins');$('#fitBtn').onclick=resetMap;$('#zoomIn').onclick=()=>map&&map.zoomIn();$('#zoomOut').onclick=()=>map&&map.zoomOut();
$('#retryMap').onclick=()=>{if(tiles){$('#mapWarning').hidden=true;tiles.redraw();}};
function route(){const hash=location.hash.slice(1);const savedMode=hash.startsWith('saved');const slug=hash.replace(/^saved-?/,'')||'duhok';const r=regions.find(r=>r.slug===slug);if(r&&(hash===r.slug||savedMode))showRegion(r.name,savedMode);else showRegions();}
window.addEventListener('hashchange',route);
updateSaved();
function initializeMap(){
if(map)return;
if(typeof L!=='undefined'){
  map=L.map('map',{zoomControl:false,minZoom:6,maxZoom:19,scrollWheelZoom:true,zoomSnap:.5}).setView([36.2,44.3],7);
  tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('tileerror',()=>{$('#mapWarning').hidden=false;});tiles.on('tileload',()=>{$('#mapWarning').hidden=true;});
  regionLayer=L.layerGroup().addTo(map);districtLayer=L.layerGroup().addTo(map);listingLayer=L.layerGroup().addTo(map);
  L.control.scale({position:'bottomleft',imperial:false}).addTo(map);
  map.on('moveend',()=>{if(state.view==='explore'&&state.inView)renderResults();});map.on('zoomend',()=>{renderDistricts();if(state.view==='explore')renderMarkers(getFiltered());});
}else{$('#mapWarning').hidden=false;$('#mapWarning').textContent='The map could not start. Reload the page to try again. Property browsing is still available.';}
}
route();
