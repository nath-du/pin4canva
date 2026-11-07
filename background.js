function attendi(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attendiCaricamentoTab(tabId) {
  return new Promise((resolve) => {
    function listener(idTabAggiornata, infoCambio) {
      if (idTabAggiornata === tabId && infoCambio.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Estrattore immagini da Pinterest
function estrattorePin(limite) {
  function ottieniSorgenteMigliore(img) {
    const candidati = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
    ].filter(Boolean);

    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const parti = srcset.split(",").map((s) => s.trim().split(" ")[0]).filter(Boolean);
      if (parti.length) candidati.push(parti[parti.length - 1]);
    }

    return candidati.find((s) => s && s.includes("pinimg.com")) || null;
  }

  const risultati = [];
  const visti = new Set();
  const imgs = Array.from(document.querySelectorAll("img"));

  for (const img of imgs) {
    let src = ottieniSorgenteMigliore(img);
    if (!src) continue;
    if (/\/avatars\//.test(src) || /\/\d{2,3}x\d{2,3}_RS\//.test(src)) continue;
    src = src.replace(/\/\d{2,4}x(?:\d{0,4})?\//, "/736x/");
    if (visti.has(src)) continue;
    visti.add(src);
    const link = img.closest("a");
    const pinUrl = link && link.href ? link.href : null;
    const titolo = img.alt || "";
    risultati.push({ src, pinUrl, titolo });
    if (risultati.length >= limite) break;
  }
  return risultati;
}

async function cercaSuPinterest(query) {
  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await attendiCaricamentoTab(tab.id);
    await attendi(2000);

    let risultati = [];
    for (let i = 0; i < 4 && risultati.length < 6; i++) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.scrollBy(0, 1500),
      });
      await attendi(1200);

      const iniezione = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: estrattorePin,
        args: [40],
      });
      risultati = iniezione?.[0]?.result || [];
    }
    return risultati;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// # Servizi Rimozione Sfondo
// Configurazione endpoint per ogni servizio
const SERVIZI_RIMOZIONE = {
  alphelo: {
    nome: "Alphelo",
    url: "https://api.alphelo.com/v1/remove",
    headerChiave: "X-Api-Key",
    campoImmagine: "image_url",
    usaUrl: true,
  },
  removebg: {
    nome: "Remove.bg",
    url: "https://api.remove.bg/v1.0/removebg",
    headerChiave: "X-Api-Key",
    campoImmagine: "image_url",
    usaUrl: true,
    parametriExtra: { size: "auto" },
  },
  clipdrop: {
    nome: "Clipdrop",
    url: "https://clipdrop-api.co/remove-background/v1",
    headerChiave: "x-api-key",
    campoImmagine: "image_file",
    usaUrl: false,
  },
  photoroom: {
    nome: "Photoroom",
    url: "https://sdk.photoroom.com/v1/segment",
    headerChiave: "x-api-key",
    campoImmagine: "image_file",
    usaUrl: false,
  },
};

// Scarica immagine come blob
async function scaricaImmagine(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download immagine fallito");
  return res.blob();
}

// Converte blob in data URL (compatibile service worker)
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  const parti = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    parti.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return `data:${blob.type};base64,${btoa(parti.join(""))}`;
}

// # Rimozione Sfondo
// Sceglie endpoint in base al servizio
async function rimuoviSfondo(imageUrl, apiKey, servizio) {
  if (!apiKey) throw new Error("API Key mancante");

  const cfg = SERVIZI_RIMOZIONE[servizio];
  if (!cfg) throw new Error("Servizio non valido: " + servizio);

  const formData = new FormData();

  if (cfg.usaUrl) {
    // Alphelo / Remove.bg accettano image_url
    formData.append(cfg.campoImmagine, imageUrl);
  } else {
    // Clipdrop / Photoroom richiedono file
    const blob = await scaricaImmagine(imageUrl);
    formData.append(cfg.campoImmagine, blob, "immagine.png");
  }

  // Parametri extra del servizio
  if (cfg.parametriExtra) {
    for (const [chiave, valore] of Object.entries(cfg.parametriExtra)) {
      formData.append(chiave, valore);
    }
  }

  const risposta = await fetch(cfg.url, {
    method: "POST",
    headers: { [cfg.headerChiave]: apiKey },
    body: formData,
  });

  if (!risposta.ok) {
    // Prova leggere errore strutturato
    let messaggio = "Errore rimozione sfondo";
    const clone = risposta.clone();
    try {
      const dati = await risposta.json();
      messaggio =
        dati?.errors?.[0]?.title ||
        dati?.error?.message ||
        dati?.message ||
        messaggio;
    } catch (e) {
      // Non JSON, prova testo
      try {
        const testo = await clone.text();
        if (testo && testo.length < 200) messaggio = testo;
      } catch (e2) {
        // Ignora
      }
    }
    throw new Error(messaggio);
  }

  const blobRisposta = await risposta.blob();
  return blobToDataUrl(blobRisposta);
}

// Gestione messaggi
chrome.runtime.onMessage.addListener((messaggio, mittente, inviaRisposta) => {
  if (messaggio?.azione === "cercaSuPinterest") {
    cercaSuPinterest(messaggio.query)
      .then((risultati) => inviaRisposta({ ok: true, risultati }))
      .catch((err) => inviaRisposta({ ok: false, errore: err?.message || String(err) }));
    return true;
  }

  if (messaggio?.azione === "rimuoviBg") {
    rimuoviSfondo(
      messaggio.imageUrl,
      messaggio.apiKey,
      messaggio.servizio || "alphelo"
    )
      .then((dataUrl) => inviaRisposta({ ok: true, dataUrl }))
      .catch((err) => inviaRisposta({ ok: false, errore: err?.message || String(err) }));
    return true;
  }
});