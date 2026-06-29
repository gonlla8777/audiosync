/**
 * background.ts - El cerebro de la extensión
 * Gestiona el WebSocket (con reconexión automática), la memoria persistente y el motor de audio.
 */

let ws: WebSocket | null = null;
const SERVER_URL = 'wss://audiosync-3q4m.onrender.com';

function conectarWS() {
    // Si ya existe un socket intentando abrirse, no crees otro
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return; 
    }
    
    console.log('🔗 Intentando conectar al servidor...');
    ws = new WebSocket(SERVER_URL);
    ws.onopen = () => {
        console.log('✅ Extensión conectada al Signaling Server.');
        chrome.runtime.sendMessage({ type: 'WS_CONNECTED' }).catch(() => {});
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'room_created') {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
        case 'POPUP_START_HOST':
            iniciarMotorAudio('create_room');
            break;

        case 'POPUP_START_GUEST':
            chrome.storage.local.set({ appState: { mode: 'GUESTING', roomId: message.roomId } }); 
            iniciarMotorAudio('join_room', message.roomId);
            break;

        case 'POPUP_RESTART':
            console.log('🔄 Reiniciando conexión manual...');
            chrome.storage.local.set({ appState: { mode: 'IDLE', roomId: '' } }); 
            chrome.runtime.sendMessage({ type: 'RESET_AUDIO' }).catch(() => {}); 
            
            if (ws) {
                ws.onclose = null; 
                ws.close();
                ws = null; 
            }
            conectarWS(); 
            break;

            case 'POPUP_POWER_OFF':
            console.log('🛑 Apagando extensión por completo...');
            // CAMBIO: Guardamos el estado explícitamente como 'OFF'
            chrome.storage.local.set({ appState: { mode: 'OFF', roomId: '' } }); 
            chrome.runtime.sendMessage({ type: 'RESET_AUDIO' }).catch(() => {}); 
            
            if (ws) {
                ws.onclose = null; 
                ws.close();
                ws = null; 
            }
            break;

        // CORRECCIÓN 2: Le pegamos el RoomID a todos los paquetes WebRTC
        case 'FORWARD_TO_WS':
            if (ws && ws.readyState === WebSocket.OPEN) {
                chrome.storage.local.get(['appState'], (result) => {
                    const roomId = result.appState?.roomId;
                    const finalPayload = { ...message.payload, roomId: roomId };
                    ws!.send(JSON.stringify(finalPayload));
                });
            }
            break;
    }
    return false; 
});

// CORRECCIÓN 1: El Host graba, el Guest solo escucha.
// Ambos navegadores capturarán el audio de su pestaña antes de conectar
async function iniciarMotorAudio(tipoAccion: 'create_room' | 'join_room', roomId?: string) {
    await asegurarOffscreen();
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) return;
        
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
            if (streamId) {
                // Ordenamos capturar el audio sin importar si es Host o Guest
                chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId }).catch(() => {});
                
                // Esperamos 1 segundo y avisamos al servidor
                setTimeout(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: tipoAccion, roomId: roomId }));
                    }
                }, 1000);
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

conectarWS();