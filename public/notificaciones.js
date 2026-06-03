// ============================================================
// notificaciones.js — Motor de Alertas Sonoras Seroa
// Web Audio API · 3 niveles · Throttle · Toast visual
// ============================================================

const SeroaNotif = (() => {

    // ─── AudioContext lazy (requiere gesto del usuario) ──────
    let _ctx = null;
    function _audio() {
        if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    // ─── Cooldown: evita spam de la misma alerta ─────────────
    const _log = {};
    function _puede(key, ms) {
        const now = Date.now();
        if (!_log[key] || now - _log[key] >= ms) { _log[key] = now; return true; }
        return false;
    }

    // ─── Lee preferencia del localStorage (default: ON) ──────
    function _on(key) {
        const master = localStorage.getItem('seroaNotif_master');
        if (master === 'false') return false;
        const v = localStorage.getItem('seroaNotif_' + key);
        return v === null ? true : v === 'true';
    }

    // ─── SONIDOS ──────────────────────────────────────────────

    // Elegante: 2 tonos suaves tipo chime (info / tanque mitad)
    function _chime() {
        try {
            const ac = _audio();
            [[880, 0], [1100, 0.22]].forEach(([f, d]) => {
                const osc = ac.createOscillator(), g = ac.createGain();
                const t = ac.currentTime + d;
                osc.connect(g); g.connect(ac.destination);
                osc.type = 'sine'; osc.frequency.value = f;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.25, t + 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                osc.start(t); osc.stop(t + 0.6);
            });
        } catch (e) {}
    }

    // Precaución: 3 pitidos triangle medios
    function _warn() {
        try {
            const ac = _audio();
            [0, 0.38, 0.76].forEach(d => {
                const osc = ac.createOscillator(), g = ac.createGain();
                const t = ac.currentTime + d;
                osc.connect(g); g.connect(ac.destination);
                osc.type = 'triangle'; osc.frequency.value = 660;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.2, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.start(t); osc.stop(t + 0.3);
            });
        } catch (e) {}
    }

    // Peligro: 4 ráfagas sawtooth urgentes con dos frecuencias
    function _danger() {
        try {
            const ac = _audio();
            [0, 0.22, 0.44, 0.66].forEach((d, i) => {
                const osc = ac.createOscillator(), g = ac.createGain();
                const t = ac.currentTime + d;
                osc.connect(g); g.connect(ac.destination);
                osc.type = 'sawtooth';
                osc.frequency.value = i % 2 === 0 ? 440 : 880;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.32, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                osc.start(t); osc.stop(t + 0.18);
            });
        } catch (e) {}
    }

    // ─── TOAST VISUAL ─────────────────────────────────────────

    function _container() {
        let c = document.getElementById('seroaAlertContainer');
        if (!c) {
            c = document.createElement('div');
            c.id = 'seroaAlertContainer';
            c.className = 'seroa-alert-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function _toast(nivel, icono, titulo, msg) {
        const c = _container();
        const id = 'sa_' + Date.now();
        const dur = { peligro: 9000, precaucion: 7000, elegante: 5000 }[nivel] || 6000;

        c.insertAdjacentHTML('beforeend', `
            <div id="${id}" class="seroa-alert seroa-alert-${nivel}" role="alert" aria-live="assertive">
                <div class="seroa-alert-icon"><i class="bi ${icono}"></i></div>
                <div class="seroa-alert-body">
                    <div class="seroa-alert-titulo">${titulo}</div>
                    <div class="seroa-alert-msg">${msg}</div>
                </div>
                <button class="seroa-alert-close" onclick="this.closest('.seroa-alert').remove()" aria-label="Cerrar">&times;</button>
            </div>`);

        requestAnimationFrame(() => {
            const el = document.getElementById(id);
            if (el) requestAnimationFrame(() => el.classList.add('seroa-alert-in'));
        });

        setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.replace('seroa-alert-in', 'seroa-alert-out');
            setTimeout(() => el.remove(), 380);
        }, dur);
    }

    // ─── API PÚBLICA ──────────────────────────────────────────

    return {

        alertarSpo2(spo2, spo2min) {
            if (!spo2min || spo2 <= 0) return;
            const peligro    = spo2 < spo2min;
            const precaucion = !peligro && spo2 <= spo2min + 4;

            if (peligro && _on('spo2_peligro') && _puede('spo2_peligro', 60_000)) {
                _danger();
                _toast('peligro', 'bi-lungs-fill',
                    '¡SpO₂ en Nivel de PELIGRO!',
                    `Saturación: ${spo2}% — mínimo seguro del paciente: ${spo2min}%. Active la válvula de oxígeno de inmediato.`);
            } else if (precaucion && _on('spo2_precaucion') && _puede('spo2_precaucion', 90_000)) {
                _warn();
                _toast('precaucion', 'bi-lungs',
                    'SpO₂ en Precaución',
                    `Saturación: ${spo2}% — zona de alerta (${spo2min}–${spo2min + 4}%). Monitoree al paciente de cerca.`);
            }
        },

        alertarBpm(bpm) {
            if (!bpm || bpm <= 0) return;
            const peligro    = bpm < 50 || bpm > 140;
            const precaucion = !peligro && ((bpm >= 50 && bpm <= 59) || (bpm >= 101 && bpm <= 140));

            if (peligro && _on('bpm_peligro') && _puede('bpm_peligro', 60_000)) {
                _danger();
                _toast('peligro', 'bi-heart-pulse-fill',
                    '¡BPM en Nivel de PELIGRO!',
                    `Frecuencia cardíaca: ${bpm} bpm — fuera del rango seguro. Se requiere atención inmediata.`);
            } else if (precaucion && _on('bpm_precaucion') && _puede('bpm_precaucion', 90_000)) {
                _warn();
                _toast('precaucion', 'bi-heart-pulse',
                    'BPM en Precaución',
                    `Frecuencia cardíaca: ${bpm} bpm — zona límite. Monitoree al paciente continuamente.`);
            }
        },

        alertarTanque(porcentaje) {
            if (porcentaje == null || porcentaje < 0) return;

            if (porcentaje < 25 && _on('tanque_critico') && _puede('tanque_critico', 300_000)) {
                _danger();
                _toast('peligro', 'bi-battery-fill',
                    '¡Poco Oxígeno Restante!',
                    `El tanque está al ${Math.round(porcentaje)}%. Por favor, reemplaza el tanque de oxígeno pronto.`);
            } else if (porcentaje >= 25 && porcentaje <= 50 && _on('tanque_mitad') && _puede('tanque_mitad', 600_000)) {
                _chime();
                _toast('elegante', 'bi-battery-half',
                    'Tanque a la Mitad',
                    `El cilindro de oxígeno está al ${Math.round(porcentaje)}%. Considera preparar un tanque de repuesto.`);
            }
        },

        // Prueba de sonido desde el panel de configuración
        probar(nivel) {
            if (nivel === 'peligro') { _danger(); _toast('peligro', 'bi-bell-fill', 'Prueba — Peligro', 'Así suena una alerta de peligro urgente.'); }
            else if (nivel === 'precaucion') { _warn(); _toast('precaucion', 'bi-bell', 'Prueba — Precaución', 'Así suena una alerta de precaución.'); }
            else { _chime(); _toast('elegante', 'bi-bell', 'Prueba — Informativa', 'Así suena un aviso elegante informativo.'); }
        },

        setPreferencia(key, val) {
            localStorage.setItem('seroaNotif_' + key, val ? 'true' : 'false');
        },

        getPreferencia(key) { return _on(key); }
    };
})();

window.SeroaNotif = SeroaNotif;
