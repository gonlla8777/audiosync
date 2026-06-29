/**
 * background.ts - El cerebro de la extensión
 * Gestiona el WebSocket (con reconexión automática), la memoria persistente y el motor de audio.
 */

let ws: WebSocket | null = null;
const SERVER_URL = 'wss://audiosync-3q4m.onrender.com';

// 1. Iniciar conexión con el servidor
function conectarWS() {
    console.log('🔗 Intentando conectar al servidor...');
    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
        console.log('✅ Extensión conectada al Signaling Server.');
        chrome.runtime.sendMessage({ type: 'WS_CONNECTED' }).catch(() => {});
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Manejo de eventos del servidor
        if (data.type === 'room_created') {
            // Guardamos en el disco duro de Chrome
            chrome.storage.local.set({ appState: { mode: 'HOSTING', roomId: data.roomId } }); 
            chrome.runtime.sendMessage({ type: 'ROOM_CREATED_UPDATE_UI', roomId: data.roomId }).catch(() => {});
        } else if (data.type === 'joined') {
            chrome.runtime.sendMessage({ type: 'GUEST_JOINED_UPDATE_UI' }).catch(() => {});
        } else if (data.type === 'guest_joined') {
            console.log('👋 Invitado unido. Iniciando WebRTC...');
            chrome.runtime.sendMessage({ type: 'START_WEBRTC_OFFER' }).catch(() => {});
        } else if (['webrtc_offer', 'webrtc_answer', 'webrtc_ice_candidate'].includes(data.type)) {
            chrome.runtime.sendMessage({ type: 'FROM_WS_TO_OFFSCREEN', payload: data }).catch(() => {});
        }
    };

    ws.onclose = () => {
        console.warn('❌ Conexión perdida. Intentando reconectar en 5s...');
        setTimeout(conectarWS, 5000);
    };

    ws.onerror = (err) => console.error('Error WebSocket:', err);
}

// 2. Gestionar eventos de comunicación
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
        case 'POPUP_START_HOST':
            iniciarMotorAudio('create_room');
            break;

        case 'POPUP_START_GUEST':
            // Guardamos el estado al instante en el disco
            chrome.storage.local.set({ appState: { mode: 'GUESTING', roomId: message.roomId } }); 
            iniciarMotorAudio('join_room', message.roomId);
            break;

        case 'POPUP_RESTART':
            console.log('🔄 Reiniciando conexión...');
            // Limpiamos el disco duro de Chrome
            chrome.storage.local.set({ appState: { mode: 'IDLE', roomId: '' } }); 
            
            // Atrapamos el error silenciosamente por si el offscreen no existe
            chrome.runtime.sendMessage({ type: 'RESET_AUDIO' }).catch(() => {}); 
            
            if (ws) {
                // ANULAMOS el evento onclose temporalmente para saltarnos los 5 segundos de espera
                ws.onclose = null; 
                ws.close(); 
            }
            // Reconectamos INMEDIATAMENTE
            conectarWS(); 
            break;

        case 'FORWARD_TO_WS':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message.payload));
            }
            break;
    }
    return false; 
});

// 3. Orquestador de captura de audio
async function iniciarMotorAudio(tipoAccion: 'create_room' | 'join_room', roomId?: string) {
    await asegurarOffscreen();
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) return;
        
        // CORRECCIÓN: Usamos el callback que exige TypeScript en lugar de await
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
            if (streamId) {
                chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId }).catch(() => {});
                
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: tipoAccion, roomId: roomId }));
                }
            } else {
                console.error('No se pudo obtener el streamId de la pestaña.');
            }
        });
    });
}

async function asegurarOffscreen() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (contexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Motor de audio bidireccional'
        });
    }
}

// Iniciar al cargar la extensión
conectarWS();