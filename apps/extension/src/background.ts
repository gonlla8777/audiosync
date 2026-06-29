/**
 * background.ts - El cerebro de la extensión
 * Gestiona el WebSocket (con reconexión automática), la memoria persistente y el motor de audio.
 */

let ws: WebSocket | null = null;
const SERVER_URL = 'wss://audiosync-3q4m.onrender.com';

function conectarWS() {
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

 chrome.runtime.onMessage.addListener((message) => {

    switch (message.type) {

        case 'START_CAPTURE':

            // Limpieza: si ya existía una captura, la detenemos

            if (localStream) {

                localStream.getTracks().forEach(track => track.stop());

                localStream = null;

            }

            captureAudio(message.streamId).catch(console.error);

            break;


        case 'START_WEBRTC_OFFER':

            // Inicia la oferta para conectar

            createAndSendOffer().catch(console.error);

            break;


        case 'FROM_WS_TO_OFFSCREEN':

            handleSignaling(message.payload).catch(console.error);

            break;

           

        // --- NUEVA RECOMENDACIÓN: Limpieza total ---

        case 'RESET_AUDIO':

            if (localStream) {

                localStream.getTracks().forEach(track => track.stop());

                localStream = null;

            }

            if (peerConnection) {

                peerConnection.close();

                peerConnection = null;

            }

            console.log('🧹 Motor de audio reseteado');

            break;

    }

    return false;

}); 

async function iniciarMotorAudio(tipoAccion: 'create_room' | 'join_room', roomId?: string) {
    await asegurarOffscreen();
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) return;
        
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

conectarWS();