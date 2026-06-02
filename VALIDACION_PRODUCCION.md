# **GUÍA DE VALIDACIÓN RÁPIDA - SEROA PRODUCCIÓN**

## **PRE-LAUNCH CHECKLIST**

Ejecuta estas pruebas antes de pasar a producción:

---

## **TEST 1: Verificar Limpieza de BD** ✓

**SQL a ejecutar:**
```sql
-- Ejecutar scripts/verificar_bd.sql primero
-- Luego ejecutar scripts/limpiar_bd.sql

-- Verificar que las tablas están vacías:
SELECT COUNT(*) FROM registros_biomedicos;  -- Debe ser 0
SELECT COUNT(*) FROM alertas;                -- Debe ser 0
```

**Resultado esperado:**
```
Count(*) = 0
Count(*) = 0
```

---

## **TEST 2: Verificar Endpoints del Backend** ✓

### **2.1: GET /api/historial-fechas**

**Usar Postman o curl:**
```bash
curl "http://localhost:3000/api/historial-fechas?id_paciente=1"
```

**Resultado esperado (inicialmente vacío):**
```json
[]
```

**Resultado esperado (después de datos):**
```json
[
  { "fecha_guardada": "2026-06-01" },
  { "fecha_guardada": "2026-05-31" }
]
```

### **2.2: GET /api/reporte-dia**

**Usar Postman:**
```bash
curl "http://localhost:3000/api/reporte-dia?id_paciente=1&fecha=2026-06-01"
```

**Resultado esperado:**
```json
{
  "registros": [],
  "notas": []
}
```

### **2.3: POST /api/registros (Lectura Normal)**

**Payload:**
```json
{
  "id_paciente": 1,
  "id_dispositivo": 1,
  "saturacion_oxigeno": 95,
  "ritmo_cardiaco": 72,
  "es_critico": 0,
  "nivel_alerta": "Normal"
}
```

**Resultado esperado:**
```json
{
  "mensaje": "Lectura normal acumulada."
}
```

### **2.4: POST /api/registros (Lectura Crítica)**

**Payload:**
```json
{
  "id_paciente": 1,
  "id_dispositivo": 1,
  "saturacion_oxigeno": 82,
  "ritmo_cardiaco": 45,
  "es_critico": 2,
  "nivel_alerta": "Peligro"
}
```

**Resultado esperado:**
```json
{
  "mensaje": "Incidente guardado inmediatamente y alerta creada."
}
```

**Verificar en BD:**
```sql
SELECT * FROM registros_biomedicos LIMIT 1;  -- Debe haber 1 registro
SELECT * FROM alertas LIMIT 1;                -- Debe haber 1 alerta
```

---

## **TEST 3: Verificar Frontend** ✓

### **3.1: Cargar página registro.html**

1. Abre `http://localhost:3000/registro.html`
2. Selecciona un paciente (si tienes)
3. Verifica que carga sin errores

**Errores a evitar en console:**
```
❌ "Cannot read property 'getElementById' of undefined"
❌ "cargarHistorialFechas is not a function"
❌ "CORS error"
```

### **3.2: Descargar Reporte PDF Hoy**

1. Click en botón "Descargar Reporte Hoy"
2. Verificar que se descarga archivo PDF
3. Abrir PDF y verificar:
   - ✓ Título "Promediado por horas"
   - ✓ Encabezado con "#" en lugar de "ID"
   - ✓ Números secuenciales 1, 2, 3...

### **3.3: Verificar Historial de Reportes**

1. Ir a sección "Historial de Reportes (Último mes)"
2. Si no hay datos: "No hay reportes de días anteriores guardados"
3. Si hay datos: Verifica que aparecen tarjetas con fechas y botones

---

## **TEST 4: Verificar Promediado por Horas** ✓

**Procedimiento:**
1. Abre `registro.html`
2. Envía 5 lecturas NORMALES en la misma hora desde Postman:
   ```json
   {
     "id_paciente": 1,
     "saturacion_oxigeno": 95,
     "ritmo_cardiaco": 72,
     "nivel_alerta": "Normal"
   }
   ```
3. Espera a que termine la hora o cambie a nueva hora
4. Ejecuta query:
   ```sql
   SELECT COUNT(*) FROM registros_biomedicos;
   ```

**Resultado esperado:**
```
Count(*) = 1  (UN promedio, no 5 registros)
```

---

## **TEST 5: Verificar Alertas** ✓

**Procedimiento:**
1. Envía 3 lecturas CRÍTICAS desde Postman:
   ```json
   {
     "id_paciente": 1,
     "saturacion_oxigeno": 82,
     "ritmo_cardiaco": 40,
     "es_critico": 2,
     "nivel_alerta": "Peligro"
   }
   ```
2. Ejecuta queries:
   ```sql
   SELECT * FROM registros_biomedicos;  -- 3 registros
   SELECT * FROM alertas;                -- 3 alertas
   ```

**Resultado esperado:**
- 3 registros guardados inmediatamente
- 3 alertas creadas
- Cada alerta con tipo="Peligro"

---

## **TEST 6: Verificar Limpieza Automática** ✓

**Logs esperados en Node.js:**
```
✓ Limpieza automática: 0 registros biométricos eliminados (> 30 días)
✓ Limpieza automática: 0 notas clínicas eliminadas (> 30 días)
✓ Limpieza automática: 0 alertas eliminadas (> 30 días)
```

**Verificación manual:**
```bash
# Ver que está funcionando correctamente
# Espera 1 minuto (5 minutos después del arranque se ejecuta primera limpieza)
# Verifica que en logs aparece el mensaje de limpieza
```

---

## **TEST 7: Estadísticas y Monitoreo** ✓

**Ejecutar:**
```bash
# En MySQL:
mysql -h <host> -u <usuario> -p <bd> < scripts/estadisticas.sql
```

**Debe mostrar tablas con:**
- Total de registros
- Total de alertas
- Total de notas
- Pacientes monitoreados
- Tamaño de BD en MB

---

## **CHECKLIST DE VALIDACIÓN FINAL**

Marca cada item completado:

### **Preparación:**
- [ ] Ejecuté `scripts/limpiar_bd.sql`
- [ ] Ejecuté `scripts/verificar_bd.sql` y todo OK
- [ ] Reinicié Node.js con `npm start`

### **Endpoints Backend:**
- [ ] `/api/historial-fechas` retorna array (aunque esté vacío)
- [ ] `/api/reporte-dia` retorna objeto con registros y notas
- [ ] POST `/api/registros` guarda lectura normal
- [ ] POST `/api/registros` guarda lectura crítica E crea alerta

### **Frontend:**
- [ ] `registro.html` carga sin errores
- [ ] Botón "Descargar Reporte Hoy" funciona
- [ ] PDF descargado tiene título "Promediado por horas"
- [ ] PDF tiene encabezado "#" y números secuenciales

### **Lógica de Negocio:**
- [ ] Lecturas normales se acumulan (1 por hora)
- [ ] Lecturas críticas se guardan inmediatamente
- [ ] Tabla `alertas` se llena con eventos críticos
- [ ] Limpieza automática aparece en logs

### **Producción:**
- [ ] Node.js está en modo producción
- [ ] Puerto 3000 está abierto/accesible
- [ ] Base de datos MySQL está en Railway
- [ ] ESP32 está enviando datos correctamente

---

## **DATOS DE PRUEBA SUGERIDOS**

Para acelerar las pruebas, usa estos valores:

### **Paciente de Prueba:**
```json
{
  "nombre": "TEST-Paciente",
  "edad": 65,
  "peso_kg": 75,
  "sexo": "M",
  "padecimiento": "Hipoxemia",
  "rango_spo2_min": 90,
  "rango_spo2_max": 100
}
```

### **Lecturas de Prueba:**
```bash
# Lectura NORMAL
curl -X POST http://localhost:3000/api/registros \
  -H "Content-Type: application/json" \
  -d '{
    "id_paciente": 1,
    "saturacion_oxigeno": 95,
    "ritmo_cardiaco": 72,
    "nivel_alerta": "Normal"
  }'

# Lectura CRÍTICA
curl -X POST http://localhost:3000/api/registros \
  -H "Content-Type: application/json" \
  -d '{
    "id_paciente": 1,
    "saturacion_oxigeno": 82,
    "ritmo_cardiaco": 45,
    "es_critico": 2,
    "nivel_alerta": "Peligro"
  }'
```

---

## **ERRORES COMUNES Y SOLUCIONES**

| Error | Causa | Solución |
|-------|-------|----------|
| "Cannot find module 'mysql2'" | Dependencia faltante | `npm install mysql2` |
| "ECONNREFUSED" al BD | MySQL no conecta | Verificar Railway, credenciales .env |
| "historial-fechas undefined" | Endpoint no registrado | Reiniciar Node.js |
| "CORS error" | Frontend en diferente puerto | Usar proxy o habilitar CORS en server.js |
| PDF vacío | Sin datos del día | Generar datos de prueba primero |
| "Limpieza no aparece en logs" | Rutina no se ejecutó | Esperar 5 minutos después del arranque |

---

## **COMANDOS DE SOPORTE RÁPIDO**

```bash
# Ver si Node.js está corriendo
Get-Process node

# Ver puertos en uso
netstat -ano | findstr :3000

# Reiniciar Node.js
Ctrl+C en PowerShell
npm start

# Ver logs en tiempo real (si usas PM2)
pm2 logs

# Ejecutar limpieza manual
mysql -h <host> -u <usuario> -p <bd> < scripts/limpiar_bd.sql

# Ejecutar estadísticas
mysql -h <host> -u <usuario> -p <bd> < scripts/estadisticas.sql
```

---

## **MÉTRICAS A MONITOREAR**

Después de 24 horas en producción, deberías ver:

| Métrica | Valor Esperado |
|---------|----------------|
| Registros/día | 20-100 (1 por hora * 20-100 horas) |
| Alertas/día | 2-10 (eventos críticos) |
| Tamaño BD/día | 5-20 KB |
| Tiempo respuesta /api/reporte-dia | < 500 ms |
| Errores en logs | < 1 por hora |

---

**✅ TODAS LAS PRUEBAS COMPLETADAS = LISTO PARA PRODUCCIÓN**

Fecha: 1 de junio de 2026
