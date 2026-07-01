// Pannello Pinterest in Canva

(function () {
  const ID_PANNELLO = "p4c-pannello";
  const ID_TOGGLE = "p4c-toggle";

  function creaToggle() {
    const btn = document.createElement("button");
    btn.id = ID_TOGGLE;
    btn.textContent = "📌";
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
        <span>Your Pins</span>
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
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    } catch (err) {
      btn.textContent = "Error";
      console.error("Error copying :(", err);
      setTimeout(() => (btn.textContent = "Copy"), 1500);
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
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Error toBlob"))), "image/png");
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  async function rimuoviSfondoPin(pin, divElemento) {
    const { chiaveRemoveBg } = await chrome.storage.local.get("chiaveRemoveBg");
    if (!chiaveRemoveBg) {
      alert("Enter your remove.bg API Key in the popup");
      return;
    }

    const elaborazione = document.createElement("div");
    elaborazione.className = "p4c-elaborazione";
    elaborazione.textContent = "Removing background...";
    divElemento.appendChild(elaborazione);

    try {
      const risposta = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ azione: "rimuoviBg", imageUrl: pin.src, apiKey: chiaveRemoveBg }, resolve);
      });

      if (risposta.ok) {
        const { savedPins } = await chrome.storage.local.get("savedPins");
        const pinsAggiornati = savedPins.map(p => {
          if (p.src === pin.src) {
            return { ...p, originalSrc: p.src, src: risposta.dataUrl, noBg: true };
          }
          return p;
        });
        await chrome.storage.local.set({ savedPins: pinsAggiornati });
      } else {
        alert("Error: " + risposta.errore);
      }
    } catch (err) {
      console.error(err);
    } finally {
      elaborazione.remove();
    }
  }

  function renderizzaLista(pannello, pins) {
    const lista = pannello.querySelector(".p4c-lista");
    lista.innerHTML = "";
    if (!pins.length) {
      lista.innerHTML = `<div class="p4c-vuoto">Nothing has been saved yet!</div>`;
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
      btnCopia.textContent = "Copy";
      btnCopia.addEventListener("click", () => copiaImmagine(pin.src, btnCopia));

      elemento.appendChild(img);
      elemento.appendChild(btnCopia);

      if (!pin.noBg) {
        const btnBg = document.createElement("button");
        btnBg.className = "p4c-rimuovi-bg";
        btnBg.textContent = "✂️ BG";
        btnBg.title = "Remove background";
        btnBg.addEventListener("click", () => rimuoviSfondoPin(pin, elemento));
        elemento.appendChild(btnBg);
      }

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
      if (area === "local" && (cambiamenti.savedPins || cambiamenti.chiaveRemoveBg)) {
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
