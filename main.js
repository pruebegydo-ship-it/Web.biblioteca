const GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbzZqCbnJDnkIZ_lk8OPxPQgXFqRSSBjUOHX7wr3G9VklP07zB9_0FHPNiF6RE4Uvx5T/exec";
const CLOUDFLARE_API="https://black-dust-9a67.nuryxd7.workers.dev";
const DB_NAME="RobloxIconsDB";
const DB_VERSION=1;
const STORE_NAME="icons";
const CACHE_VERSION="v1.0.0";

const gamesData=[
    {name:"Dragon Blox Ultimate",description:"Script avanzado para farming automático y boosts de poder.",robloxUrl:"https://www.roblox.com/es/games/3311165597/Dragon-Blox-Ultimate",scriptUrl:"https://raw.githubusercontent.com/Colato6/Prueba.1/refs/heads/main/Farm.lua"},
    {name:"War Machines",description:"Script avanzado para farming automático y boosts de poder.",robloxUrl:"https://www.roblox.com/es/games/12828227139/War-Machines",scriptUrl:"https://raw.githubusercontent.com/Colato6/Prueba.1/refs/heads/main/Farm.lua"},
    {name:"Muscle Legends",description:"Script avanzado para farming automático y boosts de poder.",robloxUrl:"https://www.roblox.com/es/games/3623096087/Muscle-Legends",scriptUrl:"https://raw.githubusercontent.com/Colato6/Prueba.1/refs/heads/main/Farm.lua"},
    {name:"Dragon Ball Rage",description:"Script avanzado para farming automático y boosts de poder,AutoTrafoamcion Ataques y varias mas",robloxUrl:"https://www.roblox.com/es/games/71315343/SSJ3-Dragon-Ball-Rage",scriptUrl:"https://raw.githubusercontent.com/Colato6/Prueba.1/refs/heads/main/Farm.lua"}
];

const track=document.getElementById('track');
let cards=[];
const indicatorsContainer=document.getElementById('indicators');
const suggestionsContainer=document.getElementById('suggestions');
let currentIndex=0;
let isDragging=false;
let startX=0;
let startTime=0;
let gameMapping={};
let db=null;

function initDB(){
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open(DB_NAME,DB_VERSION);
        
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
            db=request.result;
            checkAndClearOldCache();
            resolve(db);
        };
        
        request.onupgradeneeded=(e)=>{
            const database=e.target.result;
            if(!database.objectStoreNames.contains(STORE_NAME)){
                database.createObjectStore(STORE_NAME,{keyPath:'placeId'});
            }
        };
    });
}

function checkAndClearOldCache(){
    const storedVersion=localStorage.getItem('CACHE_VERSION');
    if(storedVersion!==CACHE_VERSION){
        console.log('Nueva versión detectada, limpiando caché...');
        clearAllIcons().then(()=>{
            localStorage.setItem('CACHE_VERSION',CACHE_VERSION);
            console.log('Caché limpiado, versión actualizada a:',CACHE_VERSION);
        });
    }
}

async function clearAllIcons(){
    return new Promise((resolve,reject)=>{
        const transaction=db.transaction([STORE_NAME],'readwrite');
        const store=transaction.objectStore(STORE_NAME);
        const request=store.clear();
        request.onsuccess=()=>resolve();
        request.onerror=()=>reject(request.error);
    });
}

async function saveIconToDB(placeId,iconBlob){
    return new Promise((resolve,reject)=>{
        const transaction=db.transaction([STORE_NAME],'readwrite');
        const store=transaction.objectStore(STORE_NAME);
        const request=store.put({
            placeId:placeId,
            blob:iconBlob,
            timestamp:Date.now(),
            version:CACHE_VERSION
        });
        request.onsuccess=()=>resolve();
        request.onerror=()=>reject(request.error);
    });
}

async function getIconFromDB(placeId){
    return new Promise((resolve,reject)=>{
        const transaction=db.transaction([STORE_NAME],'readonly');
        const store=transaction.objectStore(STORE_NAME);
        const request=store.get(placeId);
        
        request.onsuccess=()=>{
            if(request.result&&request.result.version===CACHE_VERSION){
                resolve(request.result.blob);
            }else{
                resolve(null);
            }
        };
        request.onerror=()=>reject(request.error);
    });
}

function extractPlaceId(url){
    const match=url.match(/games\/(\d+)/);
    return match?match[1]:null;
}

async function fetchGameIcon(robloxUrl){
    const placeId=extractPlaceId(robloxUrl);
    if(!placeId)return null;
    
    try{
        const cachedBlob=await getIconFromDB(placeId);
        if(cachedBlob){
            return URL.createObjectURL(cachedBlob);
        }
    }catch(error){
        console.log('IndexedDB read error:',error);
    }
    
    try{
        const response=await fetch(`${CLOUDFLARE_API}/game/${placeId}`);
        const data=await response.json();
        
        let iconUrl=null;
        if(data.success&&data.iconUrl){
            iconUrl=data.iconUrl;
        }else if(data.success&&data.thumbnailUrl){
            iconUrl=data.thumbnailUrl;
        }
        
        if(iconUrl){
            const imageResponse=await fetch(iconUrl);
            const blob=await imageResponse.blob();
            
            try{
                await saveIconToDB(placeId,blob);
            }catch(error){
                console.log('IndexedDB save error:',error);
            }
            
            return URL.createObjectURL(blob);
        }
    }catch(error){
        console.error('Error fetching icon:',error);
    }
    
    return null;
}

function injectImageStyles(){
    const style=document.createElement('style');
    style.textContent=`
        .card-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
        }
        .card-image-container {
            width: 100%;
            height: 200px;
            overflow: hidden;
            border-radius: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
        }
    `;
    document.head.appendChild(style);
}

function generateAcronym(gameName){
    const cleanName=gameName.replace(/[^\w\s]/g,'').trim();
    const words=cleanName.split(/\s+/).filter(word=>word.length>2&&!['the','and','of','to','you','get','out'].includes(word.toLowerCase()));
    if(words.length<=2){
        return cleanName.split(/\s+/).map(word=>word.charAt(0).toUpperCase()).join('')
    }
    return words.slice(0,4).map(word=>word.charAt(0).toUpperCase()).join('')
}

function generateGameMappings(){
    gameMapping={};
    cards.forEach(card=>{
        const gameName=card.getAttribute('data-game')||card.querySelector('.card-title').textContent.trim();
        const acronym=generateAcronym(gameName);
        const variations=[
            gameName.toLowerCase(),
            acronym.toLowerCase(),
            gameName.replace(/\s+/g,'').toLowerCase(),
            gameName.replace(/\s+/g,'-').toLowerCase(),
            gameName.split(' ').slice(0,2).join(' ').toLowerCase()
        ];
        variations.forEach(variation=>{
            if(variation&&variation.length>0){
                gameMapping[variation]={
                    element:card,
                    title:gameName,
                    acronym:acronym,
                    index:cards.indexOf(card)
                }
            }
        })
    })
}

async function renderGameCards(){
    track.innerHTML='';
    const template=document.getElementById('script-card-template');
    
    for(const game of gamesData){
        const card=template.content.cloneNode(true).children[0];
        const cleanGameNameForFilename=game.name.replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'_');
        
        card.setAttribute('data-game',game.name);
        card.querySelector('.copy-btn').setAttribute('onclick',`copyScript('${game.scriptUrl}')`);
        
        const cardImage=card.querySelector('.card-image');
        cardImage.alt=game.name;
        cardImage.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="512"%3E%3Crect fill="%23667eea" width="512" height="512"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="48" fill="white"%3ECargando...%3C/text%3E%3C/svg%3E';
        
        card.querySelector('.card-title').textContent=game.name;
        card.querySelector('.card-description').textContent=game.description;
        card.querySelector('.button-container a').href=game.robloxUrl;
        card.querySelector('.button-container button').setAttribute('onclick',`downloadScript('${cleanGameNameForFilename}',\`loadstring(game:HttpGet('${game.scriptUrl}'))()\`)`);
        
        track.appendChild(card);
        
        fetchGameIcon(game.robloxUrl).then(blobUrl=>{
            if(blobUrl){
                cardImage.src=blobUrl;
            }else{
                cardImage.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="512"%3E%3Crect fill="%23667eea" width="512" height="512"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="48" fill="white"%3E'+encodeURIComponent(generateAcronym(game.name))+'%3C/text%3E%3C/svg%3E';
            }
        });
    }
    
    cards=Array.from(track.children);
    generateGameMappings();
    createIndicators();
    updateCoverflow()
}

function createIndicators(){
    indicatorsContainer.innerHTML='';
    cards.forEach((_,index)=>{
        const indicator=document.createElement('div');
        indicator.className='indicator';
        indicator.onclick=()=>goToCard(index);
        indicatorsContainer.appendChild(indicator)
    })
}

function updateIndicators(){
    const indicators=indicatorsContainer.querySelectorAll('.indicator');
    indicators.forEach((indicator,index)=>{
        indicator.classList.toggle('active',index===currentIndex)
    })
}

function updateCoverflow(){
    const visibleCards=cards.filter(card=>card.style.display!=='none');
    if(visibleCards.length===0)return;
    
    currentIndex=Math.max(0,Math.min(currentIndex,visibleCards.length-1));
    
    visibleCards.forEach((card,visIndex)=>{
        const offset=visIndex-currentIndex;
        const x=offset*250;
        const rotateY=Math.max(-35,Math.min(35,offset*25));
        const z=-Math.abs(offset)*80;
        const scale=Math.max(0.75,1-Math.abs(offset)*0.1);
        const opacity=Math.max(0.5,1-Math.abs(offset)*0.25);
        const zIndex=100-Math.abs(offset);
        
        gsap.to(card,{
            duration:0.6,
            x:x,
            rotateY:rotateY,
            z:z,
            scale:scale,
            opacity:opacity,
            zIndex:zIndex,
            ease:'power2.out',
            onComplete:()=>{
                card.classList.toggle('active',offset===0);
                card.style.pointerEvents=offset===0?'auto':'none'
            }
        })
    });
    
    updateIndicators()
}

function nextCard(){
    const visibleCards=cards.filter(c=>c.style.display!=='none');
    currentIndex=(currentIndex+1)%visibleCards.length;
    updateCoverflow()
}

function previousCard(){
    const visibleCards=cards.filter(c=>c.style.display!=='none');
    currentIndex=(currentIndex-1+visibleCards.length)%visibleCards.length;
    updateCoverflow()
}

function goToCard(index){
    currentIndex=index;
    updateCoverflow()
}

function smartSearch(searchTerm,gameName,acronym){
    const search=searchTerm.toLowerCase().trim();
    const name=gameName.toLowerCase();
    const acr=acronym.toLowerCase();
    
    if(!search)return true;
    if(search===acr)return true;
    if(acr.startsWith(search))return true;
    if(name.includes(search))return true;
    
    const searchWords=search.split(' ');
    const nameWords=name.split(' ');
    return searchWords.every(searchWord=>
        nameWords.some(nameWord=>
            nameWord.includes(searchWord)||searchWord.includes(nameWord)
        )
    )
}

function showSuggestions(searchTerm){
    if(!searchTerm||searchTerm.length<1){
        suggestionsContainer.style.display='none';
        return
    }
    
    const suggestions=[];
    const addedTitles=new Set();
    
    Object.values(gameMapping).forEach(game=>{
        if(!addedTitles.has(game.title)&&smartSearch(searchTerm,game.title,game.acronym)){
            suggestions.push(game);
            addedTitles.add(game.title)
        }
    });
    
    if(suggestions.length>0){
        suggestionsContainer.innerHTML='';
        suggestions.slice(0,5).forEach(game=>{
            const item=document.createElement('div');
            item.className='suggestion-item';
            item.innerHTML=`<span>${game.title}</span><span class="suggestion-acronym">${game.acronym}</span>`;
            item.onclick=()=>{
                searchInput.value=game.title;
                filterCards(game.title);
                suggestionsContainer.style.display='none';
                goToCard(game.index)
            };
            suggestionsContainer.appendChild(item)
        });
        suggestionsContainer.style.display='block'
    }else{
        suggestionsContainer.style.display='none'
    }
}

function filterCards(searchTerm){
    if(!searchTerm){
        cards.forEach(card=>card.style.display='block')
    }else{
        cards.forEach(card=>{
            const gameName=card.getAttribute('data-game')||card.querySelector('.card-title').textContent.trim();
            const acronym=generateAcronym(gameName);
            const matches=smartSearch(searchTerm,gameName,acronym);
            card.style.display=matches?'block':'none'
        })
    }
    currentIndex=0;
    updateCoverflow()
}

const searchInput=document.getElementById('searchInput');
searchInput.addEventListener('input',(e)=>{
    const searchTerm=e.target.value;
    showSuggestions(searchTerm);
    filterCards(searchTerm)
});

searchInput.addEventListener('focus',()=>{
    if(searchInput.value){showSuggestions(searchInput.value)}
});

document.addEventListener('click',(e)=>{
    if(!e.target.closest('.search-container')){
        suggestionsContainer.style.display='none'
    }
    if(!e.target.closest('.chat-input-section')){
        const chatPopup=document.getElementById('suggestionsPopup');
        if(chatPopup){chatPopup.classList.remove('active')}
    }
});

searchInput.addEventListener('keydown',(e)=>{
    const suggestions=suggestionsContainer.querySelectorAll('.suggestion-item');
    if(suggestions.length===0)return;
    if(e.key==='ArrowDown'){
        e.preventDefault();
        suggestions[0].click()
    }else if(e.key==='Enter'){
        e.preventDefault();
        if(suggestions.length>0){suggestions[0].click()}
    }
});

track.addEventListener('mousedown',(e)=>{
    e.preventDefault();
    isDragging=true;
    startX=e.clientX;
    startTime=Date.now()
});

document.addEventListener('mousemove',(e)=>{
    if(!isDragging)return;
    e.preventDefault();
    const diff=e.clientX-startX;
    const timeDiff=Date.now()-startTime;
    if(Math.abs(diff)>50&&timeDiff>100){
        if(diff>0){previousCard()}else{nextCard()}
        isDragging=false
    }
});

document.addEventListener('mouseup',()=>{isDragging=false});

track.addEventListener('touchstart',(e)=>{
    isDragging=true;
    startX=e.touches[0].clientX;
    startTime=Date.now()
},{passive:true});

track.addEventListener('touchmove',(e)=>{
    if(!isDragging)return;
    const diff=e.touches[0].clientX-startX;
    const timeDiff=Date.now()-startTime;
    if(Math.abs(diff)>50&&timeDiff>100){
        if(diff>0){previousCard()}else{nextCard()}
        isDragging=false
    }
},{passive:true});

track.addEventListener('touchend',()=>{isDragging=false},{passive:true});

document.addEventListener('keydown',(e)=>{
    if(e.key==='ArrowRight'){
        e.preventDefault();
        nextCard()
    }else if(e.key==='ArrowLeft'){
        e.preventDefault();
        previousCard()
    }else if(e.key==='Escape'){
        if(typeof closeVideoModal==='function'){closeVideoModal()}
    }
});

const videoModal=document.getElementById('videoModal');
if(videoModal){
    videoModal.addEventListener('click',function(e){
        if(e.target===this&&typeof closeVideoModal==='function'){closeVideoModal()}
    })
}

function getGameFromURL(){
    const urlParams=new URLSearchParams(window.location.search);
    const gameParam=urlParams.get('game');
    if(gameParam){return decodeURIComponent(gameParam)}
    
    const hash=window.location.hash.slice(1);
    if(hash){return decodeURIComponent(hash)}
    
    const pathParts=window.location.pathname.split('/').filter(p=>p);
    const lastPart=pathParts[pathParts.length-1];
    if(lastPart&&lastPart!=='Web.biblioteca'&&!lastPart.includes('.html')){
        return decodeURIComponent(lastPart).replace(/-/g,' ')
    }
    return null
}

function findGameIndex(gameName){
    if(!gameName)return 0;
    const searchTerm=gameName.toLowerCase().trim();
    
    for(let i=0;i<cards.length;i++){
        const card=cards[i];
        const cardGameName=card.getAttribute('data-game')||card.querySelector('.card-title').textContent.trim();
        const acronym=generateAcronym(cardGameName);
        
        if(cardGameName.toLowerCase()===searchTerm||
           cardGameName.toLowerCase().includes(searchTerm)||
           searchTerm.includes(cardGameName.toLowerCase())||
           acronym.toLowerCase()===searchTerm||
           cardGameName.toLowerCase().replace(/\s+/g,'')===searchTerm.replace(/\s+/g,'')||
           cardGameName.toLowerCase().replace(/\s+/g,'-')===searchTerm.replace(/\s+/g,'-')){
            return i
        }
    }
    return 0
}

function copyScript(scriptUrl){
    const scriptContent=`loadstring(game:HttpGet('${scriptUrl}'))()`;
    if(navigator.clipboard&&window.isSecureContext){
        navigator.clipboard.writeText(scriptContent).then(()=>{
            showCopyNotification('✨ Script copiado al portapapeles!')
        }).catch(err=>{fallbackCopyTextToClipboard(scriptContent)})
    }else{
        fallbackCopyTextToClipboard(scriptContent)
    }
}

function fallbackCopyTextToClipboard(text){
    const textArea=document.createElement("textarea");
    textArea.value=text;
    textArea.style.top="0";
    textArea.style.left="0";
    textArea.style.position="fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try{
        document.execCommand('copy');
        showCopyNotification('✨ Script copiado al portapapeles!')
    }catch(err){
        showCopyNotification('❌ Error al copiar')
    }
    document.body.removeChild(textArea)
}

function showCopyNotification(message){
    const notification=document.createElement('div');
    notification.textContent=message;
    notification.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(45deg,#00ffcc,#ff00ff);color:#000;padding:15px 25px;border-radius:25px;font-weight:600;z-index:10000;box-shadow:0 5px 20px rgba(0,255,204,0.4);animation:fadeInOut 2s ease-in-out`;
    const style=document.createElement('style');
    style.textContent=`@keyframes fadeInOut{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}50%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    setTimeout(()=>{
        document.body.removeChild(notification);
        document.head.removeChild(style)
    },2000)
}

function downloadScript(fileName,fileContent){
    let cleanedContent=fileContent.replace(/--.*$/gm,'');
    cleanedContent=cleanedContent.replace(/\/\*[\s\S]*?\*\//g,'');
    cleanedContent=cleanedContent.trim();
    const finalFileName=fileName.endsWith('.txt')?fileName:`${fileName}.txt`;
    const blob=new Blob([cleanedContent],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=finalFileName;
    a.click();
    URL.revokeObjectURL(url)
}

async function updateVisitorCount(){
    const visitorCountSpan=document.getElementById('visitCount');
    let initialCount=parseInt(localStorage.getItem('VISITOR_COUNT'))||0;
    visitorCountSpan.textContent=initialCount;
    
    try{
        const hasVisited=localStorage.getItem('hasVisited');
        let fetchUrl=GOOGLE_APPS_SCRIPT_URL;
        if(!hasVisited){fetchUrl+='?action=increment'}
        
        const response=await fetch(fetchUrl);
        const apiCount=await response.text();
        
        if(!isNaN(parseInt(apiCount))){
            const finalCount=parseInt(apiCount);
            gsap.to({count:initialCount},{
                count:finalCount,
                duration:1.5,
                ease:"power2.out",
                onUpdate:function(){visitorCountSpan.textContent=Math.round(this.targets()[0].count)},
                onComplete:function(){
                    localStorage.setItem('VISITOR_COUNT',finalCount);
                    if(!hasVisited){localStorage.setItem('hasVisited','true')}
                }
            })
        }
    }catch(error){console.error('Error:',error)}
}

async function init(){
    injectImageStyles();
    await initDB();
    await renderGameCards();
    
    const gameFromURL=getGameFromURL();
    if(gameFromURL){
        const gameIndex=findGameIndex(gameFromURL);
        currentIndex=gameIndex;
        setTimeout(()=>{
            updateCoverflow();
            if(gameIndex>0){
                const gameName=cards[gameIndex].getAttribute('data-game');
                showCopyNotification(`¡Mostrando: ${gameName}!`)
            }
        },100)
    }else{
        updateCoverflow()
    }
    
    updateVisitorCount();
    setInterval(updateVisitorCount,30000)
}

window.addEventListener('load',init);
window.addEventListener('resize',updateCoverflow);