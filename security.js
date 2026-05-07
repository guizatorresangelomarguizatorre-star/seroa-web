const crypto = require('crypto');

// === CONFIGURACIÓN DE CRIPTOGRAFÍA ===
const ALGORITMO = 'aes-256-cbc';
const LLAVE_SECRETA = process.env.ENCRYPTION_KEY || 'LlaveSecretaSeroaDe32Caracteres!'; 

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
    const partes = textoCifrado.split(':');
    const iv = Buffer.from(partes[0], 'hex');
    const cifrado = partes[1];
    const decipher = crypto.createDecipheriv(ALGORITMO, Buffer.from(LLAVE_SECRETA), iv);
    let desencriptado = decipher.update(cifrado, 'hex', 'utf8');
    desencriptado += decipher.final('utf8');
    return desencriptado;
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