// Pannello Pinterest in Canva

(function () {
  const ID_PANNELLO = "p4c-pannello";
  const ID_TOGGLE = "p4c-toggle";

  function creaToggle() {
    const btn = document.createElement("button");
    btn.id = ID_TOGGLE;
    btn.title = "Apri Pin";
    btn.textContent = "📌​";
    btn.addEventListener("click", () => {
      const pannello = document.getElementById(ID_PANNELLO);
      pannello.classList.toggle("p4c-aperto");
    });
    document.body.appendChild(btn);
  }

  function creaPannello() {
    const pannello = document.createElement("div");
    pannello.id = ID_PANNELLO;
    pannello.innerHTML = `
      <div class="p4c-header">
        <span>I tuoi Pin</span>
        <button class="p4c-chiudi">x</button>
      </div>
      <div class="p4c-lista"></div>
    `;
    pannello.querySelector(".p4c-chiudi").addEventListener("click", () => {
      pannello.classList.remove("p4c-aperto");
    });
    document.body.appendChild(pannello);
    return pannello;
  }

  async function copiaImmagine(src, btn) {
    try {
      btn.textContent = "...";
      const res = await fetch(src);
      const blob = await res.blob();
      const finalBlob = blob.type === "image/png" ? blob : await convertiPng(blob);
      await navigator.clipboard.write([
        new ClipboardItem({ [finalBlob.type]: finalBlob }),
      ]);
      btn.textContent = "Copiato ✓";
      setTimeout(() => (btn.textContent = "Copia"), 1500);
    } catch (err) {
      btn.textContent = "Errore";
      console.error("Errore copia :(", err);
      setTimeout(() => (btn.textContent = "Copia"), 1500);
    }
  }

  function convertiPng(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Errore toBlob"))), "image/png");
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  function renderizzaLista(pannello, pins) {
    const lista = pannello.querySelector(".p4c-lista");
    lista.innerHTML = "";
    if (!pins.length) {
      lista.innerHTML = `<div class="p4c-vuoto">Non c'è ancora nulla di salvato!</div>`;
      return;
    }
    pins.forEach((pin) => {
      const elemento = document.createElement("div");
      elemento.className = "p4c-elemento";

      const img = document.createElement("img");
      img.src = pin.src;
      img.draggable = true;
      img.crossOrigin = "anonymous";

      img.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/uri-list", pin.src);
        e.dataTransfer.setData("text/plain", pin.src);
        e.dataTransfer.setData("text/html", `<img src="${pin.src}">`);
        e.dataTransfer.setData("DownloadURL", `image/png:pin.png:${pin.src}`);
      });

      const btnCopia = document.createElement("button");
      btnCopia.className = "p4c-copia";
      btnCopia.textContent = "Copia";
      btnCopia.addEventListener("click", () => copiaImmagine(pin.src, btnCopia));

      elemento.appendChild(img);
      elemento.appendChild(btnCopia);

      lista.appendChild(elemento);
    });
  }

  async function caricaERenderizza(pannello) {
    const { savedPins } = await chrome.storage.local.get("savedPins");
    renderizzaLista(pannello, savedPins || []);
  }

  function inizializza() {
    creaToggle();
    const pannello = creaPannello();
    caricaERenderizza(pannello);
    chrome.storage.onChanged.addListener((cambiamenti, area) => {
      if (area === "local" && cambiamenti.savedPins) {
        caricaERenderizza(pannello);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
