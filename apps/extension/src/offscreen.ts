/**
 * offscreen.ts - Motor de audio y WebRTC (Optimizado)
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
                peerConnection.close();
                peerConnection = null;
            }
            iceQueue = [];
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

    // Añadimos las pistas ANTES de crear la oferta/respuesta
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection!.addTrack(track, localStream!);
        });
        console.log('✅ Pistas de audio añadidas a la conexión WebRTC');
    }

    peerConnection.ontrack = (event) => {
        console.log('🎵 ¡Audio remoto recibido!');
        const audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
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
    
    // Fuerza la negociación de audio
    const offer = await peerConnection!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
    });
    
    await peerConnection!.setLocalDescription(offer);
    
    chrome.runtime.sendMessage({ 
        type: 'FORWARD_TO_WS', 
        payload: { type: 'webrtc_offer', payload: peerConnection!.localDescription } 
    });
    console.log('🚀 Oferta WebRTC enviada con pistas de audio.');
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