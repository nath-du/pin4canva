// Background service worker

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
function estraiPinInPagina(limite) {
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
        func: estraiPinInPagina,
        args: [40],
      });
      risultati = iniezione?.[0]?.result || [];
    }
    return risultati;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Gestione messaggi
chrome.runtime.onMessage.addListener((messaggio, mittente, inviaRisposta) => {
  if (messaggio?.azione === "cercaSuPinterest") {
    cercaSuPinterest(messaggio.query)
      .then((risultati) => inviaRisposta({ ok: true, risultati }))
      .catch((err) => inviaRisposta({ ok: false, errore: err?.message || String(err) }));
    return true;
  }
});
