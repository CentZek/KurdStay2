// Real landmark photographs; attribution is rendered beneath the region cards.
const regionPhotos = {
  "Duhok": {
    "key": "duhok",
    "file": "assets/region-duhok.jpg",
    "title": "Duhok dam at sunrise.jpg",
    "source": "https://commons.wikimedia.org/wiki/File:Duhok_dam_at_sunrise.jpg",
    "author": "JF2608",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "original": "https://upload.wikimedia.org/wikipedia/commons/a/ac/Duhok_dam_at_sunrise.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
    "download": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/Duhok_dam_at_sunrise.jpg/960px-Duhok_dam_at_sunrise.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    "changes": "Wikimedia thumbnail; displayed with a responsive CSS crop. No other image edits.",
    "bytes": 151896,
    "landmark": "Duhok Dam"
  },
  "Erbil": {
    "key": "erbil",
    "file": "assets/region-erbil.jpg",
    "title": "Erbil Citadel-Erbil.jpg",
    "source": "https://commons.wikimedia.org/wiki/File:Erbil_Citadel-Erbil.jpg",
    "author": "Abdulsalam Al Dabbagh",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "original": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Erbil_Citadel-Erbil.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
    "download": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Erbil_Citadel-Erbil.jpg/960px-Erbil_Citadel-Erbil.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    "changes": "Wikimedia thumbnail; displayed with a responsive CSS crop. No other image edits.",
    "bytes": 154104,
    "landmark": "Erbil Citadel"
  },
  "Sulaymaniyah": {
    "key": "sulaymaniyah",
    "file": "assets/region-sulaymaniyah.jpg",
    "title": "Chavy Land.jpg",
    "source": "https://commons.wikimedia.org/wiki/File:Chavy_Land.jpg",
    "author": "Davidbstanley",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "original": "https://upload.wikimedia.org/wikipedia/commons/b/bf/Chavy_Land.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
    "download": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bf/Chavy_Land.jpg/960px-Chavy_Land.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    "changes": "Wikimedia thumbnail; displayed with a responsive CSS crop. No other image edits.",
    "bytes": 227810,
    "landmark": "Chavy Land"
  },
  "Halabja": {
    "key": "halabja",
    "file": "assets/region-halabja.jpg",
    "title": "Halabja Martyrs Monument.jpg",
    "source": "https://commons.wikimedia.org/wiki/File:Halabja_Martyrs_Monument.jpg",
    "author": "John  Crane",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "original": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Halabja_Martyrs_Monument.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
    "download": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Halabja_Martyrs_Monument.jpg/960px-Halabja_Martyrs_Monument.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    "changes": "Wikimedia thumbnail; displayed with a responsive CSS crop. No other image edits.",
    "bytes": 174675,
    "landmark": "Halabja Martyrs Monument"
  }
};
let homeSearchType='All';
let homeFeaturedType='All';
let homeFeaturedRegion='Duhok';
const searchIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const locationIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.6"/></svg>';
function featuredMarkup(type='All'){
  const items=listings.filter(p=>p.region===homeFeaturedRegion&&(type==='All'||p.type===type)).slice(0,3);
  if(!items.length)return '<div class="empty featured-empty"><strong>No sourced listings for this type yet.</strong><p>Choose another property type or region.</p></div>';
  return items.map(p=>`<article class="home-property"><button class="home-property-open" data-home-property="${p.id}" aria-label="View ${p.type.toLowerCase()}: ${escapeHTML(p.title)}"><div class="home-property-image">${listingVisual(p)}<span class="property-category">${p.type}</span><span class="property-demo">Paya Real Estate</span></div><div class="home-property-body"><div class="home-price">${money(p.price)}<small>USD</small></div><h3>${escapeHTML(p.title)}</h3><p class="property-place">${locationIcon} ${escapeHTML(p.neighborhood)}, ${p.region}</p><div class="property-facts">${propertyFacts(p)}<span class="property-details-arrow">↗</span></div></div></button><button class="home-heart ${saved.has(p.id)?'is-saved':''}" data-home-save="${p.id}" aria-label="${saved.has(p.id)?'Unsave':'Save'} ${escapeHTML(p.title)}" aria-pressed="${saved.has(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 4.8a5 5 0 0 0-7.1 0L12 6.2l-1.4-1.4a5 5 0 0 0-7.1 7.1L12 20.4l8.5-8.5a5 5 0 0 0 0-7.1Z"/></svg></button></article>`).join('');
}
function homeContent(){
  homeSearchType='All';homeFeaturedType='All';
  return `<section class="home-hero" aria-labelledby="homeTitle">
    <div class="hero-copy"><div class="hero-eyebrow"><span></span> YOUR NEXT CHAPTER, IN KURDISTAN</div>
    <h1 id="homeTitle">Find your place.<br>Make it <em>yours.</em></h1><p>Homes, apartments, and land.<br>A better way to find where you belong.</p></div>
    <figure class="hero-art"><img class="hero-photo" src="assets/hero-home.jpg" alt="Illustrative contemporary home with a landscaped garden" fetchpriority="high"><figcaption><span>YOUR NEXT CHAPTER</span><p>A place to call your own.</p><small>Illustrative architecture</small></figcaption></figure>
    <div class="home-search-shell"><div class="search-tabs" role="group" aria-label="Choose property type">${['All','House','Apartment','Land'].map(t=>`<button type="button" class="search-tab ${t==='All'?'active':''}" data-search-type="${t}" aria-pressed="${t==='All'}">${{All:'All properties',House:'Houses',Apartment:'Apartments',Land:'Land'}[t]}</button>`).join('')}</div>
    <form class="home-search" id="homeSearch"><label class="home-region-field"><span class="search-field-icon">${locationIcon}</span><span class="field-content"><span class="field-label">REGION</span><select id="homeRegion" aria-label="Search region">${regions.map(r=>`<option>${r.name}</option>`).join('')}</select></span></label><label class="home-location-field"><span class="field-content"><span class="field-label">WHERE WOULD YOU LIKE TO LIVE?</span><input id="homeLocation" type="search" list="homeDistricts" placeholder="Area, district or property keyword" autocomplete="off" aria-label="Area, district or property keyword"><datalist id="homeDistricts">${regionAreas('Duhok').map(d=>`<option value="${escapeHTML(d.name)}"></option>`).join('')}</datalist></span></label><button class="home-search-button" type="submit">${searchIcon}<span>Search properties</span></button></form></div>
  </section>
  <div class="quick-discover" aria-label="Quick property searches"><span>Start exploring</span><button data-quick-type="Apartment" data-quick-max="100000">Apartments under $100k <span>↗</span></button><button data-quick-type="House" data-quick-max="0">Houses in Duhok <span>↗</span></button><button data-quick-type="Land" data-quick-max="0">Land to build on <span>↗</span></button></div>
  <section class="home-regions" id="regionChoices" aria-labelledby="regionsTitle"><div class="section-heading"><div><div class="section-kicker">FIND YOUR NEIGHBORHOOD</div><h2 id="regionsTitle">A place for every new chapter.</h2></div><p>Street maps and sourced listings across all four regions.</p></div><div class="region-grid">${regions.map(r=>{const photo=regionPhotos[r.name];return `<button class="region-tile photo-region ${photo.key} ${r.available?'available':''}" data-home-region="${r.name}" aria-label="${r.available?'Explore':'Coming soon:'} ${r.name}"><div class="region-photo"><img src="${photo.file}" alt="${photo.landmark}, ${r.name}" width="960" height="640" loading="lazy"><span class="landmark-name">${photo.landmark}</span></div><div class="region-text"><div class="tile-title"><h3>${r.name}</h3><span lang="ckb" dir="rtl">${r.kurdish}</span></div><span class="region-availability"><i></i> ${regionInventory(r.name).length} listings · Explore</span><span class="tile-arrow" aria-hidden="true">↗</span></div></button>`;}).join('')}</div><details class="region-photo-credits"><summary>Landmark photo credits</summary><ul>${Object.values(regionPhotos).map(photo=>`<li><a href="${photo.source}" target="_blank" rel="noopener">${photo.landmark}</a> — ${photo.author} · <a href="${photo.licenseUrl}" target="_blank" rel="noopener">${photo.license}</a></li>`).join('')}</ul><p>Photographs via Wikimedia Commons; resized thumbnails with responsive display crops. Each photo and its display crop retain the linked license.</p></details></section>
  <section class="home-discover" aria-labelledby="discoverTitle"><div class="section-heading"><div><div class="section-kicker">ON THE MARKET IN KURDISTAN</div><h2 id="discoverTitle">Find a place to make your own.</h2></div><button class="text-link" id="exploreFeatured">Explore these properties <span>↗</span></button></div><div class="featured-filters" role="group" aria-label="Filter featured properties">${['All','House','Apartment','Land'].map(t=>`<button class="featured-filter ${t==='All'?'active':''}" data-featured-type="${t}" aria-pressed="${t==='All'}">${{All:'All properties',House:'Houses',Apartment:'Apartments',Land:'Plots of land'}[t]}</button>`).join('')}<span class="featured-location">${locationIcon} <label>Region <select id="featuredRegion">${regions.map(r=>`<option ${r.name===homeFeaturedRegion?'selected':''}>${r.name}</option>`).join('')}</select></label></span></div><div class="home-property-grid" id="featuredGrid">${featuredMarkup()}</div><p class="sample-note">${listings.length} source advertisements · Asking prices checked 1 Nov 2026. Confirm availability with the advertiser. Exact locations are unverified.</p></section>
  <section class="property-explore-banner" aria-labelledby="exploreBannerTitle"><div class="explore-banner-copy"><div class="section-kicker">EXPLORE WITH KURDSTAY</div><h2 id="exploreBannerTitle">Find your place. Know your neighbourhood.</h2><p>Discover homes, apartments and land in the areas you love. Explore the streets around your next place.</p></div><div class="explore-banner-action"><button class="primary" data-home-region="Duhok">Explore the map <span aria-hidden="true">↗</span></button><small>Start in Duhok. Explore all four regions.</small></div></section>
  <section class="home-steps" aria-label="How to find a property"><div><span>01</span><h3>Choose your place</h3><p>Start with a region and a district that feels right.</p></div><div><span>02</span><h3>Make it your search</h3><p>Explore homes, apartments, or space to build.</p></div><div><span>03</span><h3>Keep your favorites</h3><p>Save the places you like and come back to them.</p></div></section>`;
}
function resolveHomeSearch(value,regionName='Duhok'){
  const query=value.trim();
  const district=regionAreas(regionName).find(d=>d.name.toLowerCase()===query.toLowerCase());
  return {district:district?district.name:'All',query:district?'':query.toLowerCase()};
}
function runHomeSearch(type,value,regionName='Duhok'){
  const filters=resolveHomeSearch(value,regionName);
  history.pushState(null,'','#'+regionByName(regionName).slug);showRegion(regionName);
  state.type=type;state.query=filters.query;
  $('#search').value=filters.query;
  document.querySelectorAll('[data-type]').forEach(b=>{const active=b.dataset.type===type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  if(filters.district!=='All')chooseDistrict(filters.district);else renderResults();
}
function bindFeatured(){
  document.querySelectorAll('[data-home-property]').forEach(b=>b.onclick=()=>{const p=listings.find(p=>p.id===Number(b.dataset.homeProperty));history.pushState(null,'','#'+regionByName(p.region).slug);showRegion(p.region);showProperty(p.id);});
  document.querySelectorAll('[data-home-save]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.homeSave);toggleSave(id);
    b.classList.toggle('is-saved',saved.has(id));b.setAttribute('aria-pressed',String(saved.has(id)));
    b.setAttribute('aria-label',`${saved.has(id)?'Unsave':'Save'} ${listings.find(p=>p.id===id).title}`);
  });
}
function bindHome(){
  $('#exploreFeatured').onclick=()=>runHomeSearch(homeFeaturedType,'',homeFeaturedRegion);
  $('#featuredRegion').onchange=e=>{homeFeaturedRegion=e.target.value;$('#featuredGrid').innerHTML=featuredMarkup(homeFeaturedType);bindFeatured();};
  $('#homeRegion').onchange=e=>{$('#homeDistricts').innerHTML=regionAreas(e.target.value).map(d=>'<option value="'+escapeHTML(d.name)+'"></option>').join('');$('#homeLocation').value='';};
  document.querySelectorAll('[data-quick-type]').forEach(b=>b.onclick=()=>{runHomeSearch(b.dataset.quickType,'');state.maxPrice=Number(b.dataset.quickMax);$('#maxPrice').value=state.maxPrice||'';renderResults();});
  document.querySelectorAll('[data-home-region]').forEach(b=>b.onclick=()=>selectRegion(b.dataset.homeRegion));
  document.querySelectorAll('[data-search-type]').forEach(b=>b.onclick=()=>{
    homeSearchType=b.dataset.searchType;
    document.querySelectorAll('[data-search-type]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
  });
  $('#homeSearch').onsubmit=e=>{e.preventDefault();runHomeSearch(homeSearchType,$('#homeLocation').value,$('#homeRegion').value);};
  document.querySelectorAll('[data-featured-type]').forEach(b=>b.onclick=()=>{
    homeFeaturedType=b.dataset.featuredType;
    document.querySelectorAll('[data-featured-type]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
    $('#featuredGrid').innerHTML=featuredMarkup(homeFeaturedType);bindFeatured();
  });
  bindFeatured();
}
