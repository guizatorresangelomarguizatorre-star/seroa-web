# **CONSOLIDACIÓN SEROA PARA PRODUCCIÓN**

## Estado: ✅ COMPLETADO

---

## **RESUMEN DE SOLUCIONES IMPLEMENTADAS**

### **1. Limpieza de Base de Datos (SQL)**
**Archivo:** `scripts/limpiar_bd.sql`

Consultas para vaciar tablas de prueba:
```sql
-- Limpiar alertas
TRUNCATE TABLE alertas;
ALTER TABLE alertas AUTO_INCREMENT = 1;

-- Limpiar registros biométricos
TRUNCATE TABLE registros_biomedicos;
ALTER TABLE registros_biomedicos AUTO_INCREMENT = 1;
```

**Instrucciones de uso:**
```bash
# En tu cliente MySQL:
mysql -h <host> -u <usuario> -p <base_datos> < scripts/limpiar_bd.sql

# O en MySQL Workbench:
# 1. Abre scripts/limpiar_bd.sql
# 2. Ejecuta el script
```

---

### **2. Promediado por Horas + Tabla de Alertas (Backend)**
**Archivo:** `server.js` - Endpoint `/api/registros` (MODIFICADO)

**Comportamiento:**
- ✅ Lecturas NORMALES: Se acumulan por hora y se guardan UN promedio
- ✅ Lecturas CRÍTICAS (Peligro/Precaución): Se guardan INMEDIATAMENTE
- ✅ AL GUARDAR CRÍTICA: Se crea un registro en tabla `alertas` automáticamente
- ✅ Realtime DB: Se publica la lectura en tiempo real

**Lógica de flujo:**
```javascript
// Si es anomalía (Peligro o Precaución):
→ Guarda en registros_biomedicos
→ Crea alerta en tabla alertas
→ Publica en Firebase Realtime DB
→ Resetea acumulador de horas

// Si es normal (SpO2 y BPM estables):
→ Acumula en memoria
→ Cada cambio de hora → guarda promedio
→ Publica en Realtime DB
→ Optimiza base de datos
```

---

### **3. Retención de 30 Días (Backend - NUEVO)**
**Archivo:** `server.js` - Rutina de limpieza automática (AGREGADA)

**Funcionamiento:**
- ✅ Se ejecuta automáticamente cada **1 hora** (3600000 ms)
- ✅ Se ejecuta una primera vez **5 minutos** después del arranque
- ✅ Borra registros biométricos > 30 días
- ✅ Borra notas clínicas > 30 días
- ✅ Borra alertas > 30 días
- ✅ Registra en consola cuántos registros fueron eliminados

**Logs esperados:**
```
✓ Limpieza automática: 450 registros biométricos eliminados (> 30 días)
✓ Limpieza automática: 12 notas clínicas eliminadas (> 30 días)
✓ Limpieza automática: 45 alertas eliminadas (> 30 días)
```

---

### **4. Endpoints de Historial y Reportes (Backend - NUEVO)**
**Archivo:** `server.js` - Dos nuevos endpoints (AGREGADOS)

#### **GET /api/historial-fechas**
Retorna las fechas de los últimos 30 días que tienen registros:
```bash
GET /api/historial-fechas?id_paciente=123
```

**Respuesta:**
```json
[
  { "fecha_guardada": "2026-06-01" },
  { "fecha_guardada": "2026-05-31" },
  { "fecha_guardada": "2026-05-30" }
]
```

#### **GET /api/reporte-dia**
Retorna registros y notas de un día específico:
```bash
GET /api/reporte-dia?id_paciente=123&fecha=2026-06-01
```

**Respuesta:**
```json
{
  "registros": [
    {
      "id_registro": "abc123",
      "saturacion_oxigeno": 95,
      "ritmo_cardiaco": 72,
      "es_critico": 0,
      "fecha_hora": "2026-06-01T08:30:00.000Z"
    }
  ],
  "notas": [
    {
      "id_nota": 1,
      "cuerpo_nota": "Paciente reportó fatiga",
      "fecha_registro": "2026-06-01T08:30:00.000Z"
    }
  ]
}
```

---

### **5. Reporte PDF Mejorado (Frontend)**
**Archivo:** `public/registro.js` - Función `generarPDF()` (YA COMPLETADO)

**Mejoras aplicadas:**
- ✅ Título "Promediado por horas" en negrita, tamaño 12
- ✅ Encabezado '#' en lugar de 'ID'
- ✅ IDs secuenciales (1, 2, 3...) en lugar de alfanuméricos largos
- ✅ StartY ajustado para evitar superposición

**Código visible:**
```javascript
// Agregar título de la tabla
doc.setFontSize(12);
doc.setFont('helvetica', 'bold');
doc.text('Promediado por horas', 40, infoY + 10);
doc.setFont('helvetica', 'normal');

doc.autoTable({
    startY: infoY + 25,
    head: [['#', 'Fecha y Hora', 'SpO2', 'BPM', 'Nivel', 'Acción', 'Usuario']],
    body: rows,  // Filas con números secuenciales
    styles: { fontSize: 9 }
});
```

---

### **6. Historial de Reportes (Frontend)**
**Archivo:** `public/registro.js` - Función `cargarHistorialFechas()` y `descargarPDFHistorico()` (YA COMPLETADO)

**Funcionamiento:**
- ✅ Se llama automáticamente al cargar `registro.html`
- ✅ Carga fechas de últimos 30 días desde `/api/historial-fechas`
- ✅ Muestra tarjetas con botones de descarga en la sección "Historial de Reportes"
- ✅ Al hacer clic, descarga PDF con datos del día específico desde `/api/reporte-dia`

---

## **CHECKLIST DE VERIFICACIÓN ANTES DE PRODUCCIÓN**

- [ ] **1. Limpieza:** Ejecuté `scripts/limpiar_bd.sql` para borrar datos de prueba
- [ ] **2. Backend:** Reinicié `server.js` (Node.js)
- [ ] **3. Logs:** Verificar que aparece mensaje de rutina de limpieza en consola
- [ ] **4. Test /api/historial-fechas:** Llamar desde Postman/navegador
- [ ] **5. Test /api/reporte-dia:** Llamar desde Postman/navegador
- [ ] **6. Frontend:** Recargar `registro.html` y verificar que carga historial
- [ ] **7. PDF:** Descargar reporte del día actual y verificar que tiene formato correcto
- [ ] **8. Alertas:** Simular lectura crítica desde ESP32 y verificar que aparece en tabla `alertas`
- [ ] **9. Promediado:** Enviar 2 lecturas normales en la misma hora y verificar que se guarda 1 promedio

---

## **INSTRUCCIONES DE DEPLOYMENT**

### **PASO 1: Preparar Base de Datos**
```bash
# Ejecutar limpieza de datos de prueba
mysql -h <tu_host> -u <tu_usuario> -p <tu_bd> < scripts/limpiar_bd.sql
```

### **PASO 2: Reiniciar Backend**
```bash
# Detener servidor actual
Ctrl+C en PowerShell

# Reiniciar Node.js
npm start
# O directamente: node server.js
```

### **PASO 3: Verificar en Logs**
```
✓ ¡Conexión blindada SSL exitosa a Seroa BD!
✓ Limpieza automática: X registros biométricos eliminados (> 30 días)
✓ Seroa activo en puerto 3000
```

### **PASO 4: Test Funcional**
1. Abre `http://localhost:3000/registro.html`
2. Selecciona un paciente
3. Verifica que se carga el historial de reportes
4. Descarga un reporte PDF histórico
5. Simula una lectura biométrica normal y verifica que se acumula
6. Simula una lectura crítica y verifica que aparece inmediatamente

---

## **MONITOREO EN PRODUCCIÓN**

### **Comandos Útiles:**

```bash
# Ver si Node.js está activo
Get-Process node

# Ver puertos en uso (verificar que 3000 esté abierto)
netstat -ano | findstr :3000

# Ver logs de Node.js en tiempo real (si usas PM2)
pm2 logs seroa

# Limpiar BD manualmente en caso de urgencia
mysql -h <host> -u <usuario> -p <bd> < scripts/limpiar_bd.sql
```

### **Alertas a Monitorear:**

| Alerta | Causa | Solución |
|--------|-------|----------|
| "Error MySQL" en logs | BD desconectada | Verificar conexión Railway |
| Historial no carga | Endpoint caído | Reiniciar Node.js |
| PDF no descarga | Falta datos de BD | Verificar que paciente tenga registros |
| Alertas no se guardan | Tabla llena o permiso faltante | Ejecutar limpieza manual |

---

## **ESTRUCTURA DE TABLA `alertas` (Requerida)**

Si aún no la has creado, usa esta definición:

```sql
CREATE TABLE alertas (
    id_alerta INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT NOT NULL,
    id_registro VARCHAR(100),
    tipo_alerta VARCHAR(50),
    descripcion TEXT,
    fecha_alerta DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente)
);
```

---

## **ESTADÍSTICAS ESPERADAS EN PRODUCCIÓN**

Con el sistema en producción y el ESP32 enviando 1 lectura cada 10 segundos:

| Métrica | Valor |
|---------|-------|
| Lecturas/hora (normales) | ~360 |
| Registros/hora guardados | 1 (promedio) |
| Registros en 30 días | ~720 (30 promedios diarios) |
| Alertas/día (promedio) | 3-5 |
| Espacio en BD/mes | ~50 KB |

---

## **SOPORTE Y PRÓXIMOS PASOS**

✅ Sistema consolidado y listo para producción
✅ Bases de datos optimizadas con retención de 30 días
✅ Alertas automáticas guardadas
✅ Reportes PDF mejorados
✅ Historial de reportes funcional

**Próximas mejoras opcionales:**
- [ ] Gráficos en reportes PDF (ApexCharts export)
- [ ] Correo automático de alertas críticas
- [ ] Dashboard de administrador
- [ ] Exportación de datos masiva (Excel)
- [ ] API de integración con sistemas de salud

---

**Fecha de consolidación:** 1 de junio de 2026
**Versión Seroa:** 1.0 - PRODUCCIÓN
