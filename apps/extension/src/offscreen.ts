/**
 * offscreen.ts - Motor de audio y WebRTC
 * Gestiona la captura de la pestaña y el túnel P2P.
 */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceQueue: RTCIceCandidateInit[] = []; // NUEVO: Sala de espera para coordenadas de red

chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
        case 'START_CAPTURE':
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            captureAudio(message.streamId).catch(console.error);
            break;

        case 'START_WEBRTC_OFFER':
            createAndSendOffer().catch(console.error);
            break;

        case 'FROM_WS_TO_OFFSCREEN':
            handleSignaling(message.payload).catch(console.error);
            break;
            
        case 'RESET_AUDIO':
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            iceQueue = []; // Limpiamos la sala de espera
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
        // Nota: Silenciamos el eco local. El Host no necesita escucharse a sí mismo doble.
    } catch (error) {
        console.error('❌ Error capturando:', error);
    }
}

function setupPeerConnection() {
    if (peerConnection) peerConnection.close();
    iceQueue = []; 

    peerConnection = new RTCPeerConnection({ 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ] 
    });

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
    }

peerConnection.ontrack = (event) => {
    console.log('🎵 ¡Audio remoto recibido!');
    const audioCtx = new AudioContext();
    
    // Si el navegador bloqueó el audio, esto lo obliga a arrancar
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const source = audioCtx.createMediaStreamSource(event.streams[0]);
    source.connect(audioCtx.destination);
};

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
            procesarColaIce();
            break;

        case 'webrtc_answer':
            await peerConnection!.setRemoteDescription(new RTCSessionDescription(data.payload));
            procesarColaIce();
            break;

        case 'webrtc_ice_candidate':
            // NUEVO: Control de tráfico de paquetes
            if (peerConnection!.remoteDescription) {
                await peerConnection!.addIceCandidate(new RTCIceCandidate(data.payload)).catch(console.error);
            } else {
                console.log('⏳ Guardando paquete de red en espera...');
                iceQueue.push(data.payload);
            }
            break;
    }
}

// NUEVO: Inyecta los paquetes de red guardados en el momento exacto
function procesarColaIce() {
    while (iceQueue.length > 0) {
        const candidate = iceQueue.shift();
        if (candidate) {
            peerConnection!.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        }
    }
}