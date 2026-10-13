/*
 * app.js — Interfaz de CitasMed (JavaScript puro).
 * Solo se comunica con la capa de servicio a través de window.API (ver api.js).
 */
(function () {
  'use strict';

  var main = document.getElementById('main');
  var statusEl = document.getElementById('status');
  var dialog = document.getElementById('confirm-dialog');
  var USER_KEY = 'citasmed_user_v1';

  // ---------- Utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function fmtDayShort(iso) {
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return {
      wd: d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''),
      dm: d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
    };
  }

  function storeGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function storeSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* sin persistencia */ } }

  function announce(msg) {
    statusEl.textContent = '';
    setTimeout(function () { statusEl.textContent = msg; }, 50);
  }

  function loadingHtml(text) {
    return '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>' + esc(text) + '</span></div>';
  }

  function serverMsg(err) {
    return (err && err.data && err.data.message) || 'No pudimos completar la acción. Intenta de nuevo en unos segundos.';
  }

  // ---------- Estado ----------
  var user = storeGet(USER_KEY) || { name: '', email: '', phone: '' };
  var draft = freshDraft();
  var routeToken = 0; // evita que respuestas tardías pinten una pantalla anterior

  function freshDraft() { return { specialty: '', doctorId: null, doctor: null, date: '', time: '' }; }

  // ---------- Router ----------
  var routes = [
    { re: /^$/,                  nav: 'home',      title: 'Inicio',            fn: viewHome },
    { re: /^agendar\/1$/,        nav: 'agendar',   title: 'Paso 1: Elige médico',  fn: viewStep1 },
    { re: /^agendar\/2$/,        nav: 'agendar',   title: 'Paso 2: Fecha y hora',  fn: viewStep2 },
    { re: /^agendar\/3$/,        nav: 'agendar',   title: 'Paso 3: Tus datos',     fn: viewStep3 },
    { re: /^confirmacion\/(\d+)$/, nav: 'agendar', title: 'Cita confirmada',   fn: viewConfirmation },
    { re: /^mis-citas$/,         nav: 'mis-citas', title: 'Mis citas',         fn: viewMyAppointments },
    { re: /^reprogramar\/(\d+)$/, nav: 'mis-citas', title: 'Reprogramar cita', fn: viewReschedule },
    { re: /^ayuda$/,             nav: 'ayuda',     title: 'Ayuda',             fn: viewHelp }
  ];

  function onRoute() {
    var hash = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
    var token = ++routeToken;
    var match = null;
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(hash);
      if (m) { match = { route: routes[i], args: m.slice(1) }; break; }
    }
    if (!match) match = { route: { nav: '', title: 'Página no encontrada', fn: viewNotFound }, args: [] };

    document.title = match.route.title + ' · CitasMed';
    markNav(match.route.nav);
    var done = match.route.fn.apply(null, match.args.concat([token]));
    // El foco va al encabezado principal para orientar a quien usa teclado o lector de pantalla.
    Promise.resolve(done).then(function () {
      if (token !== routeToken) return;
      var h1 = main.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
      announce(match.route.title);
    });
  }

  function markNav(key) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function stepper(n) {
    var labels = ['Médico', 'Fecha y hora', 'Tus datos'];
    var html = '<p class="step-count">Paso ' + n + ' de 3</p><ol class="stepper" aria-label="Progreso de la cita">';
    labels.forEach(function (l, i) {
      var cls = i + 1 < n ? ' class="done"' : '';
      var cur = i + 1 === n ? ' aria-current="step"' : '';
      html += '<li' + cls + cur + '><span class="visually-hidden">' + (i + 1 < n ? 'Completado: ' : '') + '</span>' +
              '<span aria-hidden="true">' + (i + 1 < n ? '✓ ' : (i + 1) + '. ') + '</span><span class="label">' + l + '</span>' +
              '<span class="visually-hidden">' + (i + 1 < n ? '' : l) + '</span></li>';
    });
    return html + '</ol>';
  }

  // ====================================================================
  // INICIO
  // ====================================================================
  function viewHome() {
    main.innerHTML =
      '<section class="hero">' +
        '<div>' +
          '<p class="kicker">Citas médicas en línea</p>' +
          '<h1>Tu cita, en tres pasos.</h1>' +
          '<p class="lead">Escoge médico, día y hora. Solo te mostramos horarios que de verdad están libres, así que no hay llamadas ni sorpresas.</p>' +
          '<div class="hero-actions"><a class="btn btn-primary btn-lg" href="#/agendar/1">Agendar una cita</a>' +
          '<a class="link-quiet" href="#/mis-citas">Ya tengo una cita</a></div>' +
        '</div>' +
        // Ejemplo decorativo de cómo se verá tu comprobante
        '<div class="ticket ticket-sample" aria-hidden="true">' +
          '<div class="ticket-head"><span class="ticket-label">Comprobante de cita</span><span class="ticket-no">N.º 0147</span></div>' +
          '<div class="ticket-cut"></div>' +
          '<dl class="ticket-body"><dd class="t-doc">Dra. Sofía Ramírez</dd><dd class="t-meta">Pediatría · Consultorio 3</dd>' +
          '<dd class="t-when">miércoles 14 de octubre</dd><dd class="t-time">10:30 h</dd></dl>' +
        '</div>' +
      '</section>' +
      '<section class="how" aria-labelledby="como">' +
        '<h2 id="como">Cómo funciona</h2>' +
        '<ol class="steps">' +
          '<li><span class="n" aria-hidden="true">01</span><div><strong>Elige a tu médico.</strong><span class="d">Filtra por especialidad y mira quién atiende.</span></div></li>' +
          '<li><span class="n" aria-hidden="true">02</span><div><strong>Escoge día y hora.</strong><span class="d">Los horarios ocupados aparecen tachados.</span></div></li>' +
          '<li><span class="n" aria-hidden="true">03</span><div><strong>Confirma tus datos.</strong><span class="d">Recibes tu comprobante al instante.</span></div></li>' +
        '</ol>' +
      '</section>';
  }

  // ====================================================================
  // PASO 1 — MÉDICO
  // ====================================================================
  function viewStep1(token) {
    main.innerHTML =
      stepper(1) +
      '<h1>Elige a tu médico</h1>' +
      '<p class="lead">Puedes filtrar por especialidad.</p>' +
      '<form id="f1" novalidate class="narrow">' +
        '<div class="field"><label for="specialty">Especialidad</label>' +
        '<select id="specialty" name="specialty"><option value="">Todas las especialidades</option></select></div>' +
        '<fieldset id="doctor-fs" aria-describedby="doctor-err"><legend>Médico <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(obligatorio)</span></legend>' +
          '<div id="doctors" aria-live="polite">' + loadingHtml('Cargando médicos…') + '</div>' +
          '<div id="doctor-err"></div>' +
        '</fieldset>' +
        '<div class="btn-row"><a class="btn btn-secondary" href="#/">Volver al inicio</a>' +
        '<button class="btn btn-primary" type="submit">Continuar</button></div>' +
      '</form>';

    var sel = document.getElementById('specialty');
    var list = document.getElementById('doctors');

    function renderDoctors(docs) {
      if (!docs.length) { list.innerHTML = '<p>No hay médicos en esta especialidad por ahora.</p>'; return; }
      list.innerHTML = '<div class="choice-list">' + docs.map(function (d) {
        var checked = draft.doctorId === d.id ? ' checked' : '';
        return '<label class="choice"><input type="radio" name="doctor" value="' + d.id + '"' + checked + '>' +
               '<span class="box"><strong>' + esc(d.name) + '</strong><span class="meta">' + esc(d.specialty) + ' · ' + esc(d.room) + '</span></span></label>';
      }).join('') + '</div>';
    }

    function loadDoctors() {
      list.innerHTML = loadingHtml('Cargando médicos…');
      return API.get('/doctors' + (sel.value ? '?specialty=' + encodeURIComponent(sel.value) : '')).then(function (res) {
        if (token !== routeToken) return;
        renderDoctors(res.data);
        announce(res.data.length + (res.data.length === 1 ? ' médico disponible' : ' médicos disponibles'));
      }).catch(function (err) {
        list.innerHTML = '<div class="banner banner-error" role="alert">' + esc(serverMsg(err)) + ' <button type="button" class="btn btn-secondary" id="retry">Reintentar</button></div>';
        document.getElementById('retry').addEventListener('click', loadDoctors);
      });
    }

    return API.get('/specialties').then(function (res) {
      if (token !== routeToken) return;
      res.data.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s; o.textContent = s;
        if (draft.specialty === s) o.selected = true;
        sel.appendChild(o);
      });
      return loadDoctors();
    }).then(function () {
      sel.addEventListener('change', function () { draft.specialty = sel.value; loadDoctors(); });
      document.getElementById('f1').addEventListener('submit', function (e) {
        e.preventDefault();
        var chosen = document.querySelector('input[name="doctor"]:checked');
        var errBox = document.getElementById('doctor-err');
        if (!chosen) {
          errBox.innerHTML = '<p class="error-text" id="doctor-msg">Elige un médico de la lista para continuar.</p>';
          var first = document.querySelector('input[name="doctor"]');
          if (first) first.focus();
          announce('Falta elegir un médico. Elige uno de la lista para continuar.');
          return;
        }
        var newId = Number(chosen.value);
        if (draft.doctorId !== newId) { draft.date = ''; draft.time = ''; }
        draft.doctorId = newId;
        API.get('/doctors/' + newId).then(function (res) { draft.doctor = res.data; location.hash = '#/agendar/2'; });
      });
    });
  }

  // ====================================================================
  // PASO 2 — FECHA Y HORA (componente reutilizado en "Reprogramar")
  // ====================================================================
  function renderDateTimePicker(container, doctorId, current, onChange) {
    container.innerHTML =
      '<fieldset class="field"><legend>Día <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(obligatorio)</span></legend>' +
        '<div id="days">' + loadingHtml('Cargando días disponibles…') + '</div><div id="date-err"></div></fieldset>' +
      '<fieldset class="field"><legend>Horario <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(obligatorio)</span></legend>' +
        '<div id="slots" aria-live="polite"><p class="hint">Primero elige un día para ver los horarios.</p></div><div id="time-err"></div></fieldset>';

    var daysBox = container.querySelector('#days');
    var slotsBox = container.querySelector('#slots');
    var state = { date: current.date || '', time: current.time || '' };

    function loadSlots() {
      if (!state.date) return Promise.resolve();
      slotsBox.innerHTML = loadingHtml('Buscando horarios libres…');
      return API.get('/doctors/' + doctorId + '/slots?date=' + state.date).then(function (res) {
        var free = res.data.filter(function (s) { return s.available; }).length;
        if (!free) {
          slotsBox.innerHTML = '<div class="banner banner-warn">Ese día ya no tiene horarios libres con este médico. <strong>Prueba con otro día.</strong></div>';
          state.time = ''; onChange(state);
          return;
        }
        slotsBox.innerHTML = '<div class="chip-grid">' + res.data.map(function (s) {
          var chk = state.time === s.time && s.available ? ' checked' : '';
          var dis = s.available ? '' : ' disabled';
          return '<label class="chip"><input type="radio" name="time" value="' + s.time + '"' + chk + dis + '>' +
                 '<span class="box"><span class="t">' + s.time + '</span>' + (s.available ? '' : '<span class="meta">Ocupado</span>') + '</span></label>';
        }).join('') + '</div><p class="hint">' + free + ' horarios libres. Los horarios tachados ya están ocupados.</p>';
        announce(free + ' horarios libres el ' + fmtDate(state.date));
      }).catch(function (err) {
        slotsBox.innerHTML = '<div class="banner banner-error" role="alert">' + esc(serverMsg(err)) + '</div>';
      });
    }

    daysBox.addEventListener('change', function (e) {
      if (e.target.name !== 'date') return;
      state.date = e.target.value; state.time = '';
      container.querySelector('#date-err').innerHTML = '';
      onChange(state);
      loadSlots();
    });
    slotsBox.addEventListener('change', function (e) {
      if (e.target.name !== 'time') return;
      state.time = e.target.value;
      container.querySelector('#time-err').innerHTML = '';
      onChange(state);
    });

    return API.get('/doctors/' + doctorId + '/days').then(function (res) {
      daysBox.innerHTML = '<div class="chip-grid days">' + res.data.map(function (iso) {
        var s = fmtDayShort(iso), chk = state.date === iso ? ' checked' : '';
        return '<label class="chip"><input type="radio" name="date" value="' + iso + '"' + chk + '>' +
               '<span class="box"><span class="meta" style="text-transform:capitalize">' + esc(s.wd) + '</span><span class="t t-day">' + esc(s.dm) + '</span></span></label>';
      }).join('') + '</div>';
      return loadSlots();
    }).then(function () {
      return { getState: function () { return state; }, container: container };
    });
  }

  function validatePicker(state, container) {
    var ok = true, first = null;
    if (!state.date) {
      container.querySelector('#date-err').innerHTML = '<p class="error-text">Elige un día para continuar.</p>';
      first = first || container.querySelector('input[name="date"]'); ok = false;
    }
    if (state.date && !state.time) {
      container.querySelector('#time-err').innerHTML = '<p class="error-text">Elige un horario para continuar.</p>';
      first = first || container.querySelector('input[name="time"]:not(:disabled)'); ok = false;
    }
    if (!ok) { if (first) first.focus(); announce('Falta elegir ' + (!state.date ? 'un día' : 'un horario') + '.'); }
    return ok;
  }

  function viewStep2(token) {
    if (!draft.doctorId) { location.hash = '#/agendar/1'; return; }
    main.innerHTML =
      stepper(2) +
      '<h1>Elige día y hora</h1>' +
      '<p class="lead">Cita con <strong>' + esc(draft.doctor ? draft.doctor.name : '') + '</strong>' + (draft.doctor ? ' · ' + esc(draft.doctor.specialty) : '') + '.</p>' +
      '<form id="f2" novalidate class="narrow"><div id="picker"></div>' +
      '<div class="btn-row"><a class="btn btn-secondary" href="#/agendar/1">Atrás</a>' +
      '<button class="btn btn-primary" type="submit">Continuar</button></div></form>';

    var picker = document.getElementById('picker');
    return renderDateTimePicker(picker, draft.doctorId, { date: draft.date, time: draft.time }, function (s) {
      draft.date = s.date; draft.time = s.time;
    }).then(function (ctl) {
      document.getElementById('f2').addEventListener('submit', function (e) {
        e.preventDefault();
        if (validatePicker(ctl.getState(), picker)) location.hash = '#/agendar/3';
      });
    });
  }

  // ====================================================================
  // PASO 3 — DATOS Y CONFIRMACIÓN
  // ====================================================================
  // Comprobante de cita: se usa como resumen (paso 3), confirmación y tarjeta en «Mis citas».
  function ticketHtml(doctor, date, time, label, number) {
    return '<div class="ticket">' +
      '<div class="ticket-head"><span class="ticket-label">' + esc(label) + '</span>' +
      (number ? '<span class="ticket-no">N.º ' + String(number).padStart(4, '0') + '</span>' : '') + '</div>' +
      '<div class="ticket-cut" aria-hidden="true"></div>' +
      '<dl class="ticket-body">' +
      '<dt class="visually-hidden">Médico</dt><dd class="t-doc">' + esc(doctor.name || doctor.doctorName) + '</dd>' +
      '<dt class="visually-hidden">Especialidad y consultorio</dt><dd class="t-meta">' + esc(doctor.specialty) + ' · ' + esc(doctor.room) + '</dd>' +
      '<dt class="visually-hidden">Día</dt><dd class="t-when">' + esc(fmtDate(date)) + '</dd>' +
      '<dt class="visually-hidden">Hora</dt><dd class="t-time">' + esc(time) + ' h</dd></dl></div>';
  }
  function summaryHtml(doctor, date, time) { return ticketHtml(doctor, date, time, 'Resumen de tu cita'); }

  function fieldHtml(id, label, type, value, hint, extra) {
    return '<div class="field"><label for="' + id + '">' + label + ' <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(obligatorio)</span>' +
      (hint ? '<span class="hint" id="' + id + '-hint">' + hint + '</span>' : '') + '</label>' +
      '<input id="' + id + '" name="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (extra || '') +
      ' aria-describedby="' + (hint ? id + '-hint ' : '') + id + '-err" aria-required="true">' +
      '<div id="' + id + '-err"></div></div>';
  }

  function viewStep3() {
    if (!draft.doctorId || !draft.date || !draft.time) { location.hash = '#/agendar/' + (draft.doctorId ? '2' : '1'); return; }
    main.innerHTML =
      stepper(3) +
      '<h1>Confirma tus datos</h1>' +
      '<div id="form-errors"></div>' +
      '<div class="narrow">' + summaryHtml(draft.doctor, draft.date, draft.time) + '</div>' +
      '<form id="f3" novalidate class="narrow">' +
        fieldHtml('name', 'Nombre completo', 'text', user.name, 'Ejemplo: Ana López Pérez', 'autocomplete="name"') +
        fieldHtml('email', 'Correo electrónico', 'email', user.email, 'Lo usarás para ver o cancelar tu cita', 'autocomplete="email" inputmode="email"') +
        fieldHtml('phone', 'Teléfono (10 dígitos)', 'tel', user.phone, 'Ejemplo: 5512345678', 'autocomplete="tel" inputmode="numeric"') +
        '<div class="field"><label for="reason">Motivo de la consulta <span class="hint">Opcional</span></label>' +
        '<textarea id="reason" name="reason" maxlength="300"></textarea></div>' +
        '<div class="btn-row"><a class="btn btn-secondary" href="#/agendar/2">Atrás</a>' +
        '<button class="btn btn-primary" type="submit" id="submit3">Confirmar cita</button></div>' +
      '</form>';

    var form = document.getElementById('f3');
    var fieldIds = ['name', 'email', 'phone'];

    function showErrors(errors) {
      var items = [];
      fieldIds.forEach(function (id) {
        var input = document.getElementById(id), box = document.getElementById(id + '-err');
        if (errors[id]) {
          input.setAttribute('aria-invalid', 'true');
          box.innerHTML = '<p class="error-text">' + esc(errors[id]) + '</p>';
          items.push({ id: id, msg: errors[id] });
        } else {
          input.removeAttribute('aria-invalid'); box.innerHTML = '';
        }
      });
      var summary = document.getElementById('form-errors');
      if (!items.length) { summary.innerHTML = ''; return; }
      summary.innerHTML = '<div class="banner banner-error" role="alert" tabindex="-1" id="err-summary"><h2>Revisa ' + items.length + (items.length === 1 ? ' dato' : ' datos') + ' antes de continuar</h2><ul>' +
        items.map(function (i) { return '<li><a href="#" data-focus="' + i.id + '">' + esc(i.msg) + '</a></li>'; }).join('') + '</ul></div>';
      document.getElementById('err-summary').focus();
    }

    document.getElementById('form-errors').addEventListener('click', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-focus');
      if (id) { e.preventDefault(); document.getElementById(id).focus(); }
    });

    // Validación en tiempo real al salir de cada campo (prevención de errores)
    fieldIds.forEach(function (id) {
      document.getElementById(id).addEventListener('blur', function () {
        var input = document.getElementById(id), box = document.getElementById(id + '-err');
        if (input.value.trim() === '' && !input.hasAttribute('aria-invalid')) return;
        var errs = localValidate({ name: form.name.value, email: form.email.value, phone: form.phone.value });
        if (errs[id]) { input.setAttribute('aria-invalid', 'true'); box.innerHTML = '<p class="error-text">' + esc(errs[id]) + '</p>'; }
        else { input.removeAttribute('aria-invalid'); box.innerHTML = ''; }
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = {
        doctorId: draft.doctorId, date: draft.date, time: draft.time,
        name: form.name.value, email: form.email.value, phone: form.phone.value, reason: form.reason.value
      };
      var clientErrs = localValidate(body);
      if (Object.keys(clientErrs).length) { showErrors(clientErrs); return; }
      showErrors({});
      var btn = document.getElementById('submit3');
      btn.disabled = true; btn.textContent = 'Confirmando…';
      announce('Confirmando tu cita…');
      API.post('/appointments', body).then(function (res) {
        user = { name: body.name.trim(), email: body.email.trim(), phone: body.phone.trim() };
        storeSet(USER_KEY, user);
        draft = freshDraft();
        location.hash = '#/confirmacion/' + res.data.id;
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = 'Confirmar cita';
        if (err.status === 422 && err.data.errors) {
          if (err.data.errors.date || err.data.errors.time || err.data.errors.doctorId) { location.hash = '#/agendar/2'; return; }
          showErrors(err.data.errors);
        } else if (err.status === 409) {
          draft.time = '';
          document.getElementById('form-errors').innerHTML = '<div class="banner banner-warn" role="alert" tabindex="-1" id="err-summary"><h2>Ese horario ya no está libre</h2><p>' + esc(serverMsg(err)) + '</p><a class="btn btn-primary" href="#/agendar/2">Elegir otro horario</a></div>';
          document.getElementById('err-summary').focus();
        } else {
          document.getElementById('form-errors').innerHTML = '<div class="banner banner-error" role="alert" tabindex="-1" id="err-summary"><h2>No pudimos agendar tu cita</h2><p>' + esc(serverMsg(err)) + '</p></div>';
          document.getElementById('err-summary').focus();
        }
      });
    });
  }

  // Validación en el cliente (la misma regla existe en el "servidor": nunca se confía solo en el cliente)
  function localValidate(b) {
    var e = {}, name = (b.name || '').trim(), email = (b.email || '').trim(), phone = (b.phone || '').replace(/[\s\-()]/g, '');
    if (!name) e.name = 'Escribe tu nombre completo, por ejemplo: Ana López Pérez.';
    else if (name.length < 5 || name.indexOf(' ') === -1) e.name = 'Escribe tu nombre y apellido, por ejemplo: Ana López.';
    if (!email) e.email = 'Escribe tu correo electrónico, por ejemplo: ana@correo.com.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = 'El correo no parece válido. Revisa que tenga @ y un dominio, por ejemplo: ana@correo.com.';
    if (!phone) e.phone = 'Escribe un teléfono de 10 dígitos para avisarte si hay cambios.';
    else if (!/^\d{10}$/.test(phone)) e.phone = 'El teléfono debe tener 10 dígitos, sin letras. Ejemplo: 5512345678.';
    return e;
  }

  // ====================================================================
  // CONFIRMACIÓN
  // ====================================================================
  function viewConfirmation(id, token) {
    main.innerHTML = loadingHtml('Cargando tu confirmación…');
    return API.get('/appointments?email=' + encodeURIComponent(user.email)).then(function (res) {
      if (token !== routeToken) return;
      var a = res.data.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!a) { main.innerHTML = '<h1>No encontramos esa cita</h1><p>Revisa tus citas en <a href="#/mis-citas">Mis citas</a>.</p>'; return; }
      main.innerHTML =
        '<div class="banner banner-ok" role="status"><h1>¡Tu cita está confirmada!</h1><p style="margin:0">Guarda tu comprobante. Puedes verla, cambiarla o cancelarla desde <a href="#/mis-citas">Mis citas</a>.</p></div>' +
        '<div class="narrow">' + ticketHtml(a, a.date, a.time, 'Comprobante de cita', a.id) +
        '<p style="margin-top:16px">A nombre de: <strong>' + esc(a.name) + '</strong></p>' +
        '<p class="hint">Llega 10 minutos antes y lleva una identificación oficial.</p>' +
        '<div class="btn-row"><a class="btn btn-secondary" href="#/mis-citas">Ver mis citas</a><a class="btn btn-primary" href="#/agendar/1">Agendar otra cita</a></div></div>';
    }).catch(function (err) {
      main.innerHTML = '<h1>No pudimos cargar la confirmación</h1><p>' + esc(serverMsg(err)) + '</p><p><a href="#/mis-citas">Ir a Mis citas</a></p>';
    });
  }

  // ====================================================================
  // MIS CITAS
  // ====================================================================
  function viewMyAppointments(token) {
    if (!user.email) {
      main.innerHTML =
        '<h1>Mis citas</h1><p class="lead">Escribe el correo con el que agendaste para ver tus citas.</p>' +
        '<form id="fm" novalidate class="narrow">' + fieldHtml('email', 'Correo electrónico', 'email', '', 'Ejemplo: ana@correo.com', 'autocomplete="email" inputmode="email"') +
        '<div class="btn-row"><button class="btn btn-primary" type="submit">Ver mis citas</button></div></form>';
      document.getElementById('fm').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = document.getElementById('email').value.trim();
        var errs = localValidate({ name: 'x x x x', email: v, phone: '5500000000' });
        if (errs.email) {
          document.getElementById('email').setAttribute('aria-invalid', 'true');
          document.getElementById('email-err').innerHTML = '<p class="error-text" role="alert">' + esc(errs.email) + '</p>';
          document.getElementById('email').focus(); return;
        }
        user.email = v; storeSet(USER_KEY, user); onRoute();
      });
      return;
    }

    main.innerHTML = '<h1>Mis citas</h1>' + loadingHtml('Buscando tus citas…');
    return API.get('/appointments?email=' + encodeURIComponent(user.email)).then(function (res) {
      if (token !== routeToken) return;
      var list = res.data;
      var html = '<h1>Mis citas</h1><p class="hint">Mostrando citas de <strong>' + esc(user.email) + '</strong>. <button type="button" class="btn btn-secondary" id="change-email" style="min-height:44px">Usar otro correo</button></p><div id="msg" aria-live="polite"></div>';
      if (!list.length) {
        html += '<div class="card empty"><h2>Aún no tienes citas</h2><p>Cuando agendes una, aparecerá aquí.</p><a class="btn btn-primary" href="#/agendar/1">Agendar mi primera cita</a></div>';
      } else {
        html += '<ul class="appt-list">' + list.map(function (a) {
          return '<li class="ticket appt"><div class="ticket-head"><span class="ticket-label">Cita</span><span class="ticket-no">N.º ' + String(a.id).padStart(4, '0') + '</span></div>' +
            '<div class="ticket-cut" aria-hidden="true"></div>' +
            '<h2 class="visually-hidden">Cita con ' + esc(a.doctorName) + '</h2>' +
            '<dl class="ticket-body"><dt class="visually-hidden">Médico</dt><dd class="t-doc">' + esc(a.doctorName) + '</dd>' +
            '<dt class="visually-hidden">Especialidad y consultorio</dt><dd class="t-meta">' + esc(a.specialty) + ' · ' + esc(a.room) + '</dd>' +
            '<dt class="visually-hidden">Día</dt><dd class="t-when">' + esc(fmtDate(a.date)) + '</dd>' +
            '<dt class="visually-hidden">Hora</dt><dd class="t-time">' + esc(a.time) + ' h</dd></dl>' +
            '<div class="appt-actions">' +
            '<a class="btn btn-secondary" href="#/reprogramar/' + a.id + '">Reprogramar<span class="visually-hidden"> cita con ' + esc(a.doctorName) + ' del ' + esc(fmtDate(a.date)) + '</span></a>' +
            '<button type="button" class="btn btn-danger" data-cancel="' + a.id + '" data-desc="' + esc(a.doctorName + ', ' + fmtDate(a.date) + ' a las ' + a.time) + '">Cancelar<span class="visually-hidden"> cita con ' + esc(a.doctorName) + ' del ' + esc(fmtDate(a.date)) + '</span></button>' +
            '</div></li>';
        }).join('') + '</ul><p><a class="btn btn-primary" href="#/agendar/1" style="margin-top:20px">Agendar otra cita</a></p>';
      }
      main.innerHTML = html;
      document.getElementById('change-email').addEventListener('click', function () {
        user.email = ''; storeSet(USER_KEY, user); onRoute();
      });
      main.querySelectorAll('[data-cancel]').forEach(function (btn) {
        btn.addEventListener('click', function () { askCancel(btn); });
      });
    }).catch(function (err) {
      main.innerHTML = '<h1>Mis citas</h1><div class="banner banner-error" role="alert">' + esc(serverMsg(err)) + '</div>';
    });
  }

  function askCancel(trigger) {
    var id = trigger.getAttribute('data-cancel');
    document.getElementById('dlg-text').textContent = 'Vas a cancelar tu cita con ' + trigger.getAttribute('data-desc') + '. Esta acción libera el horario y no se puede deshacer.';
    function doCancel() {
      API.del('/appointments/' + id).then(function () {
        onRoute();
        setTimeout(function () {
          var m = document.getElementById('msg');
          if (m) m.innerHTML = '<div class="banner banner-ok">Tu cita fue cancelada. El horario quedó libre.</div>';
          announce('Tu cita fue cancelada.');
        }, 400);
      }).catch(function (err) {
        var m = document.getElementById('msg');
        if (m) m.innerHTML = '<div class="banner banner-error" role="alert">' + esc(serverMsg(err)) + '</div>';
      });
    }
    // Respaldo para navegadores sin <dialog> (Safari < 15.4, Firefox < 98)
    if (typeof dialog.showModal !== 'function') {
      if (window.confirm(document.getElementById('dlg-text').textContent)) doCancel();
      else trigger.focus();
      return;
    }
    function onClose() {
      dialog.removeEventListener('close', onClose);
      if (dialog.returnValue === 'yes') doCancel();
      else if (document.body.contains(trigger)) { trigger.focus(); }
    }
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    document.getElementById('dlg-keep').focus(); // el foco inicia en la opción segura
  }

  // ====================================================================
  // REPROGRAMAR
  // ====================================================================
  function viewReschedule(id, token) {
    main.innerHTML = '<h1>Reprogramar cita</h1>' + loadingHtml('Cargando tu cita…');
    return API.get('/appointments?email=' + encodeURIComponent(user.email)).then(function (res) {
      if (token !== routeToken) return;
      var a = res.data.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!a) { main.innerHTML = '<h1>No encontramos esa cita</h1><p><a href="#/mis-citas">Volver a Mis citas</a></p>'; return; }
      main.innerHTML =
        '<h1>Reprogramar cita</h1>' +
        '<p class="lead">Cita actual con <strong>' + esc(a.doctorName) + '</strong>: <span style="text-transform:capitalize">' + esc(fmtDate(a.date)) + '</span> a las ' + esc(a.time) + '.</p>' +
        '<div id="resched-errors"></div>' +
        '<form id="fr" novalidate class="narrow"><div id="picker"></div>' +
        '<div class="btn-row"><a class="btn btn-secondary" href="#/mis-citas">Cancelar cambio</a>' +
        '<button class="btn btn-primary" type="submit" id="save-r">Guardar nuevo horario</button></div></form>';
      var picker = document.getElementById('picker');
      return renderDateTimePicker(picker, a.doctorId, { date: '', time: '' }, function () {}).then(function (ctl) {
        document.getElementById('fr').addEventListener('submit', function (e) {
          e.preventDefault();
          var s = ctl.getState();
          if (!validatePicker(s, picker)) return;
          var btn = document.getElementById('save-r'); btn.disabled = true; btn.textContent = 'Guardando…';
          API.put('/appointments/' + a.id, { date: s.date, time: s.time }).then(function () {
            location.hash = '#/confirmacion/' + a.id;
          }).catch(function (err) {
            btn.disabled = false; btn.textContent = 'Guardar nuevo horario';
            var box = document.getElementById('resched-errors');
            box.innerHTML = '<div class="banner banner-warn" role="alert" tabindex="-1" id="err-r"><h2>No se pudo cambiar la cita</h2><p>' + esc(serverMsg(err) || 'Elige otro horario.') + '</p></div>';
            document.getElementById('err-r').focus();
          });
        });
      });
    }).catch(function (err) {
      main.innerHTML = '<h1>Reprogramar cita</h1><div class="banner banner-error" role="alert">' + esc(serverMsg(err)) + '</div>';
    });
  }

  // ====================================================================
  // AYUDA
  // ====================================================================
  function viewHelp() {
    main.innerHTML =
      '<h1>Ayuda</h1><p class="lead">Respuestas a las dudas más comunes.</p><div class="narrow">' +
      '<details><summary>¿Cómo agendo una cita?</summary><p>Entra a <a href="#/agendar/1">Agendar cita</a>, elige médico, día y hora, y confirma tus datos. Son 3 pasos.</p></details>' +
      '<details><summary>¿Cómo veo mis citas?</summary><p>Ve a <a href="#/mis-citas">Mis citas</a> y escribe el correo con el que agendaste.</p></details>' +
      '<details><summary>¿Puedo cambiar el día o la hora?</summary><p>Sí. En <a href="#/mis-citas">Mis citas</a> pulsa “Reprogramar” en la cita que quieras cambiar y elige un nuevo horario.</p></details>' +
      '<details><summary>¿Cómo cancelo una cita?</summary><p>En <a href="#/mis-citas">Mis citas</a> pulsa “Cancelar”. Te pediremos confirmar antes de hacerlo para evitar errores.</p></details>' +
      '<details><summary>¿Por qué un horario aparece tachado?</summary><p>Significa que otro paciente ya lo reservó. Elige uno de los horarios libres.</p></details>' +
      '<details><summary>¿Puedo usar solo el teclado?</summary><p>Sí. Usa <kbd>Tab</kbd> para avanzar, <kbd>Shift</kbd>+<kbd>Tab</kbd> para retroceder, las flechas para elegir opciones y <kbd>Enter</kbd> o <kbd>Espacio</kbd> para activar. <kbd>Esc</kbd> cierra los avisos.</p></details>' +
      '</div>';
  }

  function viewNotFound() {
    main.innerHTML = '<h1>Página no encontrada</h1><p>La dirección que buscas no existe.</p><p><a class="btn btn-primary" href="#/">Ir al inicio</a></p>';
  }

  window.addEventListener('hashchange', onRoute);
  onRoute();
})();
