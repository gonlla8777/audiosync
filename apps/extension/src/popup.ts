// Envolvemos todo para asegurar que el HTML cargó primero
document.addEventListener('DOMContentLoaded', () => {
    console.log('💻 Interfaz Retro cargada. Consultando memoria...');

console.log('💻 Interfaz Retro cargada. Consultando memoria...');

    const btnHost = document.getElementById('btnHost') as HTMLButtonElement;
    const btnGuest = document.getElementById('btnGuest') as HTMLButtonElement;
    const statusDiv = document.getElementById('status');
    const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
    
    // CORRECCIÓN: Le aclaramos a TypeScript que estos dos son botones
    const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
    const btnPowerOff = document.getElementById('btnPowerOff') as HTMLButtonElement;
    const volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
    const volumeValue = document.getElementById('volumeValue') as HTMLSpanElement;

    chrome.storage.local.get(['appState'], (result) => {
        console.log('🧠 Estado en disco duro:', result.appState); // Diagnóstico vital
        
        const state = result.appState;
        if (state && state.mode !== 'IDLE') {
            if (state.mode === 'HOSTING') {
                if (statusDiv) statusDiv.innerText = 'COMPARTIENDO';
            } else if (state.mode === 'GUESTING') {
                if (statusDiv) statusDiv.innerText = 'ESCUCHANDO 🎵';
            }
            
            // Restauramos el código y bloqueamos botones
            if (roomCodeInput) roomCodeInput.value = state.roomId;
            if (btnHost) btnHost.disabled = true;
            if (btnGuest) btnGuest.disabled = true;
        }
    });
    // --------------------------------------------

    btnHost?.addEventListener('click', () => {
        btnHost.disabled = true;
        if (btnGuest) btnGuest.disabled = true;
        if (statusDiv) statusDiv.innerText = 'INICIANDO HOST...';
        chrome.runtime.sendMessage({ type: 'POPUP_START_HOST' });
    });

    btnGuest?.addEventListener('click', () => {
        const code = roomCodeInput?.value.trim().toUpperCase();
        if (!code) {
            if (statusDiv) statusDiv.innerText = 'FALTA CÓDIGO';
            return;
        }
        btnGuest.disabled = true;
        if (btnHost) btnHost.disabled = true;
        if (statusDiv) statusDiv.innerText = `CONECTANDO A: ${code}`;
        chrome.runtime.sendMessage({ type: 'POPUP_START_GUEST', roomId: code });
    });

   btnRestart?.addEventListener('click', () => {
        if (statusDiv) statusDiv.innerText = 'REINICIANDO... ESPERE 5s';
        
        // Bloqueamos TODO inmediatamente al tocar el reset
        if (btnHost) btnHost.disabled = true;
        if (btnGuest) btnGuest.disabled = true;
        if (btnRestart) btnRestart.disabled = true; // Evita que hagan spam del botón
        if (roomCodeInput) roomCodeInput.disabled = true;

        chrome.runtime.sendMessage({ type: 'POPUP_RESTART' });
        
        // Liberamos los botones después de 5 segundos exactos
        setTimeout(() => {
            if (statusDiv) statusDiv.innerText = 'LISTO PARA CONECTAR';
            if (btnHost) btnHost.disabled = false;
            if (btnGuest) btnGuest.disabled = false;
            if (btnRestart) btnRestart.disabled = false;
            if (roomCodeInput) {
                roomCodeInput.value = '';
                roomCodeInput.disabled = false;
            }
        }, 5000);
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'ROOM_CREATED_UPDATE_UI' && statusDiv && roomCodeInput) {
            statusDiv.innerText = 'COMPARTIENDO';
            roomCodeInput.value = message.roomId;
        }
        
        if (message.type === 'GUEST_JOINED_UPDATE_UI' && statusDiv) {
            statusDiv.innerText = 'ESCUCHANDO 🎵';
        }
    });

    btnPowerOff?.addEventListener('click', () => {
     // Bloqueamos la interfaz en modo "Muerto"
     if (statusDiv) statusDiv.innerText = 'APAGADO 🛑';
     if (btnHost) btnHost.disabled = true;
     if (btnGuest) btnGuest.disabled = true;
     if (roomCodeInput) {
         roomCodeInput.value = '';
         roomCodeInput.disabled = true;
     }

     // Le avisamos al cerebro que mate todo
     chrome.runtime.sendMessage({ type: 'POPUP_POWER_OFF' });
 });

 // NUEVO: Control de volumen en tiempo real
    volumeSlider?.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (volumeValue) volumeValue.innerText = val;
        
        // Convertimos el valor de 0-100 a un decimal de 0.0 a 1.0
        const volumenDecimal = parseInt(val) / 100;
        chrome.runtime.sendMessage({ type: 'SET_VOLUME', value: volumenDecimal });
    });
});

