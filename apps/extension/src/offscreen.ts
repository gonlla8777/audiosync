/**
 * offscreen.ts - Motor de audio y WebRTC
 * Gestiona la captura de la pestaña y el túnel P2P.
 */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;

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

async function captureAudio(streamId: string) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            } as any,
            video: false
        });
        
        console.log('🎤 Audio capturado con éxito.');
        
        // Conexión local para monitoreo
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(audioContext.destination);
    } catch (error) {
        console.error('❌ Error capturando:', error);
    }
}

function setupPeerConnection() {
    if (peerConnection) peerConnection.close();

    peerConnection = new RTCPeerConnection({ 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ] 
    });

    // AÑADIR PISTAS: Fundamental para la bidireccionalidad
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
    }

    // ONTRACK: Recibir audio del otro lado
    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio remoto recibido!');
        const audioElement = new Audio();
        audioElement.srcObject = event.streams[0];
        audioElement.play().catch(e => console.error('Error al reproducir remoto:', e));
    };

    // ICE CANDIDATES: Crucial para atravesar firewalls
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            chrome.runtime.sendMessage({ 
                type: 'FORWARD_TO_WS', 
                payload: { type: 'webrtc_ice_candidate', payload: event.candidate } 
            });
        }
    };
}

async function createAndSendOffer() {
    setupPeerConnection();
    const offer = await peerConnection!.createOffer();
    await peerConnection!.setLocalDescription(offer);
    chrome.runtime.sendMessage({ 
        type: 'FORWARD_TO_WS', 
        payload: { type: 'webrtc_offer', payload: peerConnection!.localDescription } 
    });
}

async function handleSignaling(data: any) {
    if (!peerConnection) setupPeerConnection();

    switch (data.type) {
        case 'webrtc_offer':
            await peerConnection!.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await peerConnection!.createAnswer();
            await peerConnection!.setLocalDescription(answer);
            chrome.runtime.sendMessage({ 
                type: 'FORWARD_TO_WS', 
                payload: { type: 'webrtc_answer', payload: peerConnection!.localDescription } 
            });
            break;
        case 'webrtc_answer':
            await peerConnection!.setRemoteDescription(new RTCSessionDescription(data.payload));
            break;
        case 'webrtc_ice_candidate':
            await peerConnection!.addIceCandidate(new RTCIceCandidate(data.payload));
            break;
    }
}