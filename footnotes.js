// Footnote popovers: hover, focus or tap an in-text <sup>N</sup> to read the
// matching .footnote in place. Without JS the footnotes stay listed at the end.
(function () {
  var notes = {};
  document.querySelectorAll(".footnotes .footnote").forEach(function (p) {
    var n = p.querySelector("sup");
    if (n) notes[n.textContent.trim()] = p;
  });

  var refs = [].filter.call(document.querySelectorAll("sup[data-fn]"), function (s) {
    return !s.closest(".footnotes") && notes[s.textContent.trim()];
  });
  if (!refs.length) return;

  var pop = document.createElement("div");
  pop.className = "fn-pop";
  pop.setAttribute("role", "tooltip");
  pop.id = "fn-pop";
  pop.hidden = true;
  document.body.appendChild(pop);

  var current = null, timer;

  function show(sup) {
    clearTimeout(timer);
    var src = notes[sup.textContent.trim()].cloneNode(true);
    var num = src.querySelector("sup");
    if (num) num.remove();
    pop.innerHTML = src.innerHTML.trim();
    pop.hidden = false;
    current = sup;
    sup.setAttribute("aria-describedby", "fn-pop");

    var r = sup.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
    var above = r.top - h - 8 >= 8;
    pop.style.left = left + scrollX + "px";
    pop.style.top = (above ? r.top - h - 8 : r.bottom + 8) + scrollY + "px";
  }

  function hide() {
    if (current) current.removeAttribute("aria-describedby");
    current = null;
    pop.hidden = true;
  }

  function later() { clearTimeout(timer); timer = setTimeout(hide, 120); }

  refs.forEach(function (sup) {
    sup.classList.add("fn-ref");
    sup.tabIndex = 0;
    sup.addEventListener("mouseenter", function () { show(sup); });
    sup.addEventListener("mouseleave", later);
    sup.addEventListener("focus", function () { show(sup); });
    sup.addEventListener("blur", later);
    sup.addEventListener("click", function (e) {
      e.stopPropagation();
      current === sup ? hide() : show(sup);
    });
  });

  pop.addEventListener("mouseenter", function () { clearTimeout(timer); });
  pop.addEventListener("mouseleave", later);
  document.addEventListener("click", function (e) { if (!pop.contains(e.target)) hide(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  addEventListener("scroll", hide, { passive: true });
  addEventListener("resize", hide);
})();
