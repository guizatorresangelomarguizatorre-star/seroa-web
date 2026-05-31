// seguridad_head.js
const paginaActual = window.location.pathname.split('/').pop() || 'index.html';
const tieneSesion = localStorage.getItem('userId') !== null;

// ¡LA SOLUCIÓN! Rescatar el código de invitación de la URL antes de la redirección
const params = new URLSearchParams(window.location.search);
if (params.has('acceso')) {
    localStorage.setItem('pendingAccessId', params.get('acceso'));
}

// Forzar comportamiento estilo app móvil: deshabilitar zoom en móviles
try {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no');
    } else {
        const m = document.createElement('meta');
        m.name = 'viewport';
        m.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no';
        document.head.appendChild(m);
    }
} catch (e) { console.warn('No fue posible forzar meta viewport:', e); }

if (!tieneSesion && !['login.html', 'guia.html', 'invitado.html'].includes(paginaActual)) {
    window.location.href = 'guia.html';
}
