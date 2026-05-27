const crypto = require('crypto');

// === CONFIGURACIÓN DE CRIPTOGRAFÍA ===
const ALGORITMO = 'aes-256-cbc';
const LLAVE_SECRETA = process.env.ENCRYPTION_KEY || 'SeroaSistemaSeguro2026Jalisco!!!'; 

// 1. Encriptación de Dos Vías (AES-CBC)
function encriptar(texto) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITMO, Buffer.from(LLAVE_SECRETA), iv);
    let encriptado = cipher.update(texto, 'utf8', 'hex');
    encriptado += cipher.final('hex');
    return iv.toString('hex') + ':' + encriptado;
}

// 2. Desencriptación (AES-CBC)
function desencriptar(textoCifrado) {
    // Validar que el texto tenga el formato de encriptación (IV:cifrado)
    if (!textoCifrado || typeof textoCifrado !== 'string' || !textoCifrado.includes(':')) {
        // Si no tiene el formato esperado, devolver como texto plano
        return textoCifrado;
    }
    
    try {
        const partes = textoCifrado.split(':');
        
        // Validar que hay exactamente 2 partes (IV y cifrado)
        if (partes.length !== 2 || !partes[0] || !partes[1]) {
            return textoCifrado; // No es formato válido, devolver como está
        }
        
        const iv = Buffer.from(partes[0], 'hex');
        
        // Validar que el IV tenga la longitud correcta (16 bytes)
        if (iv.length !== 16) {
            return textoCifrado; // IV inválido, devolver como está
        }
        
        const cifrado = partes[1];
        const decipher = crypto.createDecipheriv(ALGORITMO, Buffer.from(LLAVE_SECRETA), iv);
        let desencriptado = decipher.update(cifrado, 'hex', 'utf8');
        desencriptado += decipher.final('utf8');
        return desencriptado;
    } catch (error) {
        // Si hay cualquier error de crypto, devolver el texto original
        console.warn('Advertencia: No se pudo desencriptar, devolviendo texto plano:', error.message);
        return textoCifrado;
    }
}

// 3. Índice Ciego (HMAC de Una Vía rápida)
function generarHashBusqueda(texto) {
    return crypto.createHmac('sha256', LLAVE_SECRETA)
                 .update(texto.toLowerCase())
                 .digest('hex');
}

// Exportamos las funciones para que otros archivos las puedan usar
module.exports = {
    encriptar,
    desencriptar,
    generarHashBusqueda
};