const CHAT_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwMRncb4s858zQYSlkUqVD4XmMi9pjFraC7toEha1Dd-INn0V0OcWiv7ivD4gjOTT3rFA/exec';
const IMGBB_API_KEY='dcd38e938cece07962c8f5a37df2f131';
const IMGBB_API_URL='https://api.imgbb.com/1/upload';

let chatUserId=localStorage.getItem('chatUserId')||'anon_'+Date.now();
let chatUsername='Anónimo';
let isChatOpen=false;
let chatDB;
let isSyncing=false;
let displayedMessageIds=new Set();
let registeredUsers=new Map();
let allMessagesCache=[];
let currentPlayingVideo=null;
let currentVideoTime=0;
let lastTimestamp=0;
let editingMessageId=null;

localStorage.setItem('chatUserId',chatUserId);

function generateMessageId(msg){return msg.messageId||`msg_${msg.userId}_${msg.timestamp}_${msg.message.substring(0,20)}`}

function editMessage(msgId){
    const msg=allMessagesCache.find(m=>generateMessageId(m)===msgId);
    if(!msg||msg.userId!==chatUserId)return;
    
    editingMessageId=msgId;
    const input=document.getElementById('chatMessageInput');
    const sendBtn=document.getElementById('chatSendBtn');
    input.value=msg.message.replace(' (editado)','');
    sendBtn.textContent='Guardar';
    input.focus()
}

function deleteMessage(msgId){
    const msg=allMessagesCache.find(m=>generateMessageId(m)===msgId);
    if(!msg||msg.userId!==chatUserId)return;
    
    if(!confirm('¿Eliminar este mensaje?'))return;
    
    const btn=document.querySelector(`[data-msg-id="${msgId}"] .msg-action-btn[onclick*="deleteMessage"]`);
    if(btn)btn.textContent='⏳';
    
    fetch(`${CHAT_SCRIPT_URL}?action=deleteMessage&userId=${encodeURIComponent(chatUserId)}&messageId=${encodeURIComponent(msgId)}`)
        .then(res=>res.json())
        .then(data=>{
            if(data.deleted||data.success){
                const msgElement=document.querySelector(`[data-msg-id="${msgId}"]`);
                if(msgElement){
                    msgElement.style.opacity='0';
                    msgElement.style.transform='scale(0.8)';
                    setTimeout(()=>{
                        msgElement.remove();
                        displayedMessageIds.delete(msgId);
                        allMessagesCache=allMessagesCache.filter(m=>generateMessageId(m)!==msgId)
                    },300)
                }
            }else{
                alert('Error al eliminar mensaje')
            }
        })
        .catch(err=>{
            console.error('Error al eliminar:',err);
            alert('Error al eliminar mensaje')
        })
}

function cancelEdit(){
    editingMessageId=null;
    document.getElementById('chatMessageInput').value='';
    document.getElementById('chatSendBtn').textContent='Enviar'
}

function getUserColor(userId){
    let hash=0;
    for(let i=0;i<userId.length;i++){hash=userId.charCodeAt(i)+((hash<<5)-hash)}
    const colors=['rgba(255,107,107,0.15)','rgba(78,205,196,0.15)','rgba(255,195,113,0.15)','rgba(162,155,254,0.15)','rgba(255,159,243,0.15)','rgba(99,205,218,0.15)','rgba(253,167,223,0.15)','rgba(181,234,215,0.15)','rgba(255,218,121,0.15)','rgba(189,147,249,0.15)'];
    return colors[Math.abs(hash)%colors.length]
}

function openVideoModal(type,url,videoId){
    const modal=document.getElementById('videoModal');
    const content=document.getElementById('videoModalContent');
    
    if(type==='youtube'){
        content.innerHTML=`<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&start=${Math.floor(currentVideoTime)}" allowfullscreen allow="autoplay"></iframe>`
    }else if(type==='tiktok'||type==='discord'){
        content.innerHTML=`<video controls autoplay id="modalVideo"><source src="${url}" type="video/mp4">Tu navegador no soporta video.</video>`;
        setTimeout(()=>{
            const vid=document.getElementById('modalVideo');
            if(vid&&currentVideoTime>0){vid.currentTime=currentVideoTime}
        },100)
    }else if(type==='embed'){
        content.innerHTML=`<iframe src="${url}" allowfullscreen allow="autoplay"></iframe>`
    }else if(type==='direct'){
        content.innerHTML=`<video controls autoplay id="modalVideo"><source src="${url}" type="video/mp4">Tu navegador no soporta video.</video>`;
        setTimeout(()=>{
            const vid=document.getElementById('modalVideo');
            if(vid&&currentVideoTime>0){vid.currentTime=currentVideoTime}
        },100)
    }
    modal.classList.add('active')
}

function closeVideoModal(){
    const modal=document.getElementById('videoModal');
    const content=document.getElementById('videoModalContent');
    const vid=content.querySelector('video');
    if(vid){currentVideoTime=vid.currentTime}
    content.innerHTML='';
    modal.classList.remove('active')
}

document.addEventListener('visibilitychange',function(){
    if(document.hidden){
        const videos=document.querySelectorAll('.video-thumb-container video');
        videos.forEach(v=>{
            if(!v.paused&&document.pictureInPictureEnabled){
                v.requestPictureInPicture().catch(()=>{})
            }
        });
        const modalVid=document.querySelector('#modalVideo');
        if(modalVid&&!modalVid.paused&&document.pictureInPictureEnabled){
            modalVid.requestPictureInPicture().catch(()=>{})
        }
    }
});

function initChatDB(){
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open('ChatDatabase',1);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{chatDB=request.result;resolve(chatDB)};
        request.onupgradeneeded=(event)=>{
            const db=event.target.result;
            if(!db.objectStoreNames.contains('messages')){
                const objectStore=db.createObjectStore('messages',{keyPath:'id',autoIncrement:true});
                objectStore.createIndex('timestamp','timestamp',{unique:false})
            }
        }
    })
}

async function saveChatToIndexedDB(messages){
    if(!chatDB)return;
    const transaction=chatDB.transaction(['messages'],'readwrite');
    const objectStore=transaction.objectStore('messages');
    objectStore.clear();
    messages.forEach(msg=>{
        objectStore.add({
            userId:msg.userId,
            username:msg.username,
            message:msg.message,
            timestamp:msg.timestamp
        })
    });
    return transaction.complete
}

async function loadChatFromIndexedDB(){
    if(!chatDB)return[];
    return new Promise((resolve,reject)=>{
        const transaction=chatDB.transaction(['messages'],'readonly');
        const objectStore=transaction.objectStore('messages');
        const request=objectStore.getAll();
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error)
    })
}

function toggleChat(){
    const chatContainer=document.getElementById('chatContainer');
    const chatBtnText=document.getElementById('chatBtnText');
    isChatOpen=!isChatOpen;
    
    if(isChatOpen){
        chatContainer.classList.remove('hidden');
        chatContainer.classList.add('active');
        chatBtnText.textContent='Ocultar Chat';
        loadChatProfile();
        const container=document.getElementById('chatMessages');
        const hasMessages=container.children.length>0&&!container.querySelector('.loading-chat');
        if(hasMessages){
            container.scrollTop=container.scrollHeight
        }else{
            loadChatMessages()
        }
        syncMessagesFromServer()
    }else{
        chatContainer.classList.remove('active');
        chatContainer.classList.add('hidden');
        chatBtnText.textContent='Abrir Chat'
    }
}

function loadChatProfile(){
    const savedUsername=localStorage.getItem('chatUsername');
    if(savedUsername){chatUsername=savedUsername}
    document.getElementById('chatUsername').textContent=chatUsername
}

function openChatNameModal(){
    const newName=prompt('Ingresa tu nombre de usuario:',chatUsername);
    if(newName&&newName.trim()){
        chatUsername=newName.trim();
        localStorage.setItem('chatUsername',chatUsername);
        document.getElementById('chatUsername').textContent=chatUsername
    }
}

function isImageUrl(url){
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url)||
           url.includes('gstatic.com/images')||
           url.includes('rbxcdn.com')||
           url.includes('imgur.com')||
           url.includes('i.ibb.co')||
           (url.includes('cdn.discordapp.com/attachments')&&!url.match(/\.(mp4|webm|mov)/i))
}

function isVideoUrl(url){
    return /\.(mp4|webm|ogg|mov|avi)(\?.*)?$/i.test(url)||
           url.includes('youtube.com/watch')||
           url.includes('youtu.be/')||
           url.includes('tiktok.com')||
           (url.includes('cdn.discordapp.com')&&url.match(/\.(mp4|webm|mov)/i))||
           url.includes('pornhub.com/view_video')||
           url.includes('facebook.com')||
           url.includes('fb.watch')||
           url.includes('instagram.com')
}

async function getTikTokVideo(url){
    try{
        const api="https://www.tikwm.com/api/?url="+encodeURIComponent(url);
        const response=await fetch(api);
        const data=await response.json();
        if(data.data&&data.data.play){
            return{videoUrl:data.data.play,thumbUrl:data.data.cover||null,success:true}
        }
        return{success:false,originalUrl:url}
    }catch(error){
        console.error('Error TikTok API:',error);
        return{success:false,originalUrl:url}
    }
}

async function getVideoEmbedInfo(url){
    if(url.includes('pornhub.com/view_video')){
        const match=url.match(/viewkey=([a-z0-9]+)/i);
        if(match)return{type:'pornhub',id:match[1],embed:`https://www.pornhub.com/embed/${match[1]}`,thumb:null,platform:'PornHub'}
    }
    if(url.includes('youtube.com/watch')||url.includes('youtu.be/')){
        let videoId='';
        if(url.includes('youtu.be/')){videoId=url.split('youtu.be/')[1].split('?')[0]}
        else{videoId=url.split('v=')[1].split('&')[0]}
        return{type:'youtube',id:videoId,embed:`https://www.youtube.com/embed/${videoId}`,thumb:`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,platform:'YouTube'}
    }
    if(url.includes('tiktok.com')){
        const tiktokData=await getTikTokVideo(url);
        if(tiktokData&&tiktokData.success){
            return{type:'tiktok',videoUrl:tiktokData.videoUrl,thumb:tiktokData.thumbUrl,platform:'TikTok',originalUrl:url,useApi:true}
        }else{
            const videoId=url.match(/video\/(\d+)/)?.[1]||'';
            return{type:'tiktok',videoId:videoId,platform:'TikTok',originalUrl:url,useApi:false,embedUrl:`https://www.tiktok.com/embed/v2/${videoId}`}
        }
    }
    if(url.includes('instagram.com/p/')||url.includes('instagram.com/reel/')){
        let postId='';
        if(url.includes('/p/')){postId=url.split('/p/')[1].split('/')[0]}
        else if(url.includes('/reel/')){postId=url.split('/reel/')[1].split('/')[0]}
        return{type:'instagram',url:url,postId:postId,embed:`https://www.instagram.com/p/${postId}/embed`,platform:'Instagram'}
    }
    if(url.includes('facebook.com')||url.includes('fb.watch')){
        const encodedUrl=encodeURIComponent(url);
        return{type:'facebook',url:url,embed:`https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&width=560`,platform:'Facebook'}
    }
    return null
}

function openSocialModal(url,platform){
    const modal=document.getElementById('videoModal');
    const content=document.getElementById('videoModalContent');
    content.innerHTML=`<iframe src="${url}" allowfullscreen allow="autoplay"></iframe>`;
    modal.classList.add('active')
}

function toggleVideoControls(el){
    const container=el.closest('.video-thumb-container');
    if(!container)return;
    container.classList.add('controls-active');
    if(container.hideTimeout)clearTimeout(container.hideTimeout);
    container.hideTimeout=setTimeout(()=>{container.classList.remove('controls-active')},3000)
}

function trackVideoTime(el){
    if(el.tagName==='VIDEO'){
        currentPlayingVideo=el;
        el.addEventListener('timeupdate',()=>{currentVideoTime=el.currentTime})
    }
}

function extractUrls(text){
    const urlRegex=/(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex)||[]
}

function downloadImage(imageUrl,filename){
    fetch(imageUrl).then(response=>response.blob()).then(blob=>{
        const url=window.URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;
        a.download=filename||'imagen.jpg';
        a.click();
        window.URL.revokeObjectURL(url)
    }).catch(err=>{showCopyNotification('Error al descargar imagen')})
}

function downloadVideo(videoUrl,filename){
    fetch(videoUrl).then(response=>response.blob()).then(blob=>{
        const url=window.URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;
        a.download=filename||'video.mp4';
        a.click();
        window.URL.revokeObjectURL(url)
    }).catch(err=>{showCopyNotification('Error al descargar video')})
}

function updateRegisteredUsers(messages){
    messages.forEach(msg=>{
        if(msg.username&&msg.userId){
            registeredUsers.set(msg.username.toLowerCase(),{username:msg.username,userId:msg.userId})
        }
    })
}

async function processMessageContent(msg){
    let text=msg.message;
    const urls=extractUrls(text);
    let mediaHtml='';
    let processedUrls=[];
    
    for(const url of urls){
        if(isImageUrl(url)){
            const imageName=url.split('/').pop().split('?')[0]||'imagen.jpg';
            mediaHtml+=`<div class="message-media-container"><div class="message-image-wrapper"><img class="message-image" src="${url}" alt="Imagen" onerror="this.style.display='none'"><button class="image-download-btn" onclick="downloadImage('${url}','${imageName}')" title="Descargar imagen"><svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg></button></div></div>`;
            text=text.replace(url,'');
            processedUrls.push(url)
        }else if(isVideoUrl(url)){
            const videoInfo=await getVideoEmbedInfo(url);
            
            if(videoInfo&&videoInfo.type==='youtube'){
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container youtube" onclick="toggleVideoControls(this)"><iframe src="${videoInfo.embed}" allowfullscreen></iframe><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('youtube','${url}','${videoInfo.id}')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">${videoInfo.platform}</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }else if(videoInfo&&videoInfo.type==='tiktok'){
                const videoName='tiktok_video.mp4';
                if(videoInfo.useApi){
                    mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container tiktok" onclick="toggleVideoControls(this)"><video controls muted loop onplay="trackVideoTime(this)" preload="metadata"><source src="${videoInfo.videoUrl}" type="video/mp4"></video><button class="video-download-btn" onclick="event.stopPropagation();downloadVideo('${videoInfo.videoUrl}','${videoName}')" title="Descargar video"><svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg></button><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('tiktok','${videoInfo.videoUrl}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">${videoInfo.platform}</span></div></div>`
                }else{
                    mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container tiktok" onclick="toggleVideoControls(this)"><iframe src="${videoInfo.embedUrl}" allowfullscreen scrolling="no" style="border:none;"></iframe><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('embed','${videoInfo.embedUrl}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">${videoInfo.platform} (Embed)</span></div></div>`
                }
                text=text.replace(url,'');
                processedUrls.push(url)
            }else if(videoInfo&&videoInfo.type==='pornhub'){
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container" onclick="toggleVideoControls(this)"><iframe src="${videoInfo.embed}" allowfullscreen></iframe><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('embed','${videoInfo.embed}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">${videoInfo.platform}</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }else if(videoInfo&&videoInfo.type==='instagram'){
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container instagram" onclick="openSocialModal('${videoInfo.embed}','${videoInfo.platform}')"><iframe src="${videoInfo.embed}" allowfullscreen scrolling="no" style="pointer-events:none;"></iframe><div class="video-play-center"><svg viewBox="0 0 24 24"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h4v-2H5V8h14v10h-4v2h4c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-7 6l-4 4h3v6h2v-6h3l-4-4z"/></svg></div><span class="video-label">${videoInfo.platform}</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }else if(videoInfo&&videoInfo.type==='facebook'){
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container facebook" onclick="toggleVideoControls(this)"><iframe src="${videoInfo.embed}" allowfullscreen scrolling="no" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('embed','${videoInfo.embed}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">${videoInfo.platform}</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }else if(url.includes('cdn.discordapp.com')&&url.match(/\.(mp4|webm|mov)/i)){
                const videoName=url.split('/').pop().split('?')[0]||'video.mp4';
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container discord" onclick="toggleVideoControls(this)"><video controls muted loop onplay="trackVideoTime(this)"><source src="${url}" type="video/mp4"></video><button class="video-download-btn" onclick="event.stopPropagation();downloadVideo('${url}','${videoName}')" title="Descargar video"><svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg></button><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('discord','${url}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">Discord</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }else{
                const videoName=url.split('/').pop().split('?')[0]||'video.mp4';
                mediaHtml+=`<div class="message-media-container"><div class="video-thumb-container" onclick="toggleVideoControls(this)"><video controls muted loop onplay="trackVideoTime(this)"><source src="${url}" type="video/mp4"></video><button class="video-download-btn" onclick="event.stopPropagation();downloadVideo('${url}','${videoName}')" title="Descargar video"><svg viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg></button><button class="video-maximize-btn" onclick="event.stopPropagation();openVideoModal('direct','${url}','')" title="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button><span class="video-label">Video</span></div></div>`;
                text=text.replace(url,'');
                processedUrls.push(url)
            }
        }
    }
    
    urls.forEach(url=>{
        if(!processedUrls.includes(url)){
            text=text.replace(url,`<a class="message-url" href="${url}" target="_blank">${url}</a>`)
        }
    });
    
    text=processMentions(text);
    return{text:text.trim(),mediaHtml}
}

function processMentions(message){
    let processed=message;
    if(typeof gamesData!=='undefined'){
        gamesData.forEach(game=>{
            const gameAcronym=generateAcronym(game.name);
            const regexName=new RegExp('#'+game.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
            const regexAcronym=new RegExp('#'+gameAcronym.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
            processed=processed.replace(regexName,`<span class="game-mention" onclick="mentionGameClick('${game.name}')">#${game.name}</span>`);
            processed=processed.replace(regexAcronym,`<span class="game-mention" onclick="mentionGameClick('${game.name}')">#${gameAcronym}</span>`)
        })
    }
    return processed
}

function mentionGameClick(gameName){
    if(typeof currentIndex!=='undefined'&&typeof gamesData!=='undefined'){
        const gameIndex=gamesData.findIndex(g=>g.name===gameName);
        if(gameIndex!==-1){
            currentIndex=gameIndex;
            if(typeof updateCoverflow==='function'){updateCoverflow()}
            if(isChatOpen){toggleChat()}
            showCopyNotification(`Mostrando: ${gameName}`)
        }
    }
}

function processUserMentions(text){
    return text
}

async function createMessageElement(msg){
    const messageDiv=document.createElement('div');
    messageDiv.className='chat-message';
    const bgColor=msg.userId===chatUserId?'rgba(0,255,204,0.15)':getUserColor(msg.userId);
    messageDiv.style.backgroundColor=bgColor;
    messageDiv.setAttribute('data-original-bg',bgColor);
    messageDiv.setAttribute('data-user-id',msg.userId);
    
    const msgId=generateMessageId(msg);
    messageDiv.setAttribute('data-msg-id',msgId);
    
    const time=new Date(msg.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    const{text,mediaHtml}=await processMessageContent(msg);
    
    const editDeleteBtns=msg.userId===chatUserId?`<div class="message-actions"><button class="msg-action-btn" onclick="editMessage('${msgId}')" title="Editar">✏️</button><button class="msg-action-btn" onclick="deleteMessage('${msgId}')" title="Eliminar">🗑️</button></div>`:'';
    
    messageDiv.innerHTML=`<div class="message-header"><div class="message-icon"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div><span class="message-username">${msg.username}</span><span class="message-time">${time}</span>${editDeleteBtns}</div>${text?`<div class="message-text">${text}</div>`:''}${mediaHtml}`;
    
    return messageDiv
}

async function addMessageToDOM(msg,allMessages){
    const container=document.getElementById('chatMessages');
    const msgId=generateMessageId(msg);
    
    if(displayedMessageIds.has(msgId)){return false}
    
    const existingMsg=container.querySelector(`[data-msg-id="${msgId}"]`);
    if(existingMsg){
        displayedMessageIds.add(msgId);
        return false
    }
    
    const messageDiv=await createMessageElement(msg);
    container.appendChild(messageDiv);
    displayedMessageIds.add(msgId);
    return true
}

async function displayMessages(messages){
    if(!messages||messages.length===0){
        const container=document.getElementById('chatMessages');
        if(container.children.length===0||container.querySelector('.loading-chat')){
            container.innerHTML='<div class="loading-chat">No hay mensajes aún. ¡Sé el primero en escribir!</div>'
        }
        return
    }
    
    const container=document.getElementById('chatMessages');
    const wasAtBottom=container.scrollHeight-container.scrollTop<=container.clientHeight+50;
    
    const loadingMsg=container.querySelector('.loading-chat');
    if(loadingMsg){container.removeChild(loadingMsg)}
    
    updateRegisteredUsers(messages);
    
    const currentMessageIds=new Set(messages.map(m=>generateMessageId(m)));
    const displayedArray=Array.from(displayedMessageIds);
    
    displayedArray.forEach(displayedId=>{
        if(!currentMessageIds.has(displayedId)){
            const msgElement=document.querySelector(`[data-msg-id="${displayedId}"]`);
            if(msgElement){
                msgElement.style.opacity='0';
                setTimeout(()=>{
                    msgElement.remove();
                    displayedMessageIds.delete(displayedId)
                },300)
            }else{
                displayedMessageIds.delete(displayedId)
            }
        }
    });
    
    allMessagesCache=messages;
    
    for(const msg of messages){
        await addMessageToDOM(msg,messages)
    }
    
    if(wasAtBottom){container.scrollTop=container.scrollHeight}
}

async function loadChatMessages(){
    try{
        const container=document.getElementById('chatMessages');
        const cachedMessages=await loadChatFromIndexedDB();
        
        if(cachedMessages.length>0){
            await displayMessages(cachedMessages)
        }else{
            if(container.children.length===0||container.querySelector('.loading-chat')){
                container.innerHTML='<div class="loading-chat">Cargando mensajes...</div>'
            }
        }
        
        if(!isSyncing){syncMessagesFromServer()}
    }catch(error){
        console.error('Error al cargar mensajes del chat:',error)
    }
}

async function syncMessagesFromServer(){
    if(isSyncing)return;
    isSyncing=true;
    try{
        const response=await fetch(`${CHAT_SCRIPT_URL}?action=getMessages`);
        const data=await response.json();
        
        if(data.cleared){
            displayedMessageIds.clear();
            allMessagesCache=[];
            lastTimestamp=0;
            const container=document.getElementById('chatMessages');
            container.innerHTML='<div class="loading-chat">💬 Chat limpiado completamente</div>';
            await saveChatToIndexedDB([]);
            setTimeout(()=>{
                container.innerHTML='<div class="loading-chat">No hay mensajes aún. ¡Sé el primero en escribir!</div>'
            },2000);
            return
        }
        
        if(data.messages){
            if(data.messages.length===0&&allMessagesCache.length>0){
                displayedMessageIds.clear();
                allMessagesCache=[];
                lastTimestamp=0;
                const container=document.getElementById('chatMessages');
                container.innerHTML='<div class="loading-chat">💬 Chat limpiado</div>';
                await saveChatToIndexedDB([]);
                setTimeout(()=>{
                    container.innerHTML='<div class="loading-chat">No hay mensajes aún. ¡Sé el primero en escribir!</div>'
                },2000);
                return
            }
            
            await saveChatToIndexedDB(data.messages);
            const container=document.getElementById('chatMessages');
            const loadingMsg=container.querySelector('.loading-chat');
            if(loadingMsg){container.removeChild(loadingMsg)}
            await displayMessages(data.messages);
            if(data.messages.length>0){
                lastTimestamp=Math.max(...data.messages.map(m=>m.timestamp))
            }
        }
    }catch(error){
        console.error('Error al sincronizar mensajes:',error)
    }finally{
        isSyncing=false
    }
}

async function checkNewChatMessages(){
    if(!isSyncing){syncMessagesFromServer()}
}

function showSuggestionsPopup(type,items){
    const popup=document.getElementById('suggestionsPopup');
    popup.innerHTML='';
    
    if(items.length===0){
        popup.classList.remove('active');
        return
    }
    
    items.slice(0,5).forEach(item=>{
        const div=document.createElement('div');
        div.className='suggestion-item-chat';
        
        if(type==='game'){
            div.innerHTML=`<div class="suggestion-icon game"><svg viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div><div class="suggestion-info"><div class="suggestion-name">${item.name}</div><div class="suggestion-type">#${item.acronym}</div></div>`;
            div.onclick=()=>{
                const input=document.getElementById('chatMessageInput');
                const cursorPos=input.selectionStart;
                const textBefore=input.value.substring(0,cursorPos);
                const lastHash=textBefore.lastIndexOf('#');
                input.value=textBefore.substring(0,lastHash)+'#'+item.name+' '+input.value.substring(cursorPos);
                popup.classList.remove('active');
                input.focus()
            }
        }
        
        popup.appendChild(div)
    });
    
    popup.classList.add('active')
}

function handleChatInput(e){
    const input=e.target;
    const cursorPos=input.selectionStart;
    const textBefore=input.value.substring(0,cursorPos);
    const lastHash=textBefore.lastIndexOf('#');
    const lastSpace=Math.max(textBefore.lastIndexOf(' '),textBefore.lastIndexOf('\n'));
    
    if(lastHash>lastSpace&&typeof gamesData!=='undefined'){
        const searchTerm=textBefore.substring(lastHash+1).toLowerCase();
        const matches=gamesData.filter(game=>{
            const name=game.name.toLowerCase();
            const acronym=generateAcronym(game.name).toLowerCase();
            return name.includes(searchTerm)||acronym.includes(searchTerm)||searchTerm===''
        }).map(game=>({name:game.name,acronym:generateAcronym(game.name)}));
        showSuggestionsPopup('game',matches.slice(0,3))
    }else{
        document.getElementById('suggestionsPopup').classList.remove('active')
    }
}

async function sendChatMessage(){
    const input=document.getElementById('chatMessageInput');
    const message=input.value.trim();
    if(!message)return;
    
    const btn=document.getElementById('chatSendBtn');
    const originalText=btn.textContent;
    btn.disabled=true;
    btn.textContent='Enviando...';
    
    document.getElementById('suggestionsPopup').classList.remove('active');
    
    try{
        if(editingMessageId){
            await fetch(`${CHAT_SCRIPT_URL}?action=editMessage&userId=${encodeURIComponent(chatUserId)}&messageId=${encodeURIComponent(editingMessageId)}&newMessage=${encodeURIComponent(message)}`);
            editingMessageId=null;
            btn.textContent='Enviar'
        }else{
            const timestamp=Date.now();
            const url=`${CHAT_SCRIPT_URL}?action=sendMessage&userId=${encodeURIComponent(chatUserId)}&username=${encodeURIComponent(chatUsername)}&message=${encodeURIComponent(message)}&timestamp=${timestamp}`;
            await fetch(url)
        }
        
        input.value='';
        setTimeout(()=>syncMessagesFromServer(),500)
    }catch(error){
        console.error('Error al enviar mensaje:',error);
        input.value=message
    }finally{
        btn.disabled=false;
        if(btn.textContent!=='Enviar')btn.textContent=originalText
    }
}

async function checkPendingMessage(){
    const pending=localStorage.getItem('pendingChatMessage');
    if(pending){
        try{
            const data=JSON.parse(pending);
            if(Date.now()-data.timestamp<60000){
                const url=`${CHAT_SCRIPT_URL}?action=sendMessage&userId=${encodeURIComponent(data.userId)}&username=${encodeURIComponent(data.username)}&message=${encodeURIComponent(data.message)}&timestamp=${data.timestamp}`;
                await fetch(url)
            }
            localStorage.removeItem('pendingChatMessage')
        }catch(error){
            console.error('Error al enviar mensaje pendiente:',error);
            localStorage.removeItem('pendingChatMessage')
        }
    }
}

function openFileInput(){document.getElementById('imageInput').click()}

async function uploadImageToImgBB(file){
    const uploadBtn=document.getElementById('uploadImageBtn');
    const originalHTML=uploadBtn.innerHTML;
    uploadBtn.disabled=true;
    uploadBtn.innerHTML='<span>⏳</span>';
    
    try{
        const reader=new FileReader();
        reader.onload=async(e)=>{
            const base64Image=e.target.result.split(',')[1];
            const formData=new FormData();
            formData.append('key',IMGBB_API_KEY);
            formData.append('image',base64Image);
            
            const response=await fetch(IMGBB_API_URL,{method:'POST',body:formData});
            const data=await response.json();
            
            if(data.success){
                const imageUrl=data.data.url;
                const messageData={
                    message:imageUrl,
                    username:chatUsername,
                    userId:chatUserId,
                    timestamp:Date.now()
                };
                
                localStorage.setItem('pendingChatMessage',JSON.stringify(messageData));
                
                try{
                    const url=`${CHAT_SCRIPT_URL}?action=sendMessage&userId=${encodeURIComponent(chatUserId)}&username=${encodeURIComponent(chatUsername)}&message=${encodeURIComponent(imageUrl)}&timestamp=${messageData.timestamp}`;
                    
                    await fetch(url);
                    localStorage.removeItem('pendingChatMessage');
                    setTimeout(()=>syncMessagesFromServer(),500);
                    showCopyNotification('✨ Imagen enviada!')
                }catch(error){
                    console.error('Error al enviar mensaje:',error);
                    showCopyNotification('❌ Error al enviar la imagen')
                }
            }else{
                showCopyNotification('❌ Error al subir la imagen')
            }
            
            uploadBtn.disabled=false;
            uploadBtn.innerHTML=originalHTML
        };
        
        reader.onerror=()=>{
            showCopyNotification('❌ Error al leer la imagen');
            uploadBtn.disabled=false;
            uploadBtn.innerHTML=originalHTML
        };
        
        reader.readAsDataURL(file)
    }catch(error){
        console.error('Error al subir imagen:',error);
        showCopyNotification('❌ Error al subir la imagen');
        uploadBtn.disabled=false;
        uploadBtn.innerHTML=originalHTML
    }
}

document.addEventListener('DOMContentLoaded',async function(){
    const chatInput=document.getElementById('chatMessageInput');
    if(chatInput){
        chatInput.addEventListener('keypress',function(e){
            if(e.key==='Enter'&&!e.shiftKey){
                e.preventDefault();
                sendChatMessage()
            }
        });
        chatInput.addEventListener('input',handleChatInput);
        chatInput.addEventListener('keydown',function(e){
            if(e.key==='Escape'){
                document.getElementById('suggestionsPopup').classList.remove('active');
                if(editingMessageId){cancelEdit()}
            }
        })
    }
    
    const imageInput=document.getElementById('imageInput');
    if(imageInput){
        imageInput.addEventListener('change',(e)=>{
            const file=e.target.files[0];
            if(file&&file.type.startsWith('image/')){
                uploadImageToImgBB(file)
            }else{
                showCopyNotification('⚠️ Por favor selecciona una imagen válida')
            }
            e.target.value=''
        })
    }
    
    setInterval(checkNewChatMessages,1000);
    
    await initChatDB().then(async()=>{
        const cachedMessages=await loadChatFromIndexedDB();
        if(cachedMessages.length>0){await displayMessages(cachedMessages)}
        syncMessagesFromServer()
    })
});