// Media files are stored as Blobs in IndexedDB, never base64 in localStorage.
const MEDIA_LIMITS={photos:12,photoBytes:10*1024*1024,videoBytes:250*1024*1024,videoSeconds:180};
let listingDraft=null,creatorStep=1,creatorBusy=false,creatorPreviewUrls=[];
const photoTypes=new Set(['image/jpeg','image/png','image/webp']);
const videoTypes=new Set(['video/mp4','video/webm']);
function mediaFileError(file,kind){
  if(!file.size)return 'This file is empty.';
  if(kind==='photo'&&!photoTypes.has(file.type))return 'Use a JPG, PNG or WebP photo.';
  if(kind==='video'&&!videoTypes.has(file.type))return 'Use an MP4 or WebM video. Export MOV/HEVC videos as MP4 first.';
  if(file.size>(kind==='photo'?MEDIA_LIMITS.photoBytes:MEDIA_LIMITS.videoBytes))return kind==='photo'?'Each photo must be 10 MB or smaller.':'Video must be 250 MB or smaller.';
  return '';
}
function normalizeVideoLink(value){
  if(!value.trim())return null;
  let url;try{url=new URL(value.trim());}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password)return null;
  const host=url.hostname.toLowerCase();let id;
  if(host==='youtu.be')id=url.pathname.slice(1);
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host))id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1];
  if(id&&/^[A-Za-z0-9_-]{11}$/.test(id))return {provider:'YouTube',url:`https://www.youtube.com/watch?v=${id}`,embed:`https://www.youtube-nocookie.com/embed/${id}`};
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
    const match=url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([a-fA-F0-9]+))?\/?$/);
    if(match){const hash=match[2]||url.searchParams.get('h');if(hash&&!/^[a-fA-F0-9]+$/.test(hash))return null;return {provider:'Vimeo',url:`https://vimeo.com/${match[1]}${hash?'/'+hash:''}`,embed:`https://player.vimeo.com/video/${match[1]}${hash?'?h='+hash:''}`};}
  }
  return null;
}
function openDraftDB(){return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('Draft storage is unavailable in this browser.'));return;}
  const request=indexedDB.open('nishtiman-listing-drafts',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other tabs using draft storage and retry.'));
});}
async function draftStore(action,value){
  const db=await openDraftDB();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',action==='getAll'?'readonly':'readwrite');let result;
    const request=tx.objectStore('drafts')[action](...(value===undefined?[]:[value]));
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft save was interrupted.'));
  });}finally{db.close();}
}
function releaseCreatorUrls(){creatorPreviewUrls.forEach(url=>URL.revokeObjectURL(url));creatorPreviewUrls=[];}
function draftMediaUrl(file){const url=URL.createObjectURL(file);creatorPreviewUrls.push(url);return url;}
function newListingDraft(){return {id:crypto.randomUUID(),title:'',type:'House',region:state.region||'Duhok',district:'',neighborhood:'',price:'',area:'',description:'',photos:[],video:null,videoLink:'',videoMode:'file',updatedAt:null};}
function openListingCreator(){if(creatorBusy){toast('Finishing the current media operation…');return;}if(!listingDraft)listingDraft=newListingDraft();creatorStep=1;renderCreator();}
function creatorError(text){const el=$('#creatorError');if(el){el.textContent=text;el.hidden=!text;}}
function captureDraftFields(){
  document.querySelectorAll('[data-draft-field]').forEach(el=>{listingDraft[el.dataset.draftField]=el.value;});
}
function validateDraft(step){
  const d=listingDraft;
  if(step===1){if(!d.title.trim()||!d.neighborhood.trim())return 'Add a title and the advertised area.';if(!Number.isFinite(Number(d.price))||Number(d.price)<=0||!Number.isFinite(Number(d.area))||Number(d.area)<=0)return 'Enter a positive asking price and area.';}
  if(step===2){if(!d.photos.length)return 'Add at least one photo.';if(d.videoMode==='link'&&d.videoLink.trim()&&!normalizeVideoLink(d.videoLink))return 'Enter a valid HTTPS YouTube or Vimeo video link.';}
  return '';
}
function creatorDetailsMarkup(){const d=listingDraft;return `<div class="creator-field-grid"><label class="wide">Listing title<input data-draft-field="title" maxlength="100" value="${escapeHTML(d.title)}" placeholder="A family home in Kurdistan"></label><label>Property type<select data-draft-field="type">${['House','Apartment','Land'].map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}</select></label><label>Region<select data-draft-field="region">${regions.map(r=>`<option ${r.name===(d.region||'Duhok')?'selected':''}>${r.name}</option>`).join('')}</select></label><label>District (optional)<input data-draft-field="district" value="${escapeHTML(d.district)}" placeholder="District name"></label><label class="wide">Area / neighborhood<input data-draft-field="neighborhood" maxlength="100" value="${escapeHTML(d.neighborhood)}" placeholder="e.g. French Village 2"></label><label>Asking price (USD)<input data-draft-field="price" type="number" min="1" step="1" value="${escapeHTML(d.price)}"></label><label>Area (m²)<input data-draft-field="area" type="number" min="1" step="0.1" value="${escapeHTML(d.area)}"></label><label class="wide">Description<textarea data-draft-field="description" rows="3" maxlength="3000" placeholder="Tell buyers about the property">${escapeHTML(d.description)}</textarea></label></div><p class="creator-note">${escapeHTML(d.region||'Duhok')} · Draft location is an area name only. An exact property pin must be confirmed separately.</p>`;}
function creatorMediaMarkup(){const d=listingDraft;return `<h3>Photos <small>${d.photos.length} / ${MEDIA_LIMITS.photos}</small></h3><label class="upload-zone" id="photoDrop"><span class="upload-symbol">＋</span><b>Add property photos</b><span>Choose files or drop them here · JPG, PNG, WebP · 10 MB each</span><input id="photoFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="upload-photo-grid">${d.photos.map((photo,i)=>`<div class="upload-photo"><img src="${draftMediaUrl(photo)}" alt="Uploaded property photo ${i+1}"><span>${i===0?'Cover photo':`Photo ${i+1}`}</span><div>${i?`<button type="button" data-cover="${i}">Make cover</button>`:''}<button type="button" data-remove-photo="${i}" aria-label="Remove photo ${i+1}">Remove</button></div></div>`).join('')}</div><div class="video-section"><h3>Video walkthrough <small>Optional</small></h3><p>Show the layout, surroundings, or land access in one short tour.</p><div class="video-methods" role="group" aria-label="Video source"><button type="button" data-video-mode="file" aria-pressed="${d.videoMode==='file'}">Upload video</button><button type="button" data-video-mode="link" aria-pressed="${d.videoMode==='link'}">Paste video link</button></div>${d.videoMode==='file'?`<label class="upload-zone video-drop" id="videoDrop"><span class="upload-symbol">▷</span><b>${d.video?'Replace video':'Add a video walkthrough'}</b><span>MP4 or WebM · Up to 3 minutes and 250 MB</span><input id="videoFile" type="file" accept="video/mp4,video/webm"></label>${d.video?`<div class="video-preview"><video controls playsinline preload="metadata" src="${draftMediaUrl(d.video.file)}" ${d.photos[0]?`poster="${draftMediaUrl(d.photos[0])}"`:''}></video><div><span>${escapeHTML(d.video.file.name)} · ${Math.ceil(d.video.duration)} sec · ${(d.video.file.size/1024/1024).toFixed(1)} MB</span><button type="button" id="removeVideo">Remove video</button></div></div>`:''}`:`<label class="video-link-label">YouTube or Vimeo link<input id="videoLink" type="url" data-draft-field="videoLink" placeholder="https://www.youtube.com/watch?v=…" value="${escapeHTML(d.videoLink)}"></label><button type="button" class="outline" id="previewVideoLink">Preview video</button><div id="linkedVideoPreview"></div><p class="creator-note">Use a public or unlisted video that allows embedding. A hosted link avoids a large file upload.</p>`}</div>`;}
function draftVideoMarkup(d){
  if(d.videoMode==='file'&&d.video)return `<video controls playsinline preload="metadata" src="${draftMediaUrl(d.video.file)}" ${d.photos[0]?`poster="${draftMediaUrl(d.photos[0])}"`:''}></video>`;
  const link=d.videoMode==='link'?normalizeVideoLink(d.videoLink):null;
  return link?`<button type="button" class="video-play-link" data-play-video="${escapeHTML(link.embed)}">▷ Play ${link.provider} walkthrough</button><a href="${escapeHTML(link.url)}" target="_blank" rel="noopener">Open on ${link.provider} ↗</a>`:'';
}
function creatorReviewMarkup(){const d=listingDraft;return `<div class="draft-preview"><img class="draft-cover" src="${draftMediaUrl(d.photos[0])}" alt="Selected cover photo"><div class="eyebrow">${escapeHTML(d.type)} · ${escapeHTML(d.region||'Duhok')} · ${escapeHTML(d.district)} · DRAFT</div><h3>${escapeHTML(d.title)}</h3><div class="listing-price">${money(Number(d.price))}<small>USD</small></div><p>${escapeHTML(d.neighborhood)} · ${escapeHTML(d.area)} m² · ${d.photos.length} photos</p><p class="draft-description">${escapeHTML(d.description)}</p><div class="draft-photo-strip">${d.photos.slice(1).map((photo,i)=>`<img src="${draftMediaUrl(photo)}" alt="Property photo ${i+2}">`).join('')}</div>${draftVideoMarkup(d)}</div><p class="creator-note">Save this draft, photos and video on this device. It will not be published to the marketplace or visible to other users.</p>`;}
function renderCreator(){
  stopDialogMedia();releaseCreatorUrls();
  const body=creatorStep===1?creatorDetailsMarkup():creatorStep===2?creatorMediaMarkup():creatorReviewMarkup();
  showDialog(`<div class="dialog-body listing-creator"><div class="eyebrow">LIST A PROPERTY</div><div class="creator-title"><h2>A place worth sharing.</h2><button type="button" id="myDrafts">My drafts</button></div><p class="creator-note">Draft workspace · Saved on this device only</p><ol class="creator-steps">${['Property details','Photos & video','Review'].map((name,i)=>`<li ${creatorStep===i+1?'aria-current="step"':''}><span>${i+1}</span>${name}</li>`).join('')}</ol><div id="creatorError" role="alert" hidden></div><form id="listingForm">${body}<div class="creator-actions">${creatorStep>1?'<button type="button" class="outline" id="creatorBack">← Back</button>':''}<button type="submit" class="primary" id="creatorNext">${creatorStep===3?'Save draft on this device':'Continue →'}</button></div></form></div>`);
  $('#myDrafts').onclick=()=>{captureDraftFields();showMyDrafts();};
  document.querySelectorAll('[data-draft-field]').forEach(el=>el.oninput=()=>captureDraftFields());
  $('#listingForm').onsubmit=async e=>{e.preventDefault();if(creatorBusy)return;captureDraftFields();const error=validateDraft(creatorStep);if(error){creatorError(error);return;}if(creatorStep<3){creatorStep++;renderCreator();}else await saveListingDraft();};
  if($('#creatorBack'))$('#creatorBack').onclick=()=>{if(creatorBusy)return;captureDraftFields();creatorStep--;renderCreator();};
  if(creatorStep===2)bindCreatorMedia();bindVideoLinks();
}
function bindVideoLinks(){document.querySelectorAll('[data-play-video]').forEach(b=>b.onclick=()=>{
  const frame=document.createElement('iframe');frame.src=b.dataset.playVideo;frame.title='Property video walkthrough';frame.allow='fullscreen; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;b.replaceWith(frame);
});}
function setCreatorBusy(value){creatorBusy=value;document.querySelectorAll('#listingForm button,#listingForm input,#myDrafts').forEach(el=>el.disabled=value);}
async function decodePhoto(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();let timer;const finish=(error)=>{clearTimeout(timer);URL.revokeObjectURL(url);error?reject(Error(error)):resolve();};img.onload=()=>finish(img.naturalWidth?'':'This image could not be decoded.');img.onerror=()=>finish('This image could not be decoded.');timer=setTimeout(()=>finish('Image preview timed out. Try another file.'),12000);img.src=url;});}
async function inspectVideo(file){return new Promise((resolve,reject)=>{
  const video=document.createElement('video'),url=URL.createObjectURL(file);let settled=false;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);const duration=video.duration;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);error?reject(Error(error)):resolve(duration);};
  const timer=setTimeout(()=>finish('Video preview timed out. Try an MP4 encoded with H.264.'),15000);
  video.preload='metadata';video.onloadedmetadata=()=>finish(!Number.isFinite(video.duration)||video.duration<=0?'The video duration could not be read.':video.duration>MEDIA_LIMITS.videoSeconds?'Keep your walkthrough to 3 minutes or less.':!video.videoWidth?'This file has no playable video track.':null);
  video.onerror=()=>finish('This browser cannot play this video. Try an H.264 MP4 or a hosted link.');video.src=url;
});}
async function addDraftPhotos(files){
  if(creatorBusy)return;setCreatorBusy(true);const errors=[];
  try{for(const file of files){if(listingDraft.photos.length>=MEDIA_LIMITS.photos){errors.push('You can add up to 12 photos.');break;}const error=mediaFileError(file,'photo');if(error){errors.push(file.name+': '+error);continue;}try{await decodePhoto(file);listingDraft.photos.push(file);}catch(e){errors.push(file.name+': '+e.message);}}}
  finally{creatorBusy=false;if($('#detailDialog').open&&$('#listingForm')){renderCreator();if(errors.length)creatorError(errors.join(' '));}}
}
async function addDraftVideo(file){if(!file||creatorBusy)return;const error=mediaFileError(file,'video');if(error){creatorError(error);return;}setCreatorBusy(true);creatorError('Checking video…');try{const duration=await inspectVideo(file);listingDraft.video={file,duration};creatorBusy=false;if($('#detailDialog').open&&$('#listingForm'))renderCreator();}catch(e){setCreatorBusy(false);creatorError(e.message);}}
function bindDropZone(id,callback){const el=$(id);if(!el)return;el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over');};el.ondragleave=()=>el.classList.remove('drag-over');el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');callback([...e.dataTransfer.files]);};}
function bindCreatorMedia(){
  $('#photoFiles').onchange=e=>addDraftPhotos([...e.target.files]);bindDropZone('#photoDrop',addDraftPhotos);
  document.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>{listingDraft.photos.splice(Number(b.dataset.removePhoto),1);renderCreator();});
  document.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{const [cover]=listingDraft.photos.splice(Number(b.dataset.cover),1);listingDraft.photos.unshift(cover);renderCreator();});
  document.querySelectorAll('[data-video-mode]').forEach(b=>b.onclick=()=>{captureDraftFields();listingDraft.videoMode=b.dataset.videoMode;renderCreator();});
  if($('#videoFile')){$('#videoFile').onchange=e=>addDraftVideo(e.target.files[0]);bindDropZone('#videoDrop',files=>files.length===1?addDraftVideo(files[0]):creatorError('Choose one walkthrough video.'));}
  if($('#removeVideo'))$('#removeVideo').onclick=()=>{listingDraft.video=null;renderCreator();};
  if($('#previewVideoLink'))$('#previewVideoLink').onclick=()=>{captureDraftFields();const link=normalizeVideoLink(listingDraft.videoLink);if(!link){creatorError('Enter a valid HTTPS YouTube or Vimeo video link.');return;}creatorError('');$('#linkedVideoPreview').innerHTML=draftVideoMarkup(listingDraft);bindVideoLinks();};
}
async function saveListingDraft(){
  const error=validateDraft(1)||validateDraft(2);if(error){creatorError(error);return;}
  setCreatorBusy(true);$('#creatorNext').textContent='Saving media…';
  try{const record={...listingDraft,updatedAt:new Date().toISOString()};await draftStore('put',record);listingDraft=record;setCreatorBusy(false);if(!$('#detailDialog').open)return;stopDialogMedia();releaseCreatorUrls();showDialog(`<div class="dialog-body"><div class="eyebrow">DRAFT SAVED</div><h2>Ready for your next step.</h2><p>Your listing, ${record.photos.length} photos${record.videoMode==='file'&&record.video?' and video':''} are saved on this device. Nothing has been published.</p><p class="creator-note">Use this same browser to resume. Clearing site data removes local drafts. Shared publishing requires a seller account and cloud media storage, which are not connected in this preview.</p><div class="dialog-buttons"><button class="primary" id="editSavedDraft">Continue editing</button><button class="outline" id="viewSavedDrafts">My drafts</button></div></div>`);$('#editSavedDraft').onclick=()=>{creatorStep=1;renderCreator();};$('#viewSavedDrafts').onclick=showMyDrafts;}
  catch(e){setCreatorBusy(false);$('#creatorNext').textContent='Save draft on this device';creatorError(e.name==='QuotaExceededError'?'Device storage is full. Use a smaller video or a hosted video link. Your current selections are still here.':'Could not save the draft. Allow site storage or try another browser. Your current selections are still here.');}
}
async function showMyDrafts(){
  stopDialogMedia();releaseCreatorUrls();
  showDialog('<div class="dialog-body"><h2>Your drafts</h2><p id="draftStatus">Loading drafts from this device…</p><div id="draftList"></div><button class="primary" id="newDraft">Create a new listing</button></div>');
  $('#newDraft').onclick=()=>{listingDraft=newListingDraft();creatorStep=1;renderCreator();};
  try{const drafts=await draftStore('getAll');if(!$('#draftList'))return;drafts.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));$('#draftStatus').textContent=drafts.length?'Saved on this device only · Not published':'No saved drafts on this device yet.';$('#draftList').innerHTML=drafts.map(d=>`<button class="saved-draft" data-edit-draft="${escapeHTML(d.id)}"><img src="${draftMediaUrl(d.photos[0])}" alt=""><span><b>${escapeHTML(d.title)}</b><small>${d.photos.length} photos · ${d.videoMode==='file'&&d.video||d.videoMode==='link'&&d.videoLink?'Video included':'No video'} · ${escapeHTML(d.neighborhood)}</small></span><span> Edit ↗</span></button>`).join('');document.querySelectorAll('[data-edit-draft]').forEach(b=>b.onclick=()=>{listingDraft=drafts.find(d=>d.id===b.dataset.editDraft);creatorStep=1;renderCreator();});}
  catch(e){if($('#draftStatus'))$('#draftStatus').textContent='Draft storage is unavailable in this browser. You can still create a listing preview.';}
}
