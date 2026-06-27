let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;

// ARREGLO MANIFEST V3: El listener principal ya no es "async"
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_CAPTURE') {
        startHostCapture(message.streamId).catch(console.error);
    } else if (message.type === 'START_GUEST_MODE') {
        startGuestMode();
    } else if (message.type === 'START_WEBRTC_OFFER') {
        createAndSendOffer().catch(console.error);
    } else if (message.type === 'FROM_WS_TO_OFFSCREEN') {
        const data = message.payload;
        if (data.type === 'webrtc_offer') {
            handleOffer(data.payload).catch(console.error);
        } else if (data.type === 'webrtc_answer' && peerConnection) {
            console.log('✅ ¡Respuesta WebRTC recibida del Invitado!');
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload)).catch(console.error);
        } else if (data.type === 'webrtc_ice_candidate' && peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.payload)).catch(console.error);
        }
    }
    return false; // Buena práctica en MV3 para listeners síncronos
});

async function startHostCapture(streamId: string) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as any,
            video: false
        });
        console.log('🎤 ¡ÉXITO! Audio capturado. Esperando al Invitado...');
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(audioContext.destination);
    } catch (error) {
        console.error('❌ Error al capturar audio:', error);
    }
}

async function createAndSendOffer() {
    if (!localStream) {
        console.error('⚠️ No hay audio capturado.');
        return;
    }
    console.log('🚀 Invitado listo. Construyendo conexión WebRTC...');
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(track => peerConnection!.addTrack(track, localStream!));
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_ice_candidate', payload: event.candidate } });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_offer', payload: peerConnection.localDescription } });
}

function startGuestMode() {
    console.log('🎧 Modo Invitado preparado. Esperando oferta WebRTC...');
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio recibido del Host! Reproduciendo en la extensión...');
        const audioElement = new Audio();
        audioElement.srcObject = event.streams[0];
        audioElement.play().catch(e => console.error('Error reproduciendo audio:', e));
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_ice_candidate', payload: event.candidate } });
    };
}

async function handleOffer(offer: RTCSessionDescriptionInit) {
    if (!peerConnection) return;
    console.log('Procesando Oferta del Host...');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log('Enviando Respuesta al Host...');
    chrome.runtime.sendMessage({ type: 'FORWARD_TO_WS', payload: { type: 'webrtc_answer', payload: peerConnection.localDescription } });
}