// Gestione tab e viste
const tabCerca = document.querySelector('[data-tab="search"]');
const tabSalvati = document.querySelector('[data-tab="collection"]');
const vistaCerca = document.getElementById('searchView');
const vistaSalvati = document.getElementById('collectionView');
const inputCerca = document.getElementById('searchInput');
const statoCerca = document.getElementById('status');
const risultatiCerca = document.getElementById('resultsGrid');
const risultatiSalvati = document.getElementById('collectionGrid');
const badge = document.getElementById('collectionBadge');
const autoToggle = document.getElementById('autoRemoveBg');
const servizioBg = document.getElementById('servizioBg');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const settingsClose = document.getElementById('settingsClose');
const settingsCancel = document.getElementById('settingsCancel');
const settingsSave = document.getElementById('settingsSave');
const searchBtn = document.getElementById('searchBtn');

// Campi chiavi per servizio
const keyAlphelo = document.getElementById('keyAlphelo');
const keyRemovebg = document.getElementById('keyRemovebg');
const keyClipdrop = document.getElementById('keyClipdrop');
const keyPhotoroom = document.getElementById('keyPhotoroom');

const campiChiavi = {
  alphelo: keyAlphelo,
  removebg: keyRemovebg,
  clipdrop: keyClipdrop,
  photoroom: keyPhotoroom,
};

// Cambia scheda
function cambiaTab(nome) {
  const isCerca = nome === 'search';
  tabCerca.classList.toggle('active', isCerca);
  tabCerca.setAttribute('aria-selected', isCerca);
  tabSalvati.classList.toggle('active', !isCerca);
  tabSalvati.setAttribute('aria-selected', !isCerca);
  vistaCerca.classList.toggle('hidden', !isCerca);
  vistaSalvati.classList.toggle('hidden', isCerca);
  if (!isCerca) renderizzaSalvati();
}

tabCerca.addEventListener('click', () => cambiaTab('search'));
tabSalvati.addEventListener('click', () => cambiaTab('collection'));

// Storage
async function ottieniSalvati() {
  const { savedPins } = await chrome.storage.local.get('savedPins');
  return savedPins || [];
}

async function salvaLista(lista) {
  await chrome.storage.local.set({ savedPins: lista });
  badge.textContent = lista.length;
}

// Aggiungi / Rimuovi pin
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

// Rimozione sfondo via background
async function rimuoviSfondo(imageUrl, apiKey, servizio) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { azione: 'rimuoviBg', imageUrl, apiKey, servizio },
      resolve
    );
  });
}

// # Gestione Aggiunta Pin
async function gestisciAggiuntaPin(pin, cardDiv) {
  const btn = cardDiv.querySelector('.card-btn');
  const servizio = servizioBg.value;
  const autoRimuovi = autoToggle.checked;

  const { chiaviApi } = await chrome.storage.local.get('chiaviApi');
  const apiKey = chiaviApi?.[servizio] || '';

  if (autoRimuovi && !apiKey) {
    alert(`Inserisci la API key per ${servizio} nelle impostazioni`);
    return;
  }

  let pinDaSalvare = { ...pin };

  if (autoRimuovi && apiKey) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-busy';
    overlay.innerHTML = `<span class="material-icons">refresh</span> Rimozione sfondo…`;
    cardDiv.appendChild(overlay);
    btn.disabled = true;

    try {
      const risposta = await rimuoviSfondo(pin.src, apiKey, servizio);
      if (risposta.ok) {
        pinDaSalvare.originalSrc = pin.src;
        pinDaSalvare.src = risposta.dataUrl;
        pinDaSalvare.noBg = true;
        pinDaSalvare.servizioBg = servizio;
      } else {
        alert('Errore rimozione sfondo: ' + (risposta.errore || 'sconosciuto'));
      }
    } catch (err) {
      console.error(err);
      alert('Errore: ' + err.message);
    } finally {
      overlay.remove();
      btn.disabled = false;
    }
  }

  const aggiunto = await aggiungiPin(pinDaSalvare);
  if (aggiunto) {
    btn.innerHTML = '<span class="material-icons">check</span> Aggiunto';
    btn.classList.add('added');
  } else {
    btn.innerHTML = '<span class="material-icons">check</span> Già salvato';
    btn.classList.add('added');
  }
}

// # Render risultati ricerca
function renderizzaRisultati(pins) {
  risultatiCerca.innerHTML = '';
  if (!pins.length) {
    risultatiCerca.innerHTML =
      `<div class="empty-state"><span class="material-icons">search_off</span>Nessun risultato trovato</div>`;
    return;
  }
  pins.forEach((pin) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${pin.src}" loading="lazy" alt="" />
      <button class="card-btn"><span class="material-icons">add</span> Salva</button>
    `;
    const btn = div.querySelector('.card-btn');
    btn.addEventListener('click', () => gestisciAggiuntaPin(pin, div));
    risultatiCerca.appendChild(div);
  });
}

// # Render collezione salvati
async function renderizzaSalvati() {
  const lista = await ottieniSalvati();
  badge.textContent = lista.length;
  risultatiSalvati.innerHTML = '';
  if (!lista.length) {
    risultatiSalvati.innerHTML =
      `<div class="empty-state"><span class="material-icons">inbox</span>Nessun pin salvato</div>`;
    return;
  }
  lista.forEach((pin) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${pin.src}" loading="lazy" alt="" />
      <button class="card-btn remove"><span class="material-icons">delete</span> Rimuovi</button>
    `;
    div.querySelector('.card-btn').addEventListener('click', async () => {
      await rimuoviPin(pin.src);
      renderizzaSalvati();
    });
    risultatiSalvati.appendChild(div);
  });
}

// # Ricerca Pinterest
async function eseguiRicerca(query) {
  if (!query.trim()) return;
  statoCerca.textContent = 'Ricerca in corso…';
  risultatiCerca.innerHTML = '';

  try {
    const risposta = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ azione: 'cercaSuPinterest', query }, resolve);
    });

    if (chrome.runtime.lastError) {
      statoCerca.textContent = '❌ ' + chrome.runtime.lastError.message;
      return;
    }
    if (!risposta?.ok) {
      statoCerca.textContent = '❌ ' + (risposta?.errore || 'Errore sconosciuto');
      return;
    }
    if (!risposta.risultati.length) {
      statoCerca.textContent = 'Nessun risultato.';
      renderizzaRisultati([]);
      return;
    }
    renderizzaRisultati(risposta.risultati);
  } catch (err) {
    statoCerca.textContent = '❌ ' + err.message;
  }
}

// Eventi ricerca
searchBtn.addEventListener('click', () => eseguiRicerca(inputCerca.value));
inputCerca.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') eseguiRicerca(inputCerca.value);
});

// # Dialog impostazioni
function apriSettings() {
  settingsDialog.classList.remove('hidden');
  campiChiavi[servizioBg.value]?.focus();
}

function chiudiSettings() {
  settingsDialog.classList.add('hidden');
}

settingsBtn.addEventListener('click', apriSettings);
settingsClose.addEventListener('click', chiudiSettings);
settingsCancel.addEventListener('click', chiudiSettings);
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) chiudiSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') chiudiSettings();
});

settingsSave.addEventListener('click', async () => {
  const chiaviApi = {};
  for (const [servizio, input] of Object.entries(campiChiavi)) {
    chiaviApi[servizio] = input.value.trim();
  }
  await chrome.storage.local.set({ chiaviApi });
  chiudiSettings();

  const orig = settingsSave.textContent;
  settingsSave.textContent = '✅ Salvato';
  setTimeout(() => {
    settingsSave.textContent = orig;
  }, 1200);
});

// # Inizializzazione
(async function init() {
  const impostazioni = await chrome.storage.local.get([
    'autoRimuoviBg',
    'chiaviApi',
    'servizioBg',
    'chiaveRemoveBg',
  ]);

  autoToggle.checked = !!impostazioni.autoRimuoviBg;
  servizioBg.value = impostazioni.servizioBg || 'alphelo';
  servizioBg.disabled = !autoToggle.checked;

  let chiavi = impostazioni.chiaviApi || {};

  // Migrazione vecchia chiave
  if (impostazioni.chiaveRemoveBg && !chiavi.removebg) {
    chiavi.removebg = impostazioni.chiaveRemoveBg;
    await chrome.storage.local.set({ chiaviApi: chiavi });
    await chrome.storage.local.remove('chiaveRemoveBg');
  }

  for (const [servizio, input] of Object.entries(campiChiavi)) {
    if (input) input.value = chiavi[servizio] || '';
  }

  autoToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoRimuoviBg: autoToggle.checked });
    servizioBg.disabled = !autoToggle.checked;
  });

  servizioBg.addEventListener('change', () => {
    chrome.storage.local.set({ servizioBg: servizioBg.value });
  });

  const lista = await ottieniSalvati();
  badge.textContent = lista.length;
  renderizzaSalvati();

  chrome.storage.onChanged.addListener((cambiamenti, area) => {
    if (area === 'local' && cambiamenti.savedPins) {
      renderizzaSalvati();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  if (q) {
    inputCerca.value = q;
    eseguiRicerca(q);
  }
})();