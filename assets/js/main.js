/* =========================================================
   Posada Desarrollo 2026 — lógica de la invitación
   Sin llaves: el frontend solo llama a Supabase Edge Functions
   públicas (sin JWT). Los secretos viven en Supabase.
   ========================================================= */
(function () {
  "use strict";

  var CONFIG = {
    functionsUrl: "https://gsweoumtsptsiiktdppj.supabase.co/functions/v1",
    // 19 dic 2026, 18:00 – 20 dic 2026, 01:00 (America/Monterrey, UTC-6)
    inicio: new Date("2026-12-19T18:00:00-06:00"),
    fin: new Date("2026-12-20T01:00:00-06:00"),
    titulo: "Posada Desarrollo 2026",
    lugar: "Paseo Murazano 3577, Lomas del Paseo Residencial Sector II",
    mapa: "https://maps.app.goo.gl/GyfLFKH36MazwqAb8",
    invitacion: "https://anagatuna.github.io/InvitacionPosada26/"
  };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function api(path, body) {
    return fetch(CONFIG.functionsUrl + "/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var e = new Error(data.error || "Error " + r.status);
          e.status = r.status;
          throw e;
        }
        return data;
      });
    });
  }

  /* ---------------- Cuenta regresiva ---------------- */
  (function countdown() {
    var box = $("#countdown");
    var msg = $("#countdown-msg");
    var units = {
      d: $('[data-u="d"]', box), h: $('[data-u="h"]', box),
      m: $('[data-u="m"]', box), s: $('[data-u="s"]', box)
    };
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    function tick() {
      var now = Date.now();
      var diff = CONFIG.inicio.getTime() - now;
      if (diff <= 0) {
        box.hidden = true;
        msg.hidden = false;
        msg.textContent = now < CONFIG.fin.getTime()
          ? "¡La posada ya comenzó! Te estamos esperando."
          : "Gracias por acompañarnos. ¡Feliz Navidad!";
        return false;
      }
      var s = Math.floor(diff / 1000);
      units.d.textContent = pad(Math.floor(s / 86400));
      units.h.textContent = pad(Math.floor((s % 86400) / 3600));
      units.m.textContent = pad(Math.floor((s % 3600) / 60));
      units.s.textContent = pad(s % 60);
      return true;
    }
    if (tick()) {
      var id = setInterval(function () { if (!tick()) clearInterval(id); }, 1000);
    }
  })();

  /* ---------------- Google Calendar ---------------- */
  (function calendar() {
    function fmt(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: CONFIG.titulo,
      details: "Dress code: Fancy / Elegante.\nMapa: " + CONFIG.mapa + "\nInvitación: " + CONFIG.invitacion,
      location: CONFIG.lugar,
      ctz: "America/Monterrey"
    });
    $("#btn-gcal").href = "https://calendar.google.com/calendar/render?" + params.toString() +
      "&dates=" + fmt(CONFIG.inicio) + "/" + fmt(CONFIG.fin);
  })();

  /* ---------------- Tarjetas de minijuegos ---------------- */
  (function flips() {
    var wrap = $("#flips");
    var data = window.ACTIVIDADES || [];
    data.forEach(function (a) {
      var card = el("button", "flip");
      card.type = "button";
      card.setAttribute("aria-pressed", "false");
      card.setAttribute("aria-label", a.titulo + ": ver dinámica");

      var inner = el("div", "flip__inner");
      var front = el("div", "flip__face flip__front");
      front.appendChild(el("span", "flip__icon", a.icono || "✦"));
      if (a.ronda) front.appendChild(el("span", "flip__round", a.ronda));
      front.appendChild(el("h3", "flip__title", a.titulo));
      if (a.frase) front.appendChild(el("p", "flip__tag", a.frase));

      var back = el("div", "flip__face flip__back");
      back.appendChild(el("h3", null, a.titulo));
      back.appendChild(el("p", "flip__desc", a.descripcion || ""));
      if (a.detalles && a.detalles.length) {
        var ul = el("ul", "flip__meta");
        a.detalles.forEach(function (d) { ul.appendChild(el("li", null, d)); });
        back.appendChild(ul);
      }

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);
      card.addEventListener("click", function () {
        var on = card.classList.toggle("is-flipped");
        card.setAttribute("aria-pressed", on ? "true" : "false");
      });
      wrap.appendChild(card);
    });
  })();

  /* ---------------- Partículas (nieve + destellos dorados) ---------------- */
  (function particles() {
    var canvas = $("#particulas");
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    var parts = [], raf = null, w = 0, h = 0, dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function make(randomY) {
      var gold = Math.random() < 0.45;
      return {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : -10,
        r: gold ? Math.random() * 1.4 + 0.6 : Math.random() * 1.8 + 0.8,
        vy: gold ? Math.random() * 0.25 + 0.12 : Math.random() * 0.45 + 0.2,
        vx: (Math.random() - 0.5) * 0.15,
        sway: Math.random() * Math.PI * 2,
        tw: Math.random() * Math.PI * 2,
        gold: gold
      };
    }
    function init() {
      resize();
      var count = Math.round(Math.min(70, Math.max(28, (w * h) / 22000)));
      parts = [];
      for (var i = 0; i < count; i++) parts.push(make(true));
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.sway += 0.01; p.tw += 0.04;
        p.y += p.vy; p.x += p.vx + Math.sin(p.sway) * 0.15;
        if (p.y > h + 10 || p.x < -20 || p.x > w + 20) { parts[i] = make(false); continue; }
        var a;
        if (p.gold) {
          a = 0.25 + Math.abs(Math.sin(p.tw)) * 0.45;
          ctx.fillStyle = "rgba(236,215,154," + a.toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          if (a > 0.6) {
            ctx.strokeStyle = "rgba(236,215,154," + ((a - 0.6) * 1.2).toFixed(3) + ")";
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(p.x - p.r * 3, p.y); ctx.lineTo(p.x + p.r * 3, p.y);
            ctx.moveTo(p.x, p.y - p.r * 3); ctx.lineTo(p.x, p.y + p.r * 3);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = "rgba(246,239,226,0.32)";
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (raf || mq.matches || document.hidden) return; raf = requestAnimationFrame(frame); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, w, h); }
    function sync() { if (mq.matches) stop(); else start(); }

    init();
    sync();
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(init, 150); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else sync(); });
    if (mq.addEventListener) mq.addEventListener("change", sync);
    else if (mq.addListener) mq.addListener(sync);
  })();

  /* ---------------- Canciones (Spotify vía Edge Function) ---------------- */
  (function songs() {
    var form = $("#song-form");
    var input = $("#song-q");
    var hp = $("#song-web");
    var status = $("#song-status");
    var list = $("#song-results");
    var timer = null, seq = 0;

    function setStatus(text, kind) {
      status.textContent = text || "";
      status.className = "songs__status" + (kind ? " " + kind : "");
    }

    function render(tracks) {
      list.innerHTML = "";
      if (!tracks.length) { setStatus("Sin resultados. Prueba con otro nombre."); return; }
      setStatus("");
      tracks.forEach(function (t) {
        var li = el("li", "song");
        var img = el("img");
        img.alt = ""; img.loading = "lazy"; img.width = 48; img.height = 48;
        if (t.image) img.src = t.image;
        var info = el("div", "song__info");
        info.appendChild(el("span", "song__name", t.name));
        info.appendChild(el("span", "song__artist", t.artists));
        var btn = el("button", "song__add", "Agregar");
        btn.type = "button";
        btn.setAttribute("aria-label", "Agregar " + t.name + " de " + t.artists);
        btn.addEventListener("click", function () { add(t, btn); });
        li.appendChild(img); li.appendChild(info); li.appendChild(btn);
        list.appendChild(li);
      });
    }

    function search(q) {
      var my = ++seq;
      setStatus("Buscando…");
      api("song", { action: "search", q: q, website: hp.value }).then(function (d) {
        if (my !== seq) return;
        render(d.tracks || []);
      }).catch(function (e) {
        if (my !== seq) return;
        list.innerHTML = "";
        setStatus(e.status === 429 ? "Demasiadas búsquedas. Espera un momento." : "No pudimos buscar en este momento. Intenta de nuevo.", "err");
      });
    }

    function add(t, btn) {
      btn.disabled = true;
      btn.textContent = "…";
      api("song", { action: "add", uri: t.uri, website: hp.value }).then(function (d) {
        btn.textContent = d.duplicate ? "Ya está" : "Agregada ✓";
        btn.classList.add("is-done");
        document.dispatchEvent(new CustomEvent("playlist:changed", { detail: { uri: t.uri } }));
        setStatus(d.duplicate ? "“" + t.name + "” ya estaba en la playlist." : "¡Listo! “" + t.name + "” se agregó a la fila.", "ok");
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Agregar";
        setStatus(e.status === 429 ? "Has agregado varias canciones seguidas. Intenta en unos minutos." : "No se pudo agregar. Intenta de nuevo.", "err");
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { seq++; list.innerHTML = ""; setStatus(""); return; }
      timer = setTimeout(function () { search(q); }, 450);
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length >= 2) search(q);
      input.blur();
    });
  })();

  /* ---------------- Playlist en vivo (estilo reproductor de Spotify) ---------------- */
  (function playlist() {
    var box = $("#spx");
    if (!box) return;
    var listEl = $("#spx-list");
    var REFRESH_MS = 30000;
    var timer = null, loading = false, lastKey = "", highlight = null;

    function fmtDur(ms) {
      var s = Math.round(ms / 1000);
      return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    function render(d) {
      var key = d.total + "|" + d.tracks.map(function (t) { return t.uri; }).join(",");
      $("#spx-title").textContent = d.name;
      $("#spx-owner").textContent = d.owner;
      $("#spx-count").textContent = d.total === 1 ? "1 canción" : d.total + " canciones";
      ["#spx-logo", "#spx-open", "#spx-play"].forEach(function (s) { $(s).href = d.url; });
      var cover = $("#spx-cover");
      if (d.image && cover.getAttribute("src") !== d.image) cover.src = d.image;
      box.hidden = false;
      if (key === lastKey && !highlight) return; // nada nuevo: no redibujar
      lastKey = key;

      listEl.innerHTML = "";
      if (!d.tracks.length) {
        listEl.appendChild(el("li", "spx__empty", "Aún no hay canciones. ¡Sé el primero en agregar una!"));
        return;
      }
      d.tracks.forEach(function (t, i) {
        var li = el("li", "spx__row" + (highlight === t.uri ? " is-new" : ""));
        var a = el("a", "spx__link");
        a.href = "https://open.spotify.com/track/" + t.id;
        a.target = "_blank"; a.rel = "noopener";
        a.appendChild(el("span", "spx__num", String(d.total - i)));
        var img = el("img", "spx__thumb");
        img.alt = ""; img.loading = "lazy"; img.width = 40; img.height = 40;
        if (t.image) img.src = t.image;
        a.appendChild(img);
        var info = el("span", "spx__info");
        var name = el("span", "spx__name", t.name);
        info.appendChild(name);
        var art = el("span", "spx__artist");
        if (t.explicit) art.appendChild(el("span", "spx__e", "E"));
        art.appendChild(document.createTextNode(t.artists));
        info.appendChild(art);
        a.appendChild(info);
        a.appendChild(el("span", "spx__dur", fmtDur(t.duration)));
        li.appendChild(a);
        listEl.appendChild(li);
      });
      if (highlight) {
        listEl.scrollTop = 0;
        highlight = null;
      }
    }

    function load() {
      if (loading) return;
      loading = true;
      api("song", { action: "list" }).then(render).catch(function () {
        /* si falla, se conserva lo último que se mostró */
      }).then(function () { loading = false; });
    }

    function schedule() {
      clearInterval(timer);
      timer = document.hidden ? null : setInterval(load, REFRESH_MS);
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) load();
      schedule();
    });
    document.addEventListener("playlist:changed", function (ev) {
      highlight = ev.detail && ev.detail.uri;
      loading = false;
      load();
    });

    load();
    schedule();
  })();

  /* ---------------- RSVP ---------------- */
  (function rsvp() {
    var form = $("#rsvp-form");
    var msg = $("#rsvp-msg");
    var btn = $("#rsvp-btn");
    var guests = $("#f-invitados");
    var namesBox = $("#guest-names");
    var loadedAt = Date.now();

    function asistencia() { return form.querySelector('input[name="asistencia"]:checked').value; }

    function syncAttend() {
      var si = asistencia() === "si";
      form.querySelectorAll("[data-only-si]").forEach(function (n) {
        if (n === namesBox) n.hidden = !si || guests.value === "0";
        else n.hidden = !si;
      });
    }

    function syncGuests() {
      var n = parseInt(guests.value, 10) || 0;
      var prev = Array.prototype.map.call(namesBox.querySelectorAll("input"), function (i) { return i.value; });
      namesBox.innerHTML = "";
      if (n > 0) {
        var lbl = el("label", null, n === 1 ? "Nombre de tu invitado" : "Nombres de tus invitados");
        lbl.htmlFor = "g-0";
        namesBox.appendChild(lbl);
        for (var i = 0; i < n; i++) {
          var inp = el("input", "guest-input");
          inp.type = "text"; inp.id = "g-" + i; inp.maxLength = 80; inp.required = true;
          inp.placeholder = "Invitado " + (i + 1);
          inp.setAttribute("aria-label", "Nombre del invitado " + (i + 1));
          inp.value = prev[i] || "";
          namesBox.appendChild(inp);
        }
      }
      syncAttend();
    }

    form.querySelectorAll('input[name="asistencia"]').forEach(function (r) { r.addEventListener("change", syncAttend); });
    guests.addEventListener("change", syncGuests);
    syncGuests();

    function show(text, kind) { msg.textContent = text; msg.className = "form-msg" + (kind ? " " + kind : ""); }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      form.querySelectorAll(".is-invalid").forEach(function (n) { n.classList.remove("is-invalid"); });

      var si = asistencia() === "si";
      var nombre = $("#f-nombre");
      var correo = $("#f-correo");
      var bad = [];
      if (nombre.value.trim().length < 3) bad.push(nombre);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.value.trim())) bad.push(correo);
      var nombresInv = [];
      if (si) {
        namesBox.querySelectorAll("input").forEach(function (i) {
          if (!i.value.trim()) bad.push(i); else nombresInv.push(i.value.trim());
        });
      }
      if (bad.length) {
        bad.forEach(function (n) { n.classList.add("is-invalid"); });
        bad[0].focus();
        show("Revisa los campos marcados.", "err");
        return;
      }

      var payload = {
        asistencia: si ? "si" : "no",
        nombre: nombre.value.trim(),
        correo: correo.value.trim(),
        invitados: si ? nombresInv.length : 0,
        nombresInvitados: si ? nombresInv : [],
        mensaje: $("#f-mensaje").value.trim(),
        website: $("#f-web").value,
        t: Date.now() - loadedAt
      };

      btn.disabled = true;
      btn.textContent = "Enviando…";
      show("");

      api("rsvp", payload).then(function () {
        var done = el("div", "rsvp-done");
        done.setAttribute("tabindex", "-1");
        done.appendChild(el("h3", null, si ? "¡Gracias, " + payload.nombre.split(" ")[0] + "!" : "Gracias por avisarnos"));
        done.appendChild(el("p", null, si
          ? "Tu asistencia quedó confirmada. Enviamos tu Pase Digital a " + payload.correo + " (revisa también spam o promociones)."
          : "Te extrañaremos. Enviamos una confirmación a " + payload.correo + "."));
        form.innerHTML = "";
        form.appendChild(done);
        done.focus();
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Enviar confirmación";
        show(e.status === 429
          ? "Recibimos varios envíos desde tu conexión. Intenta en unos minutos."
          : (e.status === 400 && e.message ? e.message : "No pudimos enviar tu confirmación. Intenta de nuevo."), "err");
      });
    });
  })();
})();
