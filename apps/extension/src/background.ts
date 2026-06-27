/**
 * background.ts - El cerebro de la extensión
 * Gestiona el WebSocket (con reconexión automática), la memoria de estado y el motor de audio.
 */

let appState: { mode: 'IDLE' | 'HOSTING' | 'GUESTING', roomId: string } = { mode: 'IDLE', roomId: '' };
let ws: WebSocket | null = null;
const SERVER_URL = 'wss://audiosync-3q4m.onrender.com';

// 1. Iniciar conexión con el servidor
function conectarWS() {
    console.log('🔗 Intentando conectar al servidor...');
    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
        console.log('✅ Extensión conectada al Signaling Server.');
        chrome.runtime.sendMessage({ type: 'WS_CONNECTED' });
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Manejo de eventos del servidor
        if (data.type === 'room_created') {
            appState = { mode: 'HOSTING', roomId: data.roomId }; // Guardamos el estado en memoria
            chrome.runtime.sendMessage({ type: 'ROOM_CREATED_UPDATE_UI', roomId: data.roomId });
        } else if (data.type === 'joined') {
            appState.mode = 'GUESTING'; // Guardamos el estado
            chrome.runtime.sendMessage({ type: 'GUEST_JOINED_UPDATE_UI' });
        } else if (data.type === 'guest_joined') {
            console.log('👋 Invitado unido. Iniciando WebRTC...');
            chrome.runtime.sendMessage({ type: 'START_WEBRTC_OFFER' });
        } else if (['webrtc_offer', 'webrtc_answer', 'webrtc_ice_candidate'].includes(data.type)) {
            chrome.runtime.sendMessage({ type: 'FROM_WS_TO_OFFSCREEN', payload: data });
        }
    };

    ws.onclose = () => {
        console.warn('❌ Conexión perdida. Intentando reconectar en 5s...');
        setTimeout(conectarWS, 5000);
    };

    ws.onerror = (err) => console.error('Error WebSocket:', err);
}

// 2. Gestionar eventos de comunicación
// Usamos _sender con guion bajo para indicar que es obligatorio por posición pero no lo usamos
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
        case 'GET_APP_STATE':
            // El popup pregunta por el estado al abrirse y se lo devolvemos
            sendResponse(appState);
            break;

        case 'POPUP_START_HOST':
            iniciarMotorAudio('create_room');
            break;

        case 'POPUP_START_GUEST':
            appState.roomId = message.roomId; // Guardamos el código de sala temporalmente
            iniciarMotorAudio('join_room', message.roomId);
            break;

        case 'POPUP_RESTART':
            console.log('🔄 Reiniciando conexión...');
            appState = { mode: 'IDLE', roomId: '' }; // Limpiamos la memoria
            chrome.runtime.sendMessage({ type: 'RESET_AUDIO' }); // Limpiamos el offscreen
            if (ws) ws.close(); // Cerramos el socket para forzar reconexión
            break;

        case 'FORWARD_TO_WS':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message.payload));
            }
            break;
    }
    
    // Devolvemos false porque nuestra respuesta (sendResponse) es síncrona
    return false; 
});

// 3. Orquestador de captura de audio
async function iniciarMotorAudio(tipoAccion: 'create_room' | 'join_room', roomId?: string) {
    await asegurarOffscreen();
    
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) return;
        
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId });
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: tipoAccion, roomId: roomId }));
        }
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