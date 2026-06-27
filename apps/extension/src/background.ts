import { SignalingMessage } from 'shared-types';

console.log('AudioSync Background Worker iniciado');

const ws = new WebSocket('wss://audiosync-3q4m.onrender.com');
let isCapturing = false; // NUEVO: Candado de seguridad para evitar capturas dobles

ws.onopen = () => console.log('✅ Extensión conectada al Signaling Server.');

ws.onmessage = (event) => {
    const data: SignalingMessage = JSON.parse(event.data);
    
    if (data.type === 'room_created') {
        chrome.runtime.sendMessage({ type: 'ROOM_CREATED_UPDATE_UI', roomId: data.roomId });
    }

    // ARREGLO TYPESCRIPT: Forzamos la lectura como string para evitar el error TS2367
    if ((data.type as string) === 'guest_joined') {
        console.log('👋 Invitado detectado en la sala. Ordenando iniciar WebRTC...');
        chrome.runtime.sendMessage({ type: 'START_WEBRTC_OFFER' });
    }

    if (data.type === 'webrtc_answer' || data.type === 'webrtc_ice_candidate' || data.type === 'webrtc_offer') {
        chrome.runtime.sendMessage({ type: 'FROM_WS_TO_OFFSCREEN', payload: data });
    }
    if ((data.type as string) === 'joined') {
        chrome.runtime.sendMessage({ type: 'GUEST_JOINED_UPDATE_UI' });
    }
};

ws.onerror = (error) => console.error('❌ Error en WebSocket:', error);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'POPUP_START_HOST') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'create_room' }));
        iniciarMotorAudioHost();
    }

    if (message.type === 'POPUP_START_GUEST') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'join_room', roomId: message.roomId }));
        iniciarMotorAudioGuest();
    }

    if (message.type === 'FORWARD_TO_WS') {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message.payload));
    }
});

async function asegurarOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Motor principal de captura y reproducción de AudioSync'
        });
    }
}

async function iniciarMotorAudioHost() {
    if (isCapturing) {
        console.warn('⚠️ La pestaña ya está siendo capturada. Evitando error de Chrome.');
        return;
    }

    await asegurarOffscreen();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.id) return;
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
            if (streamId) {
                isCapturing = true; // Cerramos el candado
                chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId });
            }
        });
    });
}

async function iniciarMotorAudioGuest() {
    await asegurarOffscreen();
    chrome.runtime.sendMessage({ type: 'START_GUEST_MODE' });
}