# CitasMed

Aplicación web de gestión de citas médicas — Práctica 3.3, Interacción Humano-Computadora.

**JavaScript puro**: HTML5 + CSS3 + JS. Sin Node, sin Express, sin frameworks, sin `npm install`.

## Cómo ejecutarlo

Abre `index.html` con doble clic en cualquier navegador moderno. No hace falta servidor.

## Arquitectura

| Capa | Archivo | Qué hace |
|---|---|---|
| Presentación | `index.html`, `css/styles.css`, `js/app.js` | Vistas, enrutamiento por hash, foco y anuncios accesibles, validación en cliente |
| Servicio | `js/api.js` | API tipo REST asíncrona (GET/POST/PUT/DELETE), validación, reglas de disponibilidad y persistencia en `localStorage` |

La interfaz nunca toca `localStorage` ni las reglas de negocio: todo pasa por `window.API`. `request()` en `api.js` es el único punto de acceso a los datos.

## Rutas de la API

```
GET    /specialties
GET    /doctors?specialty=
GET    /doctors/:id/days
GET    /doctors/:id/slots?date=YYYY-MM-DD
POST   /appointments           -> 201 | 409 horario ocupado | 422 datos inválidos
GET    /appointments?email=
PUT    /appointments/:id       -> reprogramar
DELETE /appointments/:id       -> cancelar
```

## Datos y pruebas

- Los datos se guardan en el `localStorage` del navegador (clave `citasmed_db_v1`).
- Para empezar limpio: abre una **ventana de incógnito** o ejecuta `localStorage.clear()` en la consola.
- ~30 % de los horarios aparecen como ocupados (datos de ejemplo generados de forma determinista).

## Despliegue
Para ver la aplicacion desplegada haz click [aqui]( https://leo-xcl.github.io/CitasMed)

## Accesibilidad

Semántica HTML5, labels asociados, mensajes de error accesibles, navegación completa por teclado, foco visible, contraste ≥ 5,9:1 en texto, objetivos táctiles ≥ 44 px, `aria-live` para estados, `<dialog>` nativo, `prefers-reduced-motion`. Responsivo en 320, 768 y 1024 px.
