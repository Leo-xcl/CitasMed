/*
 * api.js — "Backend" simulado de CitasMed (JavaScript puro, sin Node).
 *
 * Expone window.API con una interfaz tipo REST asíncrona. La interfaz de usuario
 * (app.js) NUNCA toca localStorage ni las reglas de negocio: todo pasa por aquí,
 * igual que pasaría con un servidor real. Para migrar a un backend real solo
 * habría que cambiar request() por fetch().
 *
 * Rutas:
 *   GET    /specialties
 *   GET    /doctors?specialty=
 *   GET    /doctors/:id
 *   GET    /doctors/:id/slots?date=YYYY-MM-DD
 *   GET    /doctors/:id/days
 *   POST   /appointments           {doctorId,date,time,name,email,phone,reason}
 *   GET    /appointments?email=
 *   PUT    /appointments/:id       {date,time}
 *   DELETE /appointments/:id
 */
(function () {
  'use strict';

  var DB_KEY = 'citasmed_db_v1';
  var LATENCY_MS = 250;

  var DOCTORS = [
    { id: 1, name: 'Dra. Laura Méndez',     specialty: 'Medicina general', room: 'Consultorio 1', shifts: ['am', 'pm'] },
    { id: 2, name: 'Dr. Carlos Ortega',     specialty: 'Medicina general', room: 'Consultorio 2', shifts: ['am'] },
    { id: 3, name: 'Dra. Sofía Ramírez',    specialty: 'Pediatría',        room: 'Consultorio 3', shifts: ['am', 'pm'] },
    { id: 4, name: 'Dr. Andrés Villalobos', specialty: 'Cardiología',      room: 'Consultorio 4', shifts: ['pm'] },
    { id: 5, name: 'Dra. Elena Castro',     specialty: 'Dermatología',     room: 'Consultorio 5', shifts: ['am', 'pm'] },
    { id: 6, name: 'Dr. Mateo Herrera',     specialty: 'Odontología',      room: 'Consultorio 6', shifts: ['pm'] }
  ];

  var SHIFT_SLOTS = {
    am: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
    pm: ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30']
  };

  // ---------- Persistencia (con respaldo en memoria si localStorage falla) ----------
  var memoryDb = null;

  function loadDb() {
    if (memoryDb) return memoryDb;
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* almacenamiento no disponible */ }
    return { appointments: [], nextId: 1 };
  }

  function saveDb(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      memoryDb = null;
    } catch (e) {
      memoryDb = db; // sigue funcionando durante la sesión
    }
  }

  // ---------- Utilidades ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

  // Hash determinista: simula que otros pacientes ya ocupan ~30 % de los horarios.
  function seededBusy(doctorId, date, time) {
    var s = doctorId + '|' + date + '|' + time, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 100 < 30;
  }

  function doctorSlots(doctor) {
    var out = [];
    doctor.shifts.forEach(function (sh) { out = out.concat(SHIFT_SLOTS[sh]); });
    return out;
  }

  function findDoctor(id) {
    for (var i = 0; i < DOCTORS.length; i++) if (DOCTORS[i].id === Number(id)) return DOCTORS[i];
    return null;
  }

  function isTaken(db, doctorId, date, time, ignoreId) {
    if (seededBusy(doctorId, date, time)) return true;
    return db.appointments.some(function (a) {
      return a.id !== ignoreId && a.doctorId === doctorId && a.date === date && a.time === time;
    });
  }

  /** Días laborables (lun-vie) de los próximos 14 días naturales, empezando mañana. */
  function workingDays() {
    var out = [], d = new Date();
    d.setHours(0, 0, 0, 0);
    for (var i = 1; i <= 14; i++) {
      var n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      if (!isWeekend(n)) out.push(toISO(n));
    }
    return out;
  }

  function publicAppointment(a) {
    var doc = findDoctor(a.doctorId);
    return {
      id: a.id, doctorId: a.doctorId, doctorName: doc.name, specialty: doc.specialty, room: doc.room,
      date: a.date, time: a.time, name: a.name, email: a.email, phone: a.phone, reason: a.reason
    };
  }

  // ---------- Validación ----------
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateSlot(db, doctor, date, time, ignoreId, errors) {
    if (!doctor) { errors.doctorId = 'Elige un médico de la lista.'; return; }
    var days = workingDays();
    if (!date) { errors.date = 'Elige un día para tu cita.'; }
    else if (days.indexOf(date) === -1) { errors.date = 'Ese día no está disponible. Elige uno de los días mostrados.'; }
    if (!time) { errors.time = 'Elige un horario para tu cita.'; }
    else if (doctorSlots(doctor).indexOf(time) === -1) { errors.time = 'Ese horario no existe para este médico. Elige otro.'; }
    if (!errors.date && !errors.time && isTaken(db, doctor.id, date, time, ignoreId)) {
      errors._conflict = 'Ese horario ya fue ocupado. Elige otro horario disponible.';
    }
  }

  function validatePatient(body, errors) {
    var name = (body.name || '').trim();
    var email = (body.email || '').trim();
    var phone = (body.phone || '').replace(/[\s\-()]/g, '');
    if (!name) errors.name = 'Escribe tu nombre completo, por ejemplo: Ana López Pérez.';
    else if (name.length < 5 || name.indexOf(' ') === -1) errors.name = 'Escribe tu nombre y apellido, por ejemplo: Ana López.';
    if (!email) errors.email = 'Escribe tu correo electrónico, por ejemplo: ana@correo.com.';
    else if (!EMAIL_RE.test(email)) errors.email = 'El correo no parece válido. Revisa que tenga @ y un dominio, por ejemplo: ana@correo.com.';
    if (!phone) errors.phone = 'Escribe un teléfono de 10 dígitos para avisarte si hay cambios.';
    else if (!/^\d{10}$/.test(phone)) errors.phone = 'El teléfono debe tener 10 dígitos, sin letras. Ejemplo: 5512345678.';
  }

  // ---------- Controladores ----------
  function handle(method, url, body) {
    var u = new URL(url, 'http://citasmed.local');
    var parts = u.pathname.split('/').filter(Boolean);
    var db = loadDb();
    var q = u.searchParams;

    // GET /specialties
    if (method === 'GET' && parts[0] === 'specialties') {
      var set = {};
      DOCTORS.forEach(function (d) { set[d.specialty] = true; });
      return { status: 200, data: Object.keys(set) };
    }

    // /doctors...
    if (parts[0] === 'doctors') {
      if (method === 'GET' && parts.length === 1) {
        var sp = q.get('specialty');
        return { status: 200, data: DOCTORS.filter(function (d) { return !sp || d.specialty === sp; }) };
      }
      var doc = findDoctor(parts[1]);
      if (!doc) return { status: 404, data: { message: 'No encontramos a ese médico.' } };
      if (method === 'GET' && parts.length === 2) return { status: 200, data: doc };
      if (method === 'GET' && parts[2] === 'days') {
        return { status: 200, data: workingDays() };
      }
      if (method === 'GET' && parts[2] === 'slots') {
        var date = q.get('date');
        if (workingDays().indexOf(date) === -1) return { status: 422, data: { message: 'Fecha fuera del calendario disponible.' } };
        var slots = doctorSlots(doc).map(function (t) {
          return { time: t, available: !isTaken(db, doc.id, date, t) };
        });
        return { status: 200, data: slots };
      }
    }

    // /appointments...
    if (parts[0] === 'appointments') {
      if (method === 'GET' && parts.length === 1) {
        var email = (q.get('email') || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return { status: 422, data: { errors: { email: 'El correo no parece válido. Ejemplo: ana@correo.com.' } } };
        var mine = db.appointments.filter(function (a) { return a.email.toLowerCase() === email; })
          .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })
          .map(publicAppointment);
        return { status: 200, data: mine };
      }

      if (method === 'POST' && parts.length === 1) {
        var errors = {};
        var d = findDoctor(body.doctorId);
        validateSlot(db, d, body.date, body.time, null, errors);
        validatePatient(body, errors);
        if (errors._conflict) return { status: 409, data: { message: errors._conflict } };
        if (Object.keys(errors).length) return { status: 422, data: { errors: errors } };
        var appt = {
          id: db.nextId++, doctorId: d.id, date: body.date, time: body.time,
          name: body.name.trim(), email: body.email.trim(),
          phone: body.phone.replace(/[\s\-()]/g, ''), reason: (body.reason || '').trim().slice(0, 300)
        };
        db.appointments.push(appt);
        saveDb(db);
        return { status: 201, data: publicAppointment(appt) };
      }

      var id = Number(parts[1]);
      var idx = -1;
      db.appointments.forEach(function (a, i) { if (a.id === id) idx = i; });
      if (idx === -1) return { status: 404, data: { message: 'No encontramos esa cita. Es posible que ya se haya cancelado.' } };

      if (method === 'PUT') {
        var cur = db.appointments[idx];
        var errs = {};
        validateSlot(db, findDoctor(cur.doctorId), body.date, body.time, cur.id, errs);
        if (errs._conflict) return { status: 409, data: { message: errs._conflict } };
        if (Object.keys(errs).length) return { status: 422, data: { errors: errs } };
        cur.date = body.date; cur.time = body.time;
        saveDb(db);
        return { status: 200, data: publicAppointment(cur) };
      }

      if (method === 'DELETE') {
        var removed = db.appointments.splice(idx, 1)[0];
        saveDb(db);
        return { status: 200, data: publicAppointment(removed) };
      }
    }

    return { status: 404, data: { message: 'Ruta no encontrada.' } };
  }

  /** Simula una petición HTTP: asíncrona, con latencia y rechazo en códigos >= 400. */
  function request(method, url, body) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var res;
        try { res = handle(method, url, body || {}); }
        catch (e) { res = { status: 500, data: { message: 'Ocurrió un error inesperado. Intenta de nuevo.' } }; }
        if (res.status >= 400) reject(res); else resolve(res);
      }, LATENCY_MS);
    });
  }

  window.API = {
    get: function (url) { return request('GET', url); },
    post: function (url, body) { return request('POST', url, body); },
    put: function (url, body) { return request('PUT', url, body); },
    del: function (url) { return request('DELETE', url); },
    _internals: { workingDays: workingDays, loadDb: loadDb, DB_KEY: DB_KEY }
  };
})();
