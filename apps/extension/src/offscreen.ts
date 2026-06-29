/**
 * offscreen.ts - Motor de audio y WebRTC (Definitivo)
 * Soluciona: Auto-mute, Conexiones Zombi y Sincronización de Tracks.
 */

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let iceQueue: RTCIceCandidateInit[] = [];

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
                // SOLUCIÓN 3 (Zombies): Extirpamos las pistas antes de matar la conexión
                peerConnection.getSenders().forEach(sender => peerConnection!.removeTrack(sender));
                peerConnection.close();
                peerConnection = null;
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
        
        // SOLUCIÓN 2 (Track State): Asegurarnos de que no nazca silenciado
        localStream.getTracks().forEach(track => {
            track.enabled = true; 
            console.log(`🎤 Track capturado: ${track.kind} | Habilitado: ${track.enabled} | Muteado: ${track.muted}`);
        });
        
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

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
        console.log('✅ Pistas de audio inyectadas en WebRTC.');
    }

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio remoto recibido! Intentando reproducir...');
        
        // SOLUCIÓN 1 (Auto-Mute): Ataque a dos frentes para saltar el bloqueo de Chrome
        
        // Frente A: HTML5 Audio tradicional
        try {
            const audioElement = new Audio();
            audioElement.srcObject = event.streams[0];
            audioElement.autoplay = true;
            audioElement.play().then(() => {
                console.log('🔊 Reproducción HTML5 exitosa.');
            }).catch(e => console.error('Bloqueo HTML5:', e));
        } catch (e) {
            console.error('Fallo en Frente A:', e);
        }

        // Frente B: Web Audio API (Más potente en extensiones)
        try {
            const audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => console.log('⚡ AudioContext reanudado forzosamente.'));
            }
            const source = audioCtx.createMediaStreamSource(event.streams[0]);
            source.connect(audioCtx.destination);
            console.log('🔊 Enrutamiento Web Audio API conectado.');
        } catch (err) {
            console.error('Bloqueo Web Audio API:', err);
        }
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
    
    // Forzamos explícitamente la apertura del canal de audio
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