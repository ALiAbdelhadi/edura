(function () {
  try {
    var m = localStorage.getItem("edura-theme") || "system";
    var d =
      m === "dark" ||
      (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    var e = document.documentElement;
    e.setAttribute("data-theme", d ? "dark" : "light");
    e.style.colorScheme = d ? "dark" : "light";
  } catch (_) {}
})();
