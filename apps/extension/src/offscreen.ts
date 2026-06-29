/**
 * offscreen.ts - Motor de audio y WebRTC (Definitivo)
 */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceQueue: RTCIceCandidateInit[] = [];

// Variables globales
let remoteAudioElement: HTMLAudioElement | null = null;
let localAudioContext: AudioContext | null = null;

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
                peerConnection.getSenders().forEach(sender => peerConnection!.removeTrack(sender));
                peerConnection.close();
                peerConnection = null;
            }
            if (remoteAudioElement) {
                remoteAudioElement.pause();
                remoteAudioElement.srcObject = null;
                remoteAudioElement.remove(); // Limpiamos el HTML para no dejar basura
            }
            iceQueue = [];
            console.log('🧹 Motor de audio reseteado limpiamente.');
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
        
        localStream.getTracks().forEach(track => {
            track.enabled = true; 
        });

        // Loopback para que el Host no pierda el sonido de su propio video
        localAudioContext = new AudioContext();
        const localSource = localAudioContext.createMediaStreamSource(localStream);
        localSource.connect(localAudioContext.destination);
        console.log('🎤 Audio capturado y devuelto a los altavoces locales.');
        
    } catch (error) {
        console.error('❌ Error capturando:', error);
    }
}

function setupPeerConnection() {
    if (peerConnection) {
        peerConnection.getSenders().forEach(s => peerConnection!.removeTrack(s));
        peerConnection.close();
    }
    iceQueue = []; 

    peerConnection = new RTCPeerConnection({ 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ] 
    });

    // TRUCO PRO: Forzar a WebRTC a abrir un canal bidireccional de audio sí o sí
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
        console.log('✅ Pistas de audio inyectadas en WebRTC.');
    }

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio remoto recibido! Reproduciendo...');
        
        // SOLUCIÓN: Crear el reproductor y ATORNILLARLO al HTML (DOM)
        remoteAudioElement = document.createElement('audio');
        remoteAudioElement.srcObject = event.streams[0];
        remoteAudioElement.autoplay = true;
        document.body.appendChild(remoteAudioElement); // <-- LA MAGIA OCURRE AQUÍ
        
        remoteAudioElement.play().then(() => {
            console.log('🔊 Reproducción remota iniciada con éxito.');
        }).catch(e => {
            console.error('⚠️ Bloqueo detectado, forzando con Web Audio API...', e);
            const audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const source = audioCtx.createMediaStreamSource(event.streams[0]);
            source.connect(audioCtx.destination);
        });
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
    
    const offer = await peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
    });
    
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
            if (peerConnection!.remoteDescription) {
                await peerConnection!.addIceCandidate(new RTCIceCandidate(data.payload)).catch(console.error);
            } else {
                iceQueue.push(data.payload);
            }
            break;
    }
}

function procesarColaIce() {
    while (iceQueue.length > 0) {
        const candidate = iceQueue.shift();
        if (candidate) {
            peerConnection!.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        }
    }
}