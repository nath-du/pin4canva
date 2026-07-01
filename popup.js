// Logica popup

const tabCerca = document.getElementById("tabCerca");
const tabSalvati = document.getElementById("tabSalvati");
const vistaCerca = document.getElementById("vistaCerca");
const vistaSalvati = document.getElementById("vistaSalvati");
const formCerca = document.getElementById("formCerca");
const inputCerca = document.getElementById("inputCerca");
const statoCerca = document.getElementById("statoCerca");
const risultatiCerca = document.getElementById("risultatiCerca");
const risultatiSalvati = document.getElementById("risultatiSalvati");
const conteggioSalvatiEl = document.getElementById("conteggioSalvati");
const autoRimuoviBgToggle = document.getElementById("autoRimuoviBg");
const chiaveRemoveBgInput = document.getElementById("chiaveRemoveBg");

function cambiaTab(nome) {
  const eCerca = nome === "cerca";
  tabCerca.classList.toggle("active", eCerca);
  tabSalvati.classList.toggle("active", !eCerca);
  vistaCerca.classList.toggle("nascosto", !eCerca);
  vistaSalvati.classList.toggle("nascosto", eCerca);
  if (!eCerca) renderizzaSalvati();
}
tabCerca.addEventListener("click", () => cambiaTab("cerca"));
tabSalvati.addEventListener("click", () => cambiaTab("salvati"));

async function ottieniSalvati() {
  const { savedPins } = await chrome.storage.local.get("savedPins");
  return savedPins || [];
}
async function salvaLista(lista) {
  await chrome.storage.local.set({ savedPins: lista });
  conteggioSalvatiEl.textContent = lista.length;
}

async function aggiungiPin(pin) {
  const lista = await ottieniSalvati();
  if (lista.some((p) => p.src === pin.src)) return false;
  lista.unshift(pin);
  await salvaLista(lista);
  return true;
}
async function rimuoviPin(src) {
  const lista = await ottieniSalvati();
  await salvaLista(lista.filter((p) => p.src !== src));
}

async function gestisciAggiuntaPin(pin, cardDiv) {
  const btn = cardDiv.querySelector("button");
  const apiKey = chiaveRemoveBgInput.value.trim();
  const autoRimuovi = autoRimuoviBgToggle.checked;

  let pinDaSalvare = { ...pin };

  if (autoRimuovi && apiKey) {
    const overlay = document.createElement("div");
    overlay.className = "overlay-elaborazione";
    overlay.textContent = "Rimuovo sfondo...";
    cardDiv.appendChild(overlay);
    
    try {
      const risposta = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ azione: "rimuoviBg", imageUrl: pin.src, apiKey }, resolve);
      });

      if (risposta.ok) {
        pinDaSalvare.originalSrc = pin.src;
        pinDaSalvare.src = risposta.dataUrl;
        pinDaSalvare.noBg = true;
      } else {
        alert("Errore rimozione: " + risposta.errore);
      }
    } catch (err) {
      console.error(err);
    } finally {
      overlay.remove();
    }
  }

  const aggiunto = await aggiungiPin(pinDaSalvare);
  btn.textContent = aggiunto ? "Aggiunto" : "È già salvato!";
  btn.classList.add("aggiunto");
}

function renderizzaRisultati(pins) {
  risultatiCerca.innerHTML = "";
  pins.forEach((pin) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${pin.src}" loading="lazy" alt="" /><button>+ Salva</button>`;
    const btn = div.querySelector("button");
    btn.addEventListener("click", () => gestisciAggiuntaPin(pin, div));
    risultatiCerca.appendChild(div);
  });
}

async function renderizzaSalvati() {
  const lista = await ottieniSalvati();
  conteggioSalvatiEl.textContent = lista.length;
  risultatiSalvati.innerHTML = "";
  lista.forEach((pin) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<img src="${pin.src}" loading="lazy" alt="" /><button class="rimuovi">Rimuovi</button>`;
    div.querySelector("button").addEventListener("click", async () => {
      await rimuoviPin(pin.src);
      renderizzaSalvati();
    });
    risultatiSalvati.appendChild(div);
  });
}

formCerca.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = inputCerca.value.trim();
  if (!query) return;
  statoCerca.textContent = "Ricerca Pinterest...";
  risultatiCerca.innerHTML = "";
  chrome.runtime.sendMessage({ azione: "cercaSuPinterest", query }, (risposta) => {
    if (chrome.runtime.lastError) {
      statoCerca.textContent = "Errore: " + chrome.runtime.lastError.message;
      return;
    }
    if (!risposta?.ok) {
      statoCerca.textContent = "Errore: " + (risposta?.errore || "sconosciuto");
      return;
    }
    if (!risposta.risultati.length) {
      statoCerca.textContent = "Nessun risultato.";
      return;
    }
    statoCerca.textContent = `${risposta.risultati.length} immagini trovate`;
    renderizzaRisultati(risposta.risultati);
  });
});

// Salva impostazioni
autoRimuoviBgToggle.addEventListener("change", () => {
  chrome.storage.local.set({ autoRimuoviBg: autoRimuoviBgToggle.checked });
});
chiaveRemoveBgInput.addEventListener("input", () => {
  chrome.storage.local.set({ chiaveRemoveBg: chiaveRemoveBgInput.value });
});

(async function inizializza() {
  const lista = await ottieniSalvati();
  conteggioSalvatiEl.textContent = lista.length;
  const impostazioni = await chrome.storage.local.get(["autoRimuoviBg", "chiaveRemoveBg"]);
  autoRimuoviBgToggle.checked = !!impostazioni.autoRimuoviBg;
  chiaveRemoveBgInput.value = impostazioni.chiaveRemoveBg || "";
})();
