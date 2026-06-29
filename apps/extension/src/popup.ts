// Envolvemos todo para asegurar que el HTML cargó primero
document.addEventListener('DOMContentLoaded', () => {
    console.log('💻 Interfaz Retro cargada. Consultando memoria...');

    const btnHost = document.getElementById('btnHost') as HTMLButtonElement;
    const btnGuest = document.getElementById('btnGuest') as HTMLButtonElement;
    const statusDiv = document.getElementById('status');
    const roomCodeInput = document.getElementById('roomCode') as HTMLInputElement;
    const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
    const btnPowerOff = document.getElementById('btnPowerOff') as HTMLButtonElement;
    
    const volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
    const volumeValue = document.getElementById('volumeValue') as HTMLSpanElement;

    // --- 1. LECTURA DE MEMORIA AL ABRIR EL POPUP ---
    // Ahora leemos 'appState' y también 'savedVolume'
    chrome.storage.local.get(['appState', 'savedVolume'], (result) => {
        console.log('🧠 Estado en disco duro:', result);
        
        // A. Restaurar el Volumen
        if (result.savedVolume !== undefined) {
            if (volumeSlider) volumeSlider.value = result.savedVolume;
            if (volumeValue) volumeValue.innerText = result.savedVolume;
        }

        // B. Restaurar el Estado Visual
        const state = result.appState;
        if (state) {
            if (state.mode === 'HOSTING') {
                if (statusDiv) statusDiv.innerText = 'COMPARTIENDO';
                if (roomCodeInput) roomCodeInput.value = state.roomId;
                if (btnHost) btnHost.disabled = true;
                if (btnGuest) btnGuest.disabled = true;
                
            } else if (state.mode === 'GUESTING') {
                if (statusDiv) statusDiv.innerText = 'ESCUCHANDO 🎵';
                if (roomCodeInput) roomCodeInput.value = state.roomId;
                if (btnHost) btnHost.disabled = true;
                if (btnGuest) btnGuest.disabled = true;
                
            } else if (state.mode === 'OFF') {
                // NUEVO: Recordar que estaba apagado
                if (statusDiv) statusDiv.innerText = 'APAGADO 🛑';
                if (btnHost) btnHost.disabled = true;
                if (btnGuest) btnGuest.disabled = true;
                if (roomCodeInput) roomCodeInput.disabled = true;
            }
        }
    });
    // -----------------------------------------------

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
        
        if (btnHost) btnHost.disabled = true;
        if (btnGuest) btnGuest.disabled = true;
        if (btnRestart) btnRestart.disabled = true; 
        if (roomCodeInput) roomCodeInput.disabled = true;

        chrome.runtime.sendMessage({ type: 'POPUP_RESTART' });
        
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

    btnPowerOff?.addEventListener('click', () => {
        if (statusDiv) statusDiv.innerText = 'APAGADO 🛑';
        if (btnHost) btnHost.disabled = true;
        if (btnGuest) btnGuest.disabled = true;
        if (roomCodeInput) {
            roomCodeInput.value = '';
            roomCodeInput.disabled = true;
        }
        chrome.runtime.sendMessage({ type: 'POPUP_POWER_OFF' });
    });

    volumeSlider?.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (volumeValue) volumeValue.innerText = val;
        
        // NUEVO: Guardar el volumen en el disco duro cada vez que se mueve
        chrome.storage.local.set({ savedVolume: val });
        
        const volumenDecimal = parseInt(val) / 100;
        chrome.runtime.sendMessage({ type: 'SET_VOLUME', value: volumenDecimal });
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
});