// Light/dark toggle and a link to Photos in the top-right corner of article
// pages, the same controls as the homepage. Injected here so every article
// gets them from one place.
(function () {
  if (!document.querySelector(".article-meta")) return;
  var box = document.createElement("div");
  box.innerHTML = "<div class=\"corner\"> <button class=\"theme\" type=\"button\" aria-label=\"Switch to dark mode\" title=\"Dark mode\"> <svg class=\"moon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4.77 14.35A7.6 7.6 0 1 0 16.46 5.85A7.37 7.37 0 0 1 4.77 14.35Z\"/><path d=\"M16.46 5.85A7.6 7.6 0 0 0 4.77 14.35\" stroke-width=\"1.3\" stroke-dasharray=\"0 2.3\"/><path d=\"M20.92 10.21L22.29 9.93M20.95 13.64L21.74 13.79M19.7 16.85L20.38 17.27M17.36 19.36L18.18 20.49M14.24 20.82L14.44 21.59M10.81 21.02L10.71 21.82M7.55 19.94L6.87 21.16\" stroke-width=\"1.1\"/></svg> <svg class=\"sun\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4.2\"/><path d=\"M13.94 12.8L11.2 13.94L10.06 11.2L12.8 10.06ZM12.8 13.94L10.06 12.8L11.2 10.06L13.94 11.2Z\" stroke-width=\".8\"/><path d=\"M12 6.4L12 1.4M14.14 6.83L15.21 4.24M15.96 8.04L19.5 4.5M17.17 9.86L19.76 8.79M17.6 12L22.6 12M17.17 14.14L19.76 15.21M15.96 15.96L19.5 19.5M14.14 17.17L15.21 19.76M12 17.6L12 22.6M9.86 17.17L8.79 19.76M8.04 15.96L4.5 19.5M6.83 14.14L4.24 15.21M6.4 12L1.4 12M6.83 9.86L4.24 8.79M8.04 8.04L4.5 4.5M9.86 6.83L8.79 4.24\" stroke-width=\"1.2\"/></svg> </button> <a class=\"photos\" href=\"/photos\" aria-label=\"Photos\" title=\"Photos\"> <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4.5 21.5V11C4.5 7 8.6 5.1 12 2.5C15.4 5.1 19.5 7 19.5 11V21.5Z\"/><path d=\"M4.5 18.5l4.2-4.3 3.1 3.1 2.2-2.2 5.5 5.4\" stroke-width=\"1.4\"/><circle cx=\"14.6\" cy=\"10.6\" r=\"1.5\" stroke-width=\"1.4\"/></svg> </a> </div>";
  var corner = box.firstChild;
  document.body.appendChild(corner);

  var root = document.documentElement;
  var btn = corner.querySelector(".theme");
  var meta = document.querySelector('meta[name="theme-color"]');

  function apply(t, save) {
    root.dataset.theme = t;
    var dark = t === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = dark ? "Light mode" : "Dark mode";
    if (meta) meta.content = dark ? "#151412" : "#f6f2e6";
    if (save) try { localStorage.setItem("theme", t); } catch (e) {}
  }

  apply(root.dataset.theme === "dark" ? "dark" : "light");
  btn.addEventListener("click", function () {
    apply(root.dataset.theme === "dark" ? "light" : "dark", true);
  });
})();
