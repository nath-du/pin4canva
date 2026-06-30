// Forza visibilità pagina Pinterest
(function () {
  try {
    // TODO: verificare compatibilità browser datati
    Object.defineProperty(document, "hidden", {
      get: () => false,
      configurable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      get: () => "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  } catch (e) {
    // Ignora errori ridifinizione
  }
})();
