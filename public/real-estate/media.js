const getListingPhotos = p => LISTING_MEDIA[p.id] || [];
let galleryCleanup=null;
function stopDialogMedia(){
  document.querySelectorAll('#detailDialog video').forEach(v=>v.pause());
  document.querySelectorAll('#detailDialog iframe').forEach(f=>f.remove());
  if(galleryCleanup){galleryCleanup();galleryCleanup=null;}
}
function photoGalleryMarkup(p){
  const photos=getListingPhotos(p),first=photos[0];if(!first)return '';
  return `<section class="property-gallery" aria-label="Property photos"><div class="gallery-stage"><img id="galleryMain" src="${escapeHTML(first.src)}" alt="${escapeHTML(first.alt)}"><div class="gallery-controls"><button id="galleryPrev" aria-label="Previous photo" ${photos.length<2?'disabled':''}>←</button><span id="galleryCount" aria-live="polite">1 / ${photos.length}</span><button id="galleryNext" aria-label="Next photo" ${photos.length<2?'disabled':''}>→</button></div></div><div class="gallery-thumbs">${photos.map((photo,i)=>`<button data-photo-index="${i}" aria-label="Show photo ${i+1}" aria-pressed="${i===0}"><img src="${escapeHTML(photo.src)}" alt="" loading="lazy"></button>`).join('')}</div><p class="gallery-credit">${first.kind==='example'?'Example photograph — does not show this '+(p.type==='Land'?'plot':'property')+'. No property photo was provided by the source.':`Advertiser images via <a href="${escapeHTML(p.source.url)}" target="_blank" rel="noopener">Paya Real Estate ↗</a>. Images and any boundary markings are source claims, not independent verification.`}</p></section>`;
}
function bindPhotoGallery(p){
  const photos=getListingPhotos(p);let current=0;
  const show=index=>{current=(index+photos.length)%photos.length;$('#galleryMain').src=photos[current].src;$('#galleryMain').alt=photos[current].alt;$('#galleryCount').textContent=`${current+1} / ${photos.length}`;document.querySelectorAll('[data-photo-index]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.photoIndex)===current)));};
  $('#galleryPrev').onclick=()=>show(current-1);$('#galleryNext').onclick=()=>show(current+1);
  document.querySelectorAll('[data-photo-index]').forEach(b=>b.onclick=()=>show(Number(b.dataset.photoIndex)));
  const keys=e=>{if(e.target.closest('input,textarea,select'))return;if(e.key==='ArrowLeft'){e.preventDefault();show(current-1);}if(e.key==='ArrowRight'){e.preventDefault();show(current+1);}};
  $('#detailDialog').addEventListener('keydown',keys);galleryCleanup=()=>$('#detailDialog').removeEventListener('keydown',keys);
}

function listingVideoMarkup(p){
 const supplied=(p.videos||[]).map(v=>({...v,link:normalizeVideoLink(v.url)})).filter(v=>v.link);
 if(!supplied.length)return '<p class="video-unavailable">No property video was supplied by this advertisement.</p>';
 return '<section class="listing-videos"><h3>Advertiser video</h3><p>Linked from this property’s original advertisement. Video availability is controlled by the host.</p>'+supplied.map(v=>(v.embedAvailable?'<button class="video-play-link" data-play-video="'+escapeHTML(v.link.embed)+'">▷ Play property video</button>':'<p>Embedded playback could not be confirmed for this source video. Try the original link.</p>')+'<a href="'+escapeHTML(v.link.url)+'" target="_blank" rel="noopener noreferrer">Open on '+v.link.provider+' ↗</a>').join('')+'</section>';
}
