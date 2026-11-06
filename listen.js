// "Listen to this article": plays the voiceover declared in #voiceover, shows
// how long it is, highlights the word being spoken and keeps it in view.
// Articles without a voiceover never load this script.
(function () {
  var cfgEl = document.getElementById("voiceover");
  var meta = document.querySelector(".article-meta");
  var body = document.querySelector(".article-body");
  if (!cfgEl || !meta || !body) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

  var audio = new Audio();
  audio.preload = "metadata";
  audio.src = cfg.audio;

  var starts = null;      // start time of each word, once the timings load
  var spans = [];         // spans[i] = the elements that make up word i
  var cur = -1;           // word being spoken
  var started = false, follow = true, inView = true, loading = false, raf = 0, autoUntil = 0, autoY = 0, dragging = false;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Controls ───────────────────────────────────────────────────────────
  var MAIN =
    '<button type="button" class="listen-btn" aria-pressed="false"><span class="listen-ico"></span>' +
    '<span class="listen-label">Listen to this article</span><span class="listen-time"></span></button>' +
    '<button type="button" class="listen-speed" aria-label="Playback speed">1×</button>' +
    '<button type="button" class="listen-follow" hidden>Follow along</button>';
  var SEEK = '<input type="range" class="listen-seek" min="0" max="1000" value="0" step="1" aria-label="Seek" hidden />';
  // The page may already have a .listen row (with the Spotify link); otherwise make one.
  var box = meta.querySelector(".listen");
  if (box) {
    box.insertAdjacentHTML("afterbegin", MAIN);
    box.insertAdjacentHTML("beforeend", SEEK);
  } else {
    box = document.createElement("div");
    box.className = "listen";
    box.innerHTML = MAIN + SEEK;
    var byline = meta.querySelector(".article-byline");
    if (byline) byline.after(box); else meta.appendChild(box);
  }

  var fl = document.createElement("div");
  fl.className = "listen-float";
  fl.hidden = true;
  fl.innerHTML =
    '<button type="button" class="listen-fbtn" aria-label="Play"></button><span class="listen-ftime"></span>' +
    '<button type="button" class="listen-speed" aria-label="Playback speed">1×</button>' +
    '<button type="button" class="listen-follow" hidden>Follow along</button>' +
    '<input type="range" class="listen-seek" min="0" max="1000" value="0" step="1" aria-label="Seek" />';
  document.body.appendChild(fl);

  var btn = box.querySelector(".listen-btn");
  var ico = box.querySelector(".listen-ico");
  var label = box.querySelector(".listen-label");
  var timeEl = box.querySelector(".listen-time");
  var fbtn = fl.querySelector(".listen-fbtn");
  var ftime = fl.querySelector(".listen-ftime");
  var follows = [box.querySelector(".listen-follow"), fl.querySelector(".listen-follow")];
  var speedBtns = [box.querySelector(".listen-speed"), fl.querySelector(".listen-speed")];
  var seeks = [box.querySelector(".listen-seek"), fl.querySelector(".listen-seek")];

  // Playback speed: cycles through RATES, and is remembered between visits.
  var RATES = [1, 1.25, 1.5, 2];
  var rate = 1;
  try {
    var saved = parseFloat(localStorage.getItem("listenRate"));
    if (RATES.indexOf(saved) > -1) rate = saved;
  } catch (e) {}
  function setRate(r, save) {
    rate = r;
    audio.defaultPlaybackRate = r;
    audio.playbackRate = r;
    audio.preservesPitch = true;
    audio.webkitPreservesPitch = true;
    speedBtns.forEach(function (b) {
      b.textContent = r + "×";
      b.setAttribute("aria-label", "Playback speed " + r + "x. Change speed");
    });
    if (save) try { localStorage.setItem("listenRate", String(r)); } catch (e) {}
  }
  speedBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length], true);
    });
  });
  setRate(rate);

  function total() {
    return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : cfg.duration || 0;
  }
  function fmt(s) {
    s = Math.max(0, Math.round(s));
    var r = s % 60;
    return Math.floor(s / 60) + ":" + (r < 10 ? "0" : "") + r;
  }
  function playing() { return !audio.paused && !audio.ended; }

  // Everything that changes on play, pause, end and follow, not every frame.
  function renderState() {
    var p = playing();
    btn.setAttribute("aria-pressed", p ? "true" : "false");
    ico.innerHTML = p ? PAUSE : PLAY;
    label.textContent = !started ? "Listen to this article" : p ? "Pause" : audio.ended ? "Listen again" : "Resume";
    fbtn.innerHTML = p ? PAUSE : PLAY;
    fbtn.setAttribute("aria-label", p ? "Pause" : "Play");
    var showFollow = started && p && !follow && !!starts;
    follows.forEach(function (f) { f.hidden = !showFollow; });
    seeks[0].hidden = !started;
    fl.hidden = inView || !started;
    document.body.classList.toggle("listening", started && !!starts);
    tick();
  }

  var lastShown = "";
  function tick() {
    var t = audio.currentTime, d = total();
    var txt = started ? fmt(t) + " / " + fmt(d) : fmt(d);
    if (txt !== lastShown) {
      lastShown = txt;
      timeEl.textContent = txt;
      ftime.textContent = started ? txt : fmt(d);
    }
    if (!dragging && d) seeks.forEach(function (s) { s.value = Math.round((t / d) * 1000); });
    if (starts) {
      var i = indexAt(t);
      if (i !== cur) setCur(i);
    }
  }

  function loop() {
    try { tick(); } catch (e) {}
    raf = playing() ? requestAnimationFrame(loop) : 0;
  }

  // ── Words ──────────────────────────────────────────────────────────────
  function indexAt(t) {
    var lo = 0, hi = starts.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function setCur(i) {
    if (cur >= 0 && spans[cur]) spans[cur].forEach(function (s) { s.classList.remove("vw-on"); });
    cur = i;
    if (i >= 0 && spans[i]) {
      spans[i].forEach(function (s) { s.classList.add("vw-on"); });
      keepInView(spans[i][0]);
    }
  }

  function keepInView(el, force) {
    if (!el || !follow || (!playing() && !force)) return;
    var r = el.getBoundingClientRect(), vh = innerHeight;
    if (!force && r.top >= vh * 0.2 && r.bottom <= vh * 0.62) return;
    var jump = Math.abs(r.top - vh * 0.36);
    var smooth = !reduce && jump < vh * 1.5;
    var target = scrollY + r.top - vh * 0.36;
    autoY = Math.max(0, Math.min(target, document.documentElement.scrollHeight - vh));
    autoUntil = Date.now() + (smooth ? 1500 : 600);
    scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
  }

  function norm(s) {
    return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").toLowerCase();
  }

  // Splits the readable text into words, the same way the timings were made.
  // Footnote numbers are skipped, and a word that spans elements ("44<sup>th</sup>")
  // stays one word.
  function plan() {
    var words = [];
    [].filter.call(body.querySelectorAll("p, h2, h3, li"), function (b) {
      return !b.closest("figure, .footnotes") && !(b.parentElement && b.parentElement.closest("p, li, h2, h3"));
    }).forEach(function (b) {
      var nodes = [], tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null), n;
      while ((n = tw.nextNode())) {
        if (!(n.parentElement && n.parentElement.closest("sup[data-fn]"))) nodes.push(n);
      }
      var flat = "", offs = [];
      nodes.forEach(function (x) { offs.push(flat.length); flat += x.nodeValue; });
      var re = /\S+/g, m;
      while ((m = re.exec(flat))) {
        var a = m.index, e = a + m[0].length, segs = [];
        for (var i = 0; i < nodes.length; i++) {
          var ns = offs[i], ne = ns + nodes[i].nodeValue.length;
          if (ne <= a || ns >= e) continue;
          segs.push({ node: nodes[i], from: Math.max(a, ns) - ns, to: Math.min(e, ne) - ns });
        }
        words.push({ text: m[0], segs: segs });
      }
    });
    return words;
  }

  function wrap(words) {
    var byNode = new Map();
    words.forEach(function (w, i) {
      w.segs.forEach(function (s) {
        s.i = i;
        if (!byNode.has(s.node)) byNode.set(s.node, []);
        byNode.get(s.node).push(s);
      });
    });
    byNode.forEach(function (list) {
      list.sort(function (a, b) { return b.from - a.from; });   // last first, so offsets stay valid
      list.forEach(function (s) {
        var r = document.createRange();
        r.setStart(s.node, s.from);
        r.setEnd(s.node, s.to);
        var sp = document.createElement("span");
        sp.className = "vw";
        sp.dataset.w = s.i;
        r.surroundContents(sp);
        (spans[s.i] = spans[s.i] || []).push(sp);
      });
    });
  }

  function attach(timings) {
    var words = plan();
    var same = words.length === timings.length;
    var bad = 0;
    if (same) words.forEach(function (w, i) { if (norm(w.text) !== norm(timings[i][0])) bad++; });
    if (!same || bad > words.length * 0.02) {
      console.warn("Voiceover timings don't match the page text; highlighting is off.");
      return;
    }
    wrap(words);
    starts = timings.map(function (t) { return t[1]; });
    renderState();
  }

  function ensureWords() {
    if (starts || loading || !cfg.words) return;
    loading = true;
    fetch(cfg.words)
      .then(function (r) { return r.json(); })
      .then(attach)
      .catch(function () {})
      .then(function () { loading = false; });
  }

  // ── Playback ───────────────────────────────────────────────────────────
  function play() {
    if (audio.ended) audio.currentTime = 0;
    started = true;
    follow = true;
    ensureWords();
    var p = audio.play();
    if (p && p.catch) p.catch(function () { renderState(); });
  }
  function toggle() { playing() ? audio.pause() : play(); }

  function seekTo(t, andPlay) {
    audio.currentTime = Math.max(0, Math.min(t, total() || t));
    follow = true;
    if (andPlay) play();
    else { tick(); if (starts && cur >= 0) keepInView(spans[cur] && spans[cur][0], true); renderState(); }
  }

  btn.addEventListener("click", toggle);
  fbtn.addEventListener("click", toggle);
  follows.forEach(function (f) {
    f.addEventListener("click", function () {
      follow = true;
      renderState();
      if (cur >= 0 && spans[cur]) keepInView(spans[cur][0], true);
    });
  });
  seeks.forEach(function (s) {
    s.addEventListener("pointerdown", function () { dragging = true; });
    s.addEventListener("input", function () {
      var d = total();
      if (!d) return;
      started = true;
      audio.currentTime = (s.value / 1000) * d;
      seeks.forEach(function (o) { if (o !== s) o.value = s.value; });
      tick();
    });
    s.addEventListener("change", function () {
      dragging = false;
      follow = true;
      if (cur >= 0 && spans[cur]) keepInView(spans[cur][0], true);
      renderState();
    });
  });

  // Click a word to jump there.
  body.addEventListener("click", function (e) {
    var w = e.target.closest && e.target.closest(".vw");
    if (!w || !starts || e.target.closest("a")) return;
    seekTo(starts[+w.dataset.w], true);
  });

  audio.addEventListener("play", function () { if (!raf) raf = requestAnimationFrame(loop); renderState(); });
  audio.addEventListener("pause", renderState);
  audio.addEventListener("ended", function () { setCur(-1); renderState(); });
  audio.addEventListener("loadedmetadata", renderState);
  audio.addEventListener("seeked", function () { if (!playing()) tick(); });
  audio.addEventListener("error", function () { box.hidden = true; fl.hidden = true; });

  // Scrolling by hand pauses the auto-scroll until "Follow along" is pressed.
  function userScrolled() {
    if (started && playing() && follow) { follow = false; renderState(); }
  }
  addEventListener("wheel", userScrolled, { passive: true });
  addEventListener("touchmove", userScrolled, { passive: true });
  // Our own scrolling ends at autoY; anything else after it is the reader.
  addEventListener("scroll", function () {
    if (Date.now() > autoUntil && Math.abs(scrollY - autoY) > 6) userScrolled();
  }, { passive: true });

  // Keep a small player on screen once the main button has scrolled away.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      fl.hidden = inView || !started;
    }).observe(box);
  }

  renderState();
})();
