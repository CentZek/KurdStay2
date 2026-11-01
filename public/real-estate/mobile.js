// Shared web/native navigation. The Android bridge calls these same UI actions.
const mobileScreen=window.matchMedia('(max-width:760px)');
function mobileHome(){closeDialog();history.replaceState(null,'','#regions');showRegions();syncMobileNavigation();}
function mobileMap(){
  closeDialog();
  if(state.view!=='explore'){history.pushState(null,'','#'+regionByName(state.region).slug);showRegion(state.region);}
  setBrowseLayout('map');syncMobileNavigation();
  document.querySelector('.map-wrap')?.scrollIntoView?.({block:'start',behavior:'smooth'});
}
function syncMobileNavigation(){
  const active=state.view==='regions'?'home':state.savedOnly?'saved':state.layout==='map'?'map':'';
  document.querySelectorAll('[data-mobile]').forEach(b=>{if(b.dataset.mobile===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const counter=document.querySelector('#mobileSavedCount');if(counter&&counter.textContent!==String(saved.size))counter.textContent=saved.size;
}
const mobileActions={home:mobileHome,map:mobileMap,saved:()=>{$('#savedNav').onclick();setBrowseLayout('list');syncMobileNavigation();},list:openListingCreator,about};
document.querySelectorAll('[data-mobile]').forEach(button=>button.onclick=()=>mobileActions[button.dataset.mobile]());
function handleMobileBack(){
  if($('#detailDialog').open){closeDialog();return true;}
  if(state.view==='explore'&&state.layout==='map'){setBrowseLayout('list');syncMobileNavigation();return true;}
  if(state.view==='explore'){mobileHome();return true;}
  return false;
}
function resizeMobile(){
  state.pageSize=mobileScreen.matches?12:24;state.page=1;
  if(mobileScreen.matches&&state.layout==='split')setBrowseLayout('list');
  if(state.view==='explore')renderResults();
  if(map)requestAnimationFrame(()=>map.invalidateSize({pan:false}));
  syncMobileNavigation();
}
mobileScreen.addEventListener?.('change',resizeMobile);
window.addEventListener('hashchange',syncMobileNavigation);
if(typeof MutationObserver!=='undefined'){
  new MutationObserver(syncMobileNavigation).observe(document.body,{attributes:true,attributeFilter:['class','data-browse-layout']});
  new MutationObserver(syncMobileNavigation).observe($('#savedCount'),{childList:true});
}
function connectionChanged(){document.querySelector('#connectionNotice').hidden=navigator.onLine!==false;}
window.addEventListener('online',connectionChanged);window.addEventListener('offline',connectionChanged);
window.visualViewport?.addEventListener('resize',()=>{
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
  document.body.classList.toggle('keyboard-open',typing&&window.innerHeight-window.visualViewport.height>120);
});
document.addEventListener('focusout',()=>document.body.classList.remove('keyboard-open'));
window.KurdStayMobile={handleBack:handleMobileBack,resume(){connectionChanged();if(map)map.invalidateSize({pan:false});}};
resizeMobile();connectionChanged();
