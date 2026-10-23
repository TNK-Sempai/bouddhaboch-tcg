/* BouddhaBoch-TCG - application du coffre
   Toutes les données passent par l'API Apps Script (config.js).
   Sans API configurée, le site tourne en mode démo avec des données d'exemple. */
(function () {
  'use strict';

  /* ================================================================
     Réglages et outils
     ================================================================ */
  var CFG = window.COFFRE_CONFIG || {};
  var DEMO = !CFG.API_URL;
  var STALE_DAYS = 60;

  var FEE_KEYS = ['port', 'frais_service', 'grading_frais', 'grading_envoi', 'grading_retour', 'grading_douane', 'autre1_montant', 'autre2_montant'];
  var ARTICLE_KEYS = [
    'id', 'licence', 'type', 'nom', 'reference', 'variante', 'langue', 'etat', 'qte', 'prix_unitaire',
    'date_achat', 'achete_ou', 'port', 'frais_service',
    'grading_societe', 'grading_note', 'grading_certificat', 'grading_frais', 'grading_envoi', 'grading_retour', 'grading_douane',
    'autre1_libelle', 'autre1_montant', 'autre2_libelle', 'autre2_montant',
    'prix_actuel', 'date_releve', 'etb_extension', 'statut', 'date_envoi_grading', 'rangement', 'note', 'lien_cardmarket'
  ];
  var MONEY_KEYS = ['prix_unitaire', 'port', 'frais_service', 'grading_frais', 'grading_envoi', 'grading_retour', 'grading_douane',
    'autre1_montant', 'autre2_montant', 'prix_actuel', 'vente_prix', 'vente_commission', 'vente_port', 'vente_emballage',
    'acrylique_facture', 'acrylique_cout'];
  var CM_LANG = { '1': 'anglais', '2': 'français', '3': 'allemand' };
  var MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    if (typeof v === 'number') { return isFinite(v) ? v : 0; }
    var x = parseFloat(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(x) ? 0 : x;
  }
  function filled(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
  var NF = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function eur(n) { return NF.format(n) + ' €'; }
  function signed(n) { return (n >= 0 ? '+' : '-') + eur(Math.abs(n)); }
  function pct(diff, base) {
    var v = base ? diff / base * 100 : 0;
    return (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(1).replace('.', ',') + ' %';
  }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
  function pad(n) { return ('0' + n).slice(-2); }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return isoOf(new Date()); }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function frDate(s) { var d = parseISO(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function daysSince(s) {
    var d = parseISO(s);
    if (!d) { return Infinity; }
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - d) / 86400000);
  }
  function toInput(v) { return filled(v) ? String(v).replace('.', ',') : ''; }
  function sumBy(arr, fn) { return arr.reduce(function (a, x) { return a + fn(x); }, 0); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function store(kind, key, val) {
    try {
      var s = kind === 'session' ? window.sessionStorage : window.localStorage;
      if (val === undefined) { return s.getItem(key); }
      if (val === null) { s.removeItem(key); } else { s.setItem(key, val); }
    } catch (e) { return null; }
    return null;
  }

  /* ================================================================
     Calculs métier
     ================================================================ */
  function isGraded(a) { return filled(a.grading_societe) && a.grading_societe !== 'Aucune'; }
  function feesOf(a) {
    var graded = isGraded(a);
    return FEE_KEYS.reduce(function (t, k) {
      if (!graded && k.indexOf('grading_') === 0) { return t; }
      return t + num(a[k]);
    }, 0);
  }
  function qtyOf(a) { return Math.max(0, Math.round(num(a.qte))); }
  function costOf(a) { return num(a.prix_unitaire) * qtyOf(a) + feesOf(a); }
  function gridEntry(a) { return filled(a.etb_extension) ? S.prixMap[a.etb_extension] : null; }
  function unitPriceOf(a) { var g = gridEntry(a); return g ? num(g.prix) : num(a.prix_actuel); }
  function valueOf(a) { return unitPriceOf(a) * qtyOf(a); }
  function hasPrice(a) { return !!gridEntry(a) || filled(a.prix_actuel); }
  function isStale(a) { return !gridEntry(a) && (!filled(a.prix_actuel) || daysSince(a.date_releve) > STALE_DAYS); }
  function inStock(a) { return a.statut !== 'Vendu' && qtyOf(a) > 0; }
  function licKey(a) { return a.licence === 'One Piece' ? 'op' : 'pk'; }
  function typeKey(a) { return a.type === 'Scellé' ? 'sealed' : 'card'; }
  function statusKey(a) { return { 'À vendre': 'sale', 'Au grading': 'grading' }[a.statut] || 'collection'; }
  function detailOf(a) {
    var lang = { 'Français': 'FR', 'Anglais': 'EN', 'Japonais': 'JP' }[a.langue] || a.langue;
    return [a.reference, a.variante, lang, a.etat].filter(filled).join(' · ');
  }
  function kindOf(a) {
    if (a.type === 'Scellé') { return filled(a.etb_extension) ? 'Scellé · ETB' : 'Scellé'; }
    if (isGraded(a)) { return 'Carte gradée · ' + a.grading_societe + (filled(a.grading_note) ? ' ' + a.grading_note : ''); }
    return 'Carte';
  }
  function labelOf(a) { return a.nom + (qtyOf(a) > 1 ? ' ×' + qtyOf(a) : ''); }
  function saleCash(v) { return num(v.prix_vente) + num(v.acrylique_facture); }
  function saleFees(v) { return num(v.commission) + num(v.port) + num(v.emballage) + num(v.acrylique_cout); }
  function saleNet(v) { return saleCash(v) - saleFees(v) - num(v.prix_revient); }
  function saleFeesText(v) {
    var parts = [];
    if (num(v.commission)) { parts.push('commission ' + eur(num(v.commission))); }
    if (num(v.port)) { parts.push('port ' + eur(num(v.port))); }
    if (num(v.emballage)) { parts.push('emballage ' + eur(num(v.emballage))); }
    if (num(v.acrylique_cout)) { parts.push('acrylique ' + eur(num(v.acrylique_cout))); }
    return parts.length ? parts.join(' + ') : 'aucun frais';
  }

  /** Vente d'une partie ou de tout un lot (utilisé par le mode démo, même règle que le serveur). */
  function applySale(a, v) {
    var stock = qtyOf(a);
    var q = Math.min(stock, Math.max(1, Math.round(num(v.qte)) || 1));
    var row = {
      id: 'v' + Math.random().toString(36).slice(2, 9), article_id: a.id, nom: a.nom,
      detail: [a.reference, a.variante, a.langue].filter(filled).join(' · '), licence: a.licence, type: a.type, qte: q,
      prix_revient: round2(costOf(a) / stock * q), prix_vente: num(v.prix_vente), commission: num(v.commission),
      port: num(v.port), emballage: num(v.emballage), acrylique_facture: num(v.acrylique_facture), acrylique_cout: num(v.acrylique_cout),
      plateforme: v.plateforme || '', date_vente: v.date_vente || todayISO(), date_achat: a.date_achat
    };
    var ratio = (stock - q) / stock;
    FEE_KEYS.forEach(function (k) { if (filled(a[k])) { a[k] = round2(num(a[k]) * ratio); } });
    a.qte = stock - q;
    if (a.qte === 0) { a.statut = 'Vendu'; }
    return row;
  }

  /* ================================================================
     Données d'exemple (mode démo)
     ================================================================ */
  // Le mode démo démarre vide : rien n'est saisi à l'avance, rien n'est enregistré.
  var SAMPLE = { articles: [], ventes: [], prix: [], histo: [] };

  var Demo = {
    db: null,
    handle: function (action, p) {
      var db = Demo.db || (Demo.db = JSON.parse(JSON.stringify(SAMPLE)));
      var copy = function (x) { return JSON.parse(JSON.stringify(x)); };
      switch (action) {
        case 'login': return { ok: true, token: 'demo' };
        case 'load': return { ok: true, articles: copy(db.articles), ventes: copy(db.ventes), prix: copy(db.prix), histo: copy(db.histo) };
        case 'logout': return { ok: true };
        case 'saveArticle': {
          var a = p.article;
          var old = db.articles.filter(function (x) { return x.id === a.id; })[0];
          if (old) {
            if (filled(a.prix_actuel) && num(a.prix_actuel) !== num(old.prix_actuel)) { db.histo.push({ article_id: a.id, date: a.date_releve || todayISO(), prix: num(a.prix_actuel) }); }
            Object.keys(old).forEach(function (k) { delete old[k]; });
            Object.assign(old, a);
          } else {
            a.id = 'a' + Math.random().toString(36).slice(2, 9);
            db.articles.push(a);
            if (filled(a.prix_actuel)) { db.histo.push({ article_id: a.id, date: a.date_releve || todayISO(), prix: num(a.prix_actuel) }); }
          }
          return { ok: true, id: a.id };
        }
        case 'deleteArticle':
          db.articles = db.articles.filter(function (x) { return x.id !== p.id; });
          return { ok: true };
        case 'sellArticle': {
          var art = db.articles.filter(function (x) { return x.id === p.id; })[0];
          if (!art) { throw new Error('Article introuvable.'); }
          db.ventes.push(applySale(art, p.vente));
          return { ok: true };
        }
        case 'savePrix': {
          var row = db.prix.filter(function (x) { return x.extension === p.extension; })[0];
          if (row) { row.prix = num(p.prix); row.modifie_le = todayISO(); }
          else { db.prix.push({ extension: p.extension, prix: num(p.prix), modifie_le: todayISO() }); }
          return { ok: true };
        }
      }
      throw new Error('Action inconnue.');
    }
  };

  /* ================================================================
     État et API
     ================================================================ */
  var S = {
    token: null,
    data: { articles: [], ventes: [], prix: [], histo: [] },
    prixMap: {},
    loadedAt: null,
    f: { lic: 'all', type: 'all', status: 'all', q: '' },
    af: { lic: 'all', type: 'all', q: '' },
    period: '365',
    form: null,
    confirmDelete: false
  };

  function call(action, payload) {
    var body = Object.assign({ action: action, token: S.token }, payload || {});
    if (DEMO) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(Demo.handle(action, JSON.parse(JSON.stringify(body)))); } catch (e) { reject(e); }
        }, 120);
      });
    }
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // évite la requête préalable CORS, refusée par Apps Script
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) { throw new Error('Le serveur ne répond pas (' + res.status + ').'); }
      return res.json();
    }, function () {
      throw new Error('Impossible de joindre le serveur. Vérifie ta connexion.');
    }).then(function (out) {
      if (!out || !out.ok) {
        if (out && out.error === 'session') { lockApp('Ta session a expiré, entre ton code à nouveau.'); }
        throw new Error((out && out.message) || 'Erreur inconnue.');
      }
      return out;
    });
  }

  function reload() {
    return call('load').then(function (d) {
      S.data = { articles: d.articles || [], ventes: d.ventes || [], prix: d.prix || [], histo: d.histo || [] };
      S.prixMap = {};
      S.data.prix.forEach(function (p) { if (filled(p.extension)) { S.prixMap[p.extension] = p; } });
      S.loadedAt = new Date();
      renderNav();
    });
  }

  /* ================================================================
     Coquille : verrou, navigation, thème, messages
     ================================================================ */
  var V = $('#view');
  var NAV = [
    { id: 'stock', label: 'Stock', short: 'Stock' },
    { id: 'archives', label: 'Archives', short: 'Archives' },
    { id: 'bilan', label: 'Bilan', short: 'Bilan' },
    { id: 'prix', label: 'Prix des ETB', short: 'Prix' },
    { id: 'ajout', label: 'Ajouter un article', short: 'Ajouter' }
  ];
  var current = 'stock';

  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, isError ? 6000 : 3000);
  }

  function lockApp(msg) {
    if (S.token && !DEMO) { fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'logout', token: S.token }) }).catch(function () {}); }
    S.token = null;
    store('session', 'coffre-token', null);
    $('#shell').hidden = true;
    $('#lock').hidden = false;
    var err = $('#lock-error');
    err.textContent = msg || '';
    err.hidden = !msg;
    $('#code').value = '';
    $('#code').focus();
  }

  function openApp() {
    $('#lock').hidden = true;
    $('#shell').hidden = false;
    $('#demo-banner').hidden = !DEMO;
    V.innerHTML = '<p class="empty">Chargement du coffre...</p>';
    return reload().then(route);
  }

  function renderNav() {
    var stock = S.data.articles.filter(inStock);
    var counts = { stock: stock.length, archives: S.data.ventes.length, bilan: '', prix: S.data.prix.length, ajout: '' };
    var active = current === 'fiche' ? 'stock' : (current === 'modifier' || current === 'vendre' ? 'ajout' : current);
    var html = function (useShort) {
      return NAV.map(function (n) {
        return '<a class="nav-item" href="#' + n.id + '"' + (n.id === active ? ' aria-current="page"' : '') + '>' +
          esc(useShort ? n.short : n.label) + '<span class="nav-count">' + esc(counts[n.id]) + '</span></a>';
      }).join('');
    };
    $('#side-nav').innerHTML = html(false);
    $('#top-nav').innerHTML = html(true);
    var stale = stock.filter(isStale).length;
    var grading = stock.filter(function (a) { return a.statut === 'Au grading'; }).length;
    $('#side-stale').textContent = stale;
    $('#side-grading').textContent = grading;
    $('#top-counts').textContent = plural(stale, 'prix à relever', 'prix à relever') + ' · ' + grading + ' au grading';
  }

  function applyTheme() {
    var t = store('local', 'coffre-theme') || '';
    if (t) { document.documentElement.setAttribute('data-theme', t); } else { document.documentElement.removeAttribute('data-theme'); }
    var label = { '': 'auto', light: 'clair', dark: 'sombre' }[t];
    Array.prototype.forEach.call(document.querySelectorAll('.theme-label'), function (el) { el.textContent = label; });
  }
  function cycleTheme() {
    var order = ['', 'light', 'dark'];
    var t = store('local', 'coffre-theme') || '';
    store('local', 'coffre-theme', order[(order.indexOf(t) + 1) % order.length] || null);
    applyTheme();
  }

  function setHead(kicker, title) {
    $('#kicker').textContent = kicker;
    $('#title').textContent = title;
    document.title = title + ' · BouddhaBoch-TCG';
  }

  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'stock';
    var parts = h.split('/');
    var view = parts[0];
    var id = parts[1];
    current = view;
    S.confirmDelete = false;
    if (view !== 'ajout' && view !== 'modifier' && view !== 'vendre') { S.form = null; }
    renderNav();
    switch (view) {
      case 'archives': viewArchives(); break;
      case 'bilan': viewBilan(); break;
      case 'prix': viewPrix(); break;
      case 'fiche': viewFiche(id); break;
      case 'ajout': viewForm('ajout'); break;
      case 'modifier': viewForm('modifier', id); break;
      case 'vendre': viewForm('vendre', id); break;
      default: current = 'stock'; viewStock();
    }
    window.scrollTo(0, 0);
  }

  /* ================================================================
     Morceaux d'interface réutilisés
     ================================================================ */
  function searchBox(id, value, ph, label) {
    return '<div class="search"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--muted)"><circle cx="7" cy="7" r="5"></circle><line x1="10.6" y1="10.6" x2="14.5" y2="14.5"></line></svg>' +
      '<label for="' + id + '" class="sr">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="search" value="' + esc(value) + '" placeholder="' + esc(ph) + '" autocomplete="off"></div>';
  }
  function segGroup(scope, key, label, options, state) {
    var gid = scope + '-' + key;
    return '<div class="filter"><span id="' + gid + '" class="label-sm">' + esc(label) + '</span>' +
      '<div class="seg" role="group" aria-labelledby="' + gid + '">' +
      options.map(function (o) {
        return '<button type="button" data-filter="' + scope + '" data-key="' + key + '" data-val="' + esc(o[0]) + '" aria-pressed="' + (state[key] === o[0]) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div></div>';
  }
  function chip(a) {
    if (a.statut === 'À vendre') { return '<span class="chip chip-sale">À vendre</span>'; }
    if (a.statut === 'Au grading') { return '<span class="chip chip-grading">Au grading</span>'; }
    if (a.statut === 'Vendu') { return '<span class="chip chip-sold">Vendu</span>'; }
    return '<span class="chip chip-kept">Collection</span>';
  }
  function diffHtml(d) { return '<span class="strong num ' + (d >= 0 ? 'up' : 'down') + '">' + signed(d) + '</span>'; }
  function kpi(label, value, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><span class="label">' + esc(label) + '</span>' +
      '<span class="kpi-value">' + value + '</span>' + (sub ? '<span class="sm muted">' + sub + '</span>' : '') + '</div>';
  }
  function priceNote(a) {
    var g = gridEntry(a);
    if (g) { return '<span class="small muted">prix de la grille ETB</span>'; }
    if (!filled(a.prix_actuel)) { return '<span class="small down">prix pas encore relevé</span>'; }
    if (isStale(a)) { return '<span class="small down">relevé il y a ' + daysSince(a.date_releve) + ' jours</span>'; }
    return '<span class="small muted">relevé le ' + frDate(a.date_releve) + '</span>';
  }
  function costDetail(a) {
    var q = qtyOf(a);
    var f = feesOf(a);
    return (q > 1 ? q + ' × ' + eur(num(a.prix_unitaire)) : 'achat ' + eur(num(a.prix_unitaire))) + (f ? ' + frais ' + eur(f) : ', sans frais');
  }

  /* ================================================================
     Vue : Stock
     ================================================================ */
  function viewStock() {
    setHead('Synchro ' + (S.loadedAt ? frDate(isoOf(S.loadedAt)) + ' · ' + pad(S.loadedAt.getHours()) + ':' + pad(S.loadedAt.getMinutes()) : ''), 'Stock');
    if (!S.data.articles.filter(inStock).length && !S.data.ventes.length) {
      V.innerHTML = '<section class="panel"><h2 class="h2">Le coffre est vide</h2><p class="intro">Ajoute ton premier article : une carte, un ETB, un display. Tout ce que tu saisis est enregistré dans ton Google Sheet.</p><div class="btn-row"><a class="btn btn-amber" href="#ajout">Ajouter un article</a></div></section>';
      return;
    }
    V.innerHTML =
      '<section class="panel" aria-label="Résumé du stock"><div class="kpis" id="stock-summary"></div></section>' +
      '<section class="panel" aria-label="Stock">' +
        '<div class="panel-head"><h2 class="h2">Stock</h2>' + searchBox('q-stock', S.f.q, 'Nom, numéro, extension...', 'Rechercher dans le stock') +
        '<span class="label-sm" id="stock-count"></span></div>' +
        '<div class="filters" id="stock-filters"></div>' +
        '<div id="stock-results"></div>' +
      '</section>' +
      '<section class="panel" aria-label="À surveiller" id="watch-panel"></section>';
    updateStock();
  }

  function stockRows() {
    var q = norm(S.f.q.trim());
    return S.data.articles.filter(inStock).filter(function (a) {
      if (S.f.lic !== 'all' && licKey(a) !== S.f.lic) { return false; }
      if (S.f.type !== 'all' && typeKey(a) !== S.f.type) { return false; }
      if (S.f.status !== 'all' && statusKey(a) !== S.f.status) { return false; }
      if (q && norm([a.nom, a.reference, a.variante, a.etb_extension, a.rangement].join(' ')).indexOf(q) === -1) { return false; }
      return true;
    });
  }

  function updateStock() {
    var rows = stockRows();
    var cost = sumBy(rows, costOf);
    var fees = sumBy(rows, feesOf);
    var value = sumBy(rows, valueOf);
    var pieces = sumBy(rows, qtyOf);
    $('#stock-summary').innerHTML =
      kpi('Valeur estimée', eur(value), plural(pieces, 'pièce', 'pièces') + ', au dernier prix connu', 'kpi-main') +
      kpi('Prix de revient', eur(cost), 'dont ' + eur(fees) + ' de frais') +
      kpi('Plus-value latente', '<span class="accent">' + signed(value - cost) + '</span>', pct(value - cost, cost) + ' sur le revient');
    $('#stock-count').textContent = plural(pieces, 'pièce', 'pièces');
    $('#stock-filters').innerHTML =
      segGroup('stock', 'lic', 'Licence', [['all', 'Tout'], ['op', 'One Piece'], ['pk', 'Pokémon']], S.f) +
      segGroup('stock', 'type', 'Type', [['all', 'Tout'], ['card', 'Cartes'], ['sealed', 'Scellés']], S.f) +
      segGroup('stock', 'status', 'Statut', [['all', 'Tout'], ['collection', 'Collection'], ['sale', 'À vendre'], ['grading', 'Au grading']], S.f);

    if (!rows.length) {
      $('#stock-results').innerHTML = '<p class="empty">Aucun article ne correspond à ces filtres.</p>';
    } else {
      var table = '<div class="table-wrap only-desktop"><div class="table">' +
        '<div class="trow thead t-stock"><span>Article</span><span>Univers</span><span>Prix de revient</span><span>Prix actuel</span><span>Écart</span><span>Statut</span></div>' +
        rows.map(function (a) {
          var c = costOf(a), v = valueOf(a), q = qtyOf(a);
          return '<div class="trow t-stock">' +
            '<div class="cell"><button type="button" class="link-btn" data-open="' + esc(a.id) + '">' + esc(labelOf(a)) + '</button><span class="sm muted">' + esc(detailOf(a)) + '</span></div>' +
            '<div class="cell"><span>' + esc(a.licence) + '</span><span class="small muted">' + esc(kindOf(a)) + '</span></div>' +
            '<div class="cell"><span class="strong num">' + eur(c) + '</span><span class="small muted">' + esc(costDetail(a)) + '</span></div>' +
            '<div class="cell"><span class="num">' + (hasPrice(a) ? eur(v) : 'à relever') + '</span>' + (q > 1 && hasPrice(a) ? '<span class="small muted">' + q + ' × ' + eur(unitPriceOf(a)) + '</span>' : '') + priceNote(a) + '</div>' +
            '<div class="cell">' + (hasPrice(a) ? diffHtml(v - c) + '<span class="small muted">' + pct(v - c, c) + '</span>' : '<span class="small muted">-</span>') + '</div>' +
            '<div>' + chip(a) + '</div></div>';
        }).join('') + '</div></div>';
      var cards = '<div class="cards only-compact">' + rows.map(function (a) {
        var c = costOf(a), v = valueOf(a);
        return '<article class="card"><div class="card-top"><div class="cell">' +
          '<button type="button" class="link-btn" data-open="' + esc(a.id) + '">' + esc(labelOf(a)) + '</button>' +
          '<span class="sm muted">' + esc(detailOf(a)) + '</span><span class="small muted">' + esc(a.licence + ' · ' + kindOf(a)) + '</span></div>' + chip(a) + '</div>' +
          '<div class="card-figs">' +
            '<div class="cell"><span class="label-sm">Revient</span><span class="strong num">' + eur(c) + '</span></div>' +
            '<div class="cell"><span class="label-sm">Actuel</span><span class="num">' + (hasPrice(a) ? eur(v) : '-') + '</span></div>' +
            '<div class="cell"><span class="label-sm">Écart</span>' + (hasPrice(a) ? diffHtml(v - c) : '<span class="muted">-</span>') + '</div>' +
          '</div><div class="card-foot"><span class="small muted">' + esc(costDetail(a)) + '</span>' + priceNote(a) + '</div></article>';
      }).join('') + '</div>';
      $('#stock-results').innerHTML = table + cards;
    }

    var stock = S.data.articles.filter(inStock);
    var watch = [];
    stock.forEach(function (a) {
      if (a.statut === 'Au grading') {
        var d = daysSince(a.date_envoi_grading);
        watch.push({ id: a.id, name: labelOf(a), reason: isFinite(d) ? 'Au grading depuis ' + d + ' jours' : 'Au grading, date d\'envoi non saisie' });
      }
    });
    stock.filter(isStale).forEach(function (a) {
      watch.push({ id: a.id, name: labelOf(a), reason: filled(a.prix_actuel) ? 'Prix relevé il y a ' + daysSince(a.date_releve) + ' jours' : 'Prix pas encore relevé' });
    });
    $('#watch-panel').innerHTML = '<span class="label rule">À surveiller</span>' + (watch.length ? watch.map(function (w) {
      return '<div class="watch"><button type="button" class="link-btn" data-open="' + esc(w.id) + '">' + esc(w.name) + '</button><span class="sm accent">' + esc(w.reason) + '</span></div>';
    }).join('') : '<p class="empty">Rien à signaler : tous les prix sont à jour.</p>');
  }

  /* ================================================================
     Vue : Archives
     ================================================================ */
  function viewArchives() {
    setHead('Articles vendus', 'Archives');
    V.innerHTML =
      '<section class="panel" aria-label="Résumé des ventes"><div class="kpis" id="arch-summary"></div></section>' +
      '<section class="panel" aria-label="Archives">' +
        '<div class="panel-head"><h2 class="h2">Vendus</h2>' + searchBox('q-arch', S.af.q, 'Nom, numéro, plateforme...', 'Rechercher dans les archives') +
        '<span class="label-sm" id="arch-count"></span></div>' +
        '<div class="filters" id="arch-filters"></div>' +
        '<div id="arch-results"></div>' +
      '</section>';
    updateArchives();
  }

  function archiveRows() {
    var q = norm(S.af.q.trim());
    return S.data.ventes.filter(function (v) {
      if (S.af.lic !== 'all' && licKey(v) !== S.af.lic) { return false; }
      if (S.af.type !== 'all' && typeKey(v) !== S.af.type) { return false; }
      if (q && norm([v.nom, v.detail, v.plateforme].join(' ')).indexOf(q) === -1) { return false; }
      return true;
    }).sort(function (a, b) { return String(b.date_vente).localeCompare(String(a.date_vente)); });
  }

  function updateArchives() {
    var rows = archiveRows();
    var net = sumBy(rows, saleNet);
    $('#arch-summary').innerHTML =
      kpi('Gain net', '<span class="accent">' + signed(net) + '</span>', plural(rows.length, 'vente', 'ventes') + ', revient et frais de vente déduits', 'kpi-main') +
      kpi('Encaissé', eur(sumBy(rows, saleCash)), 'prix de vente cumulés') +
      kpi('Frais de vente', eur(sumBy(rows, saleFees)), 'commissions, port, emballage, acrylique');
    $('#arch-count').textContent = plural(rows.length, 'vente', 'ventes');
    $('#arch-filters').innerHTML =
      segGroup('arch', 'lic', 'Licence', [['all', 'Tout'], ['op', 'One Piece'], ['pk', 'Pokémon']], S.af) +
      segGroup('arch', 'type', 'Type', [['all', 'Tout'], ['card', 'Cartes'], ['sealed', 'Scellés']], S.af);
    if (!rows.length) {
      $('#arch-results').innerHTML = '<p class="empty">' + (S.data.ventes.length ? 'Aucune vente ne correspond à ces filtres.' : 'Aucune vente pour l\'instant. Pour vendre un article, ouvre sa fiche et choisis "Vendre".') + '</p>';
      return;
    }
    var name = function (v) { return v.nom + (num(v.qte) > 1 ? ' ×' + num(v.qte) : ''); };
    var acr = function (v) { return num(v.acrylique_facture) ? 'dont acrylique ' + eur(num(v.acrylique_facture)) : 'sans acrylique'; };
    var table = '<div class="table-wrap only-desktop"><div class="table">' +
      '<div class="trow thead t-sales"><span>Article</span><span>Vendu</span><span>Prix de revient</span><span>Prix de vente</span><span>Frais de vente</span><span>Gain net</span></div>' +
      rows.map(function (v) {
        var n = saleNet(v);
        return '<div class="trow t-sales">' +
          '<div class="cell"><span class="strong">' + esc(name(v)) + '</span><span class="sm muted">' + esc(v.detail) + '</span></div>' +
          '<div class="cell"><span>' + esc(v.plateforme) + '</span><span class="small muted">le ' + frDate(v.date_vente) + '</span></div>' +
          '<span class="num">' + eur(num(v.prix_revient)) + '</span>' +
          '<div class="cell"><span class="num">' + eur(saleCash(v)) + '</span><span class="small muted">' + acr(v) + '</span></div>' +
          '<div class="cell"><span class="num">' + eur(saleFees(v)) + '</span><span class="small muted">' + esc(saleFeesText(v)) + '</span></div>' +
          '<div class="cell">' + diffHtml(n) + '<span class="small muted">' + pct(n, num(v.prix_revient)) + '</span></div></div>';
      }).join('') + '</div></div>';
    var cards = '<div class="cards only-compact">' + rows.map(function (v) {
      return '<article class="card"><div class="card-top"><div class="cell"><span class="strong">' + esc(name(v)) + '</span>' +
        '<span class="sm muted">' + esc(v.detail) + '</span><span class="small muted">' + esc(v.plateforme) + ' · le ' + frDate(v.date_vente) + '</span></div>' + diffHtml(saleNet(v)) + '</div>' +
        '<div class="card-figs"><div class="cell"><span class="label-sm">Revient</span><span class="num">' + eur(num(v.prix_revient)) + '</span></div>' +
        '<div class="cell"><span class="label-sm">Vente</span><span class="num">' + eur(saleCash(v)) + '</span></div>' +
        '<div class="cell"><span class="label-sm">Frais</span><span class="num">' + eur(saleFees(v)) + '</span></div></div>' +
        '<div class="card-foot"><span class="small muted">' + acr(v) + ' · ' + esc(saleFeesText(v)) + '</span></div></article>';
    }).join('') + '</div>';
    $('#arch-results').innerHTML = table + cards;
  }

  /* ================================================================
     Vue : Bilan
     ================================================================ */
  function periodBounds() {
    var days = { '30': 30, '90': 90, '365': 365 }[S.period] || 0;
    var end = new Date(); end.setHours(0, 0, 0, 0);
    var start = days ? new Date(end.getTime() - days * 86400000) : null;
    return { start: start, end: end };
  }
  function inPeriod(iso, b) { var d = parseISO(iso); return !!d && (!b.start || d >= b.start); }

  function purchasesAll() {
    // Achat d'origine = ce qui reste en stock + ce qui a déjà été vendu (au prix de revient)
    var fromStock = S.data.articles.filter(function (a) { return qtyOf(a) > 0; }).map(function (a) {
      return { nom: a.nom, licence: a.licence, qte: qtyOf(a), cost: costOf(a), fees: feesOf(a), date: a.date_achat };
    });
    var fromSales = S.data.ventes.map(function (v) {
      return { nom: v.nom, licence: v.licence, qte: num(v.qte), cost: num(v.prix_revient), fees: 0, date: v.date_achat };
    });
    return fromStock.concat(fromSales);
  }

  function viewBilan() {
    setHead('Achats, ventes et stock', 'Bilan');
    var b = periodBounds();
    var buys = purchasesAll().filter(function (p) { return inPeriod(p.date, b); });
    var sells = S.data.ventes.filter(function (v) { return inPeriod(v.date_vente, b); });
    var buyTotal = sumBy(buys, function (p) { return p.cost; });
    var buyQty = sumBy(buys, function (p) { return p.qte; });
    var cash = sumBy(sells, saleCash);
    var sFees = sumBy(sells, saleFees);
    var sCost = sumBy(sells, function (v) { return num(v.prix_revient); });
    var sNet = cash - sFees - sCost;
    var balance = cash - sFees - buyTotal;

    var plat = {};
    sells.forEach(function (v) { var k = v.plateforme || 'Autre'; plat[k] = plat[k] || { n: 0, t: 0 }; plat[k].n++; plat[k].t += saleCash(v); });
    var platRows = Object.keys(plat).sort(function (x, y) { return plat[y].t - plat[x].t; });

    var stock = S.data.articles.filter(inStock);
    var totVal = sumBy(stock, valueOf) || 1;
    var split = function (title, defs) {
      return '<div class="split"><span class="subhead" style="padding-top:0">' + esc(title) + '</span>' + defs.map(function (d) {
        var arr = stock.filter(d[1]);
        var val = sumBy(arr, valueOf);
        return '<div class="cell" style="gap:4px"><div class="line" style="border:0;padding:0"><span>' + esc(d[0]) + ' <span class="small muted">' + plural(sumBy(arr, qtyOf), 'pièce', 'pièces') + '</span></span><span class="num">' + eur(val) + '</span></div>' +
          '<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:' + Math.round(val / totVal * 100) + '%"></div></div></div>';
      }).join('') + '</div>';
    };

    var now = new Date();
    var months = [];
    for (var k = 11; k >= 0; k--) {
      var md = new Date(now.getFullYear(), now.getMonth() - k, 1);
      months.push({ y: md.getFullYear(), m: md.getMonth(), buy: 0, sell: 0 });
    }
    var addTo = function (iso, key, amount) {
      var d = parseISO(iso);
      if (!d) { return; }
      months.forEach(function (mo) { if (mo.y === d.getFullYear() && mo.m === d.getMonth()) { mo[key] += amount; } });
    };
    purchasesAll().forEach(function (p) { addTo(p.date, 'buy', p.cost); });
    S.data.ventes.forEach(function (v) { addTo(v.date_vente, 'sell', saleCash(v)); });
    var mx = 0;
    months.forEach(function (mo) { mx = Math.max(mx, mo.buy, mo.sell); });
    var top = Math.max(100, Math.ceil(mx / 100) * 100);
    var chartLabel = 'Achats et ventes par mois. ' + months.map(function (mo) {
      return MONTHS[mo.m] + ' ' + mo.y + ' : achats ' + Math.round(mo.buy) + ' euros, ventes ' + Math.round(mo.sell) + ' euros';
    }).join('. ');

    var periods = [['30', '30 jours'], ['90', '3 mois'], ['365', '1 an'], ['all', 'Depuis le début']];
    V.innerHTML =
      '<section class="panel" aria-label="Période"><div class="panel-head" style="justify-content:space-between;align-items:flex-end">' +
        '<div class="filter"><span id="b-per" class="label-sm">Période</span><div class="seg" role="group" aria-labelledby="b-per">' +
        periods.map(function (p) { return '<button type="button" data-period="' + p[0] + '" aria-pressed="' + (S.period === p[0]) + '">' + p[1] + '</button>'; }).join('') +
        '</div></div>' +
        '<div class="panel-head"><span class="sm muted">' + (b.start ? 'Du ' + frDate(isoOf(b.start)) + ' au ' + frDate(isoOf(b.end)) : 'Jusqu\'au ' + frDate(isoOf(b.end))) + '</span>' +
        '<button type="button" class="btn" data-action="csv">Exporter en CSV</button></div></div></section>' +

      '<section class="panel" aria-label="Chiffres clés"><div class="kpis">' +
        kpi('Ventes encaissées', eur(cash), plural(sells.length, 'vente', 'ventes') + ', ' + plural(sumBy(sells, function (v) { return num(v.qte); }), 'pièce', 'pièces')) +
        kpi('Achats', eur(buyTotal), plural(buyQty, 'pièce achetée', 'pièces achetées')) +
        kpi('Balance', '<span class="' + (balance >= 0 ? 'up' : 'down') + '">' + signed(balance) + '</span>', 'encaissé net moins achats') +
        kpi('Gain net sur ventes', '<span class="accent">' + signed(sNet) + '</span>', 'marge ' + (cash ? pct(sNet, cash) : '0,0 %')) +
      '</div></section>' +

      '<div class="cols">' +
        '<section class="panel col" aria-label="Ventes de la période" style="gap:2px"><span class="label rule" style="padding-bottom:6px">Ventes de la période</span><div class="lines">' +
          [['Encaissé', eur(cash)], ['Frais de vente', eur(sFees)], ['Prix de revient des articles vendus', eur(sCost)], ['Gain net', signed(sNet)], ['Panier moyen', eur(sells.length ? cash / sells.length : 0)]]
            .map(function (l) { return '<div class="line"><span>' + l[0] + '</span><span class="strong num">' + l[1] + '</span></div>'; }).join('') +
          '</div><span class="subhead">Par plateforme</span><div class="lines">' +
          (platRows.length ? platRows.map(function (k) { return '<div class="line"><span>' + esc(k) + ' <span class="small muted">' + plural(plat[k].n, 'vente', 'ventes') + '</span></span><span class="num">' + eur(plat[k].t) + '</span></div>'; }).join('') : '<p class="empty" style="padding:7px 0">Aucune vente sur la période.</p>') +
        '</div></section>' +
        '<section class="panel col" aria-label="Achats de la période" style="gap:2px"><span class="label rule" style="padding-bottom:6px">Achats de la période</span><div class="lines">' +
          [['Pièces achetées', String(buyQty)], ['Total dépensé', eur(buyTotal)], ['dont frais (port, grading, service)', eur(sumBy(buys, function (p) { return p.fees; }))]]
            .map(function (l) { return '<div class="line"><span>' + l[0] + '</span><span class="strong num">' + l[1] + '</span></div>'; }).join('') +
          '</div><span class="subhead">Par licence</span><div class="lines">' +
          ['One Piece', 'Pokémon'].map(function (lic) {
            var arr = buys.filter(function (p) { return p.licence === lic; });
            return '<div class="line"><span>' + lic + ' <span class="small muted">' + plural(sumBy(arr, function (p) { return p.qte; }), 'pièce', 'pièces') + '</span></span><span class="num">' + eur(sumBy(arr, function (p) { return p.cost; })) + '</span></div>';
          }).join('') +
        '</div></section>' +
      '</div>' +

      '<section class="panel" aria-label="Stock aujourd\'hui"><span class="label rule">Stock au ' + frDate(todayISO()) + '</span><div class="kpis">' +
        kpi('Pièces', String(sumBy(stock, qtyOf))) + kpi('Valeur', eur(sumBy(stock, valueOf))) +
        kpi('Prix de revient', eur(sumBy(stock, costOf))) + kpi('Plus-value latente', signed(sumBy(stock, valueOf) - sumBy(stock, costOf))) +
        '</div><div class="cols" style="gap:20px 32px">' +
        split('Par statut', [['En vente', function (a) { return a.statut === 'À vendre'; }], ['Collection', function (a) { return statusKey(a) === 'collection'; }], ['Au grading', function (a) { return a.statut === 'Au grading'; }]]) +
        split('Par licence', [['Pokémon', function (a) { return a.licence === 'Pokémon'; }], ['One Piece', function (a) { return a.licence === 'One Piece'; }]]) +
        split('Par type', [['Scellés', function (a) { return a.type === 'Scellé'; }], ['Cartes', function (a) { return a.type !== 'Scellé'; }]]) +
      '</div></section>' +

      '<section class="panel" aria-label="Achats et ventes par mois"><div class="panel-head" style="justify-content:space-between"><span class="label">Achats et ventes, 12 derniers mois</span>' +
        '<div class="legend"><span><span class="swatch chart-buy" aria-hidden="true"></span>Achats</span><span><span class="swatch chart-sell" aria-hidden="true"></span>Ventes</span></div></div>' +
        '<div class="chart" role="img" aria-label="' + esc(chartLabel) + '"><div class="chart-top">' + eur(top).replace(',00', '') + '</div><div class="chart-bars">' +
        months.map(function (mo) {
          return '<div class="chart-col" title="' + esc(MONTHS[mo.m] + ' ' + mo.y + ' : achats ' + eur(mo.buy) + ', ventes ' + eur(mo.sell)) + '">' +
            '<div class="chart-bar chart-buy" style="height:' + (mo.buy / top * 100).toFixed(1) + '%"></div>' +
            '<div class="chart-bar chart-sell" style="height:' + (mo.sell / top * 100).toFixed(1) + '%"></div></div>';
        }).join('') + '</div><div class="chart-labels">' + months.map(function (mo) { return '<span>' + MONTHS[mo.m] + '</span>'; }).join('') + '</div></div>' +
        '<span class="sm muted">Sur 12 mois : achats ' + eur(sumBy(months, function (m) { return m.buy; })) + ' · ventes ' + eur(sumBy(months, function (m) { return m.sell; })) + '</span>' +
      '</section>';

    S.bilanCsv = { buys: buys, sells: sells, b: b };
  }

  function exportCsv() {
    var d = S.bilanCsv;
    if (!d) { return; }
    var q = function (s) { s = String(s === undefined ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var n = function (x) { return String(round2(x)).replace('.', ','); };
    var lines = [['Mouvement', 'Date', 'Article', 'Licence', 'Quantité', 'Montant', 'Frais', 'Prix de revient', 'Gain net', 'Plateforme'].join(';')];
    d.buys.forEach(function (p) { lines.push(['Achat', frDate(p.date), q(p.nom), q(p.licence), p.qte, n(p.cost), n(p.fees), '', '', ''].join(';')); });
    d.sells.forEach(function (v) { lines.push(['Vente', frDate(v.date_vente), q(v.nom), q(v.licence), num(v.qte), n(saleCash(v)), n(saleFees(v)), n(num(v.prix_revient)), n(saleNet(v)), q(v.plateforme)].join(';')); });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bilan-' + (d.b.start ? isoOf(d.b.start) : 'debut') + '-au-' + isoOf(d.b.end) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================================================================
     Vue : Prix des ETB
     ================================================================ */
  function viewPrix() {
    setHead('ETB Pokémon · ' + plural(S.data.prix.length, 'extension', 'extensions'), 'Prix des ETB');
    var stock = S.data.articles.filter(inStock);
    var rows = S.data.prix.slice().sort(function (a, b) { return num(b.prix) - num(a.prix); });
    V.innerHTML = '<section class="panel" aria-label="Prix des ETB">' +
      '<div class="panel-head" style="justify-content:space-between;align-items:baseline"><h2 class="h2">ETB Pokémon</h2></div>' +
      '<p class="intro">Prix de vente actuels, à l\'unité. Changer un prix ici met à jour la valeur de tous les ETB de cette extension dans le stock, quantités comprises. Les cartes et le One Piece se chiffrent à la main, article par article.</p>' +
      (rows.length ? '<div class="trow thead only-desktop" style="display:flex;gap:16px"><span style="flex:0 0 24px">N°</span><span style="flex:999 1 140px">Extension</span><span style="flex:0 0 130px">Prix actuel</span><span style="flex:1 1 110px">En stock</span></div>' : '') +
      (rows.length ? '' : '<p class="empty">Aucune extension pour l\'instant. Ajoute la première avec son prix juste en dessous.</p>') +
      '<div>' + rows.map(function (p, i) {
        var q = sumBy(stock.filter(function (a) { return a.etb_extension === p.extension; }), qtyOf);
        var id = 'prix-' + i;
        return '<div class="grid-row"><span class="grid-rank">' + (i + 1) + '</span>' +
          '<div class="grid-name"><label for="' + id + '" class="strong">' + esc(p.extension) + '</label>' +
          '<span class="small muted only-compact" style="flex-basis:100%">' + (q ? q + ' en stock' : 'aucun en stock') + ' · maj ' + frDate(p.modifie_le) + '</span></div>' +
          '<div class="money"><input id="' + id + '" inputmode="decimal" data-ext="' + esc(p.extension) + '" value="' + esc(toInput(p.prix)) + '"><span aria-hidden="true">€</span></div>' +
          '<span class="grid-stock only-desktop">' + (q ? q + ' en stock' : 'aucun en stock') + ' · maj ' + frDate(p.modifie_le) + '</span></div>';
      }).join('') + '</div>' +
      '<form id="add-etb" class="panel-head" style="padding-top:8px">' +
        '<div class="field" style="flex:999 1 200px"><label for="new-ext" class="label-sm">Nouvelle extension</label><div class="input-box"><input id="new-ext" placeholder="ex. Évolutions Prismatiques"></div></div>' +
        '<div class="field" style="flex:0 0 130px"><label for="new-ext-prix" class="label-sm">Prix</label><div class="input-box"><input id="new-ext-prix" inputmode="decimal"><span class="unit">€</span></div></div>' +
        '<button type="submit" class="btn btn-dark" style="align-self:flex-end">Ajouter</button></form>' +
      '</section>';
  }

  function savePrix(input) {
    var ext = input.getAttribute('data-ext');
    var val = input.value.trim();
    if (!filled(val) || isNaN(num(val)) || num(val) < 0) { toast('Prix invalide pour ' + ext + '.', true); return; }
    input.disabled = true;
    call('savePrix', { extension: ext, prix: num(val) })
      .then(reload)
      .then(function () { toast(ext + ' : ' + eur(num(val))); viewPrix(); })
      .catch(function (e) { toast(e.message, true); input.disabled = false; });
  }

  /* ================================================================
     Vue : Fiche article
     ================================================================ */
  function findArticle(id) { return S.data.articles.filter(function (a) { return String(a.id) === String(id); })[0]; }

  function cmInfo(link) {
    if (!filled(link)) { return ''; }
    try {
      var u = new URL(link);
      var bits = [];
      u.searchParams.forEach(function (val, key) {
        if (key === 'language') { bits.push('langue ' + (CM_LANG[val] || 'n°' + val)); }
        else { bits.push(key + ' = ' + val); }
      });
      return bits.length ? 'Filtres : ' + bits.join(', ') : 'Sans filtre';
    } catch (e) { return 'Lien invalide'; }
  }

  function historyChart(id) {
    var pts = S.data.histo.filter(function (h) { return String(h.article_id) === String(id) && parseISO(h.date); })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (pts.length < 2) { return '<p class="empty">La courbe apparaîtra à partir du deuxième prix relevé.</p>'; }
    var t0 = parseISO(pts[0].date).getTime(), t1 = parseISO(pts[pts.length - 1].date).getTime();
    var vals = pts.map(function (p) { return num(p.prix); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { hi = lo + 1; }
    var xy = pts.map(function (p) {
      var x = 8 + (t1 === t0 ? 0 : (parseISO(p.date).getTime() - t0) / (t1 - t0)) * 334;
      var y = 120 - (num(p.prix) - lo) / (hi - lo) * 100;
      return [x.toFixed(1), y.toFixed(1)];
    });
    var first = pts[0], last = pts[pts.length - 1];
    var label = 'Prix passé de ' + Math.round(num(first.prix)) + ' euros le ' + frDate(first.date) + ' à ' + Math.round(num(last.prix)) + ' euros le ' + frDate(last.date) + ', en ' + pts.length + ' relevés';
    return '<svg viewBox="0 0 350 150" role="img" aria-label="' + esc(label) + '">' +
      '<line x1="0" y1="132" x2="350" y2="132" stroke="var(--line)" stroke-width="1"></line>' +
      '<polyline points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      xy.map(function (p, i) {
        return i === xy.length - 1 ? '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="var(--amber)"></circle>'
          : '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="var(--panel)" stroke="var(--amber)" stroke-width="2"></circle>';
      }).join('') +
      '<text x="8" y="' + Math.min(128, num(xy[0][1]) - 8) + '" fill="var(--muted)" font-family="DM Sans, sans-serif" font-size="11">' + esc(eur(num(first.prix)).replace(',00', '')) + '</text>' +
      '<text x="342" y="' + Math.max(12, num(xy[xy.length - 1][1]) - 10) + '" fill="var(--ink)" font-family="DM Sans, sans-serif" font-size="11" text-anchor="end">' + esc(eur(num(last.prix)).replace(',00', '')) + '</text>' +
      '<text x="8" y="147" fill="var(--muted)" font-family="DM Sans, sans-serif" font-size="10">' + frDate(first.date) + '</text>' +
      '<text x="342" y="147" fill="var(--muted)" font-family="DM Sans, sans-serif" font-size="10" text-anchor="end">' + frDate(last.date) + '</text></svg>';
  }

  function viewFiche(id) {
    var a = findArticle(id);
    if (!a) { setHead('Introuvable', 'Fiche'); V.innerHTML = '<section class="panel"><p class="empty">Cet article n\'existe plus.</p><div class="btn-row"><a class="btn" href="#stock">Retour au stock</a></div></section>'; return; }
    setHead([a.reference, a.nom].filter(filled).join(' · '), 'Fiche');
    var c = costOf(a), v = valueOf(a), q = qtyOf(a);
    var line = function (l, val) { return num(val) ? '<div class="line"><span>' + esc(l) + '</span><span class="num">' + eur(num(val)) + '</span></div>' : ''; };
    var buyLines = '<div class="line"><span>' + (q > 1 ? 'Prix unitaire × ' + q : 'Prix') + '</span><span class="num">' + eur(num(a.prix_unitaire) * q) + '</span></div>' +
      line('Frais de service', a.frais_service) + line('Port', a.port);
    var gradLines = isGraded(a) ? line('Frais de grading', a.grading_frais) + line('Envoi aller', a.grading_envoi) + line('Retour', a.grading_retour) + line('Douane et TVA', a.grading_douane) : '';
    var otherLines = line(a.autre1_libelle || 'Autre frais', a.autre1_montant) + line(a.autre2_libelle || 'Autre frais', a.autre2_montant);
    var details = [
      ['Statut', chip(a)], ['Acheté', esc(frDate(a.date_achat) + (filled(a.achete_ou) ? ' · ' + a.achete_ou : ''))],
      ['Rangée', esc(a.rangement)], ['Note', esc(a.note)],
      ['Envoyé au grading', a.statut === 'Au grading' ? esc(frDate(a.date_envoi_grading)) : ''],
      ['Cardmarket', esc(cmInfo(a.lien_cardmarket))]
    ].filter(function (d) { return filled(d[1]); });

    V.innerHTML = '<div class="cols">' +
      '<div class="col">' +
        '<section class="panel ident" aria-label="Article"><span class="label-sm">' + esc(a.licence + ' · ' + kindOf(a)) + '</span>' +
          '<h2 class="ident-name">' + esc(labelOf(a)) + '</h2><span class="sm muted">' + esc(detailOf(a)) + '</span>' +
          (isGraded(a) && filled(a.grading_certificat) ? '<span class="small muted">Certificat ' + esc(a.grading_certificat) + '</span>' : '') + '</section>' +
        '<section class="panel" aria-label="Valeur"><div class="kpis">' +
          kpi('Prix actuel', hasPrice(a) ? eur(v) : 'à relever', (q > 1 && hasPrice(a) ? q + ' × ' + eur(unitPriceOf(a)) + ' · ' : '') + (gridEntry(a) ? 'prix de la grille ETB' : (filled(a.date_releve) ? 'relevé le ' + frDate(a.date_releve) : '')), 'kpi-main') +
          kpi('Plus-value', hasPrice(a) ? '<span class="' + (v - c >= 0 ? 'accent' : 'down') + '">' + signed(v - c) + '</span>' : '-', hasPrice(a) ? pct(v - c, c) + ' sur le revient' : '') +
        '</div></section>' +
        (gridEntry(a) ? '' : '<section class="panel histo" aria-label="Historique des prix"><span class="label">Historique des relevés</span>' + historyChart(a.id) + '</section>') +
      '</div>' +
      '<div class="col">' +
        '<section class="panel" aria-label="Prix de revient" style="gap:2px"><span class="label rule" style="padding-bottom:6px">Prix de revient</span>' +
          '<span class="subhead" style="padding-top:4px">Achat</span><div class="lines">' + buyLines + '</div>' +
          (gradLines ? '<span class="subhead">Grading · ' + esc(a.grading_societe) + '</span><div class="lines">' + gradLines + '</div>' : '') +
          (otherLines ? '<span class="subhead">Autres frais</span><div class="lines">' + otherLines + '</div>' : '') +
          '<div class="line line-total"><span class="strong">Total</span><span class="cell" style="align-items:flex-end"><span class="kpi-value" style="font-size:22px">' + eur(c) + '</span><span class="small muted">dont ' + eur(feesOf(a)) + ' de frais</span></span></div>' +
        '</section>' +
        (details.length ? '<section class="panel" aria-label="Détails"><dl class="lines" style="margin:0">' + details.map(function (d) {
          return '<div class="line"><dt class="muted">' + d[0] + '</dt><dd style="margin:0;text-align:right">' + d[1] + '</dd></div>';
        }).join('') + '</dl></section>' : '') +
        (filled(a.lien_cardmarket) ? '<a class="btn btn-dark btn-lg" href="' + esc(a.lien_cardmarket) + '" target="_blank" rel="noopener noreferrer">Voir sur Cardmarket ↗</a>' : '') +
        '<div class="btn-row"><a class="btn btn-amber btn-lg" href="#modifier/' + esc(a.id) + '">Modifier</a><a class="btn btn-lg" href="#vendre/' + esc(a.id) + '">Vendre</a></div>' +
        '<div id="delete-zone">' + deleteZone() + '</div>' +
      '</div></div>';
  }

  function deleteZone() {
    if (!S.confirmDelete) { return '<button type="button" class="btn btn-danger" data-action="ask-delete" style="width:100%">Supprimer cet article</button>'; }
    return '<div class="confirm"><p>Supprimer définitivement cet article ? Ses ventes passées restent dans les archives.</p>' +
      '<button type="button" class="btn btn-danger" data-action="confirm-delete">Oui, supprimer</button>' +
      '<button type="button" class="btn" data-action="cancel-delete">Annuler</button></div>';
  }

  /* ================================================================
     Vue : Formulaire (ajout, modification, vente)
     ================================================================ */
  function blankForm() {
    return {
      licence: 'Pokémon', type: 'Carte', nom: '', reference: '', variante: '', langue: 'Français', etat: 'Near Mint',
      qte: '1', prix_unitaire: '', date_achat: todayISO(), achete_ou: 'Vinted', port: '', frais_service: '',
      grading_societe: 'Aucune', grading_note: '', grading_certificat: '', grading_frais: '', grading_envoi: '', grading_retour: '', grading_douane: '',
      autre1_libelle: '', autre1_montant: '', autre2_libelle: '', autre2_montant: '',
      prix_actuel: '', date_releve: todayISO(), etb_extension: '', statut: 'Collection', date_envoi_grading: '', rangement: '', note: '', lien_cardmarket: '',
      vente_qte: '1', vente_prix: '', vente_date: todayISO(), vente_plateforme: 'Vinted', vente_commission: '', vente_port: '', vente_emballage: '',
      acrylique: 'Non', acrylique_facture: '', acrylique_cout: ''
    };
  }

  function viewForm(mode, id) {
    var a = id ? findArticle(id) : null;
    if ((mode === 'modifier' || mode === 'vendre') && !a) {
      setHead('Introuvable', 'Modifier');
      V.innerHTML = '<section class="panel"><p class="empty">Cet article n\'existe plus.</p><div class="btn-row"><a class="btn" href="#stock">Retour au stock</a></div></section>';
      return;
    }
    var v = blankForm();
    if (a) {
      ARTICLE_KEYS.forEach(function (k) {
        if (a[k] === undefined || a[k] === null) { return; }
        v[k] = MONEY_KEYS.indexOf(k) !== -1 ? toInput(a[k]) : String(a[k]);
      });
      if (!filled(v.grading_societe)) { v.grading_societe = 'Aucune'; }
    }
    if (mode === 'vendre') { v.statut = 'Vendu'; v.vente_qte = '1'; }
    S.form = { mode: mode, id: a ? a.id : '', prev: a ? (a.statut === 'Vendu' ? 'Collection' : a.statut) : 'Collection', v: v, errors: [], busy: false };
    setHead(mode === 'ajout' ? 'Nouvel article' : a.nom, mode === 'ajout' ? 'Ajouter' : (mode === 'vendre' ? 'Vendre' : 'Modifier'));
    renderForm();
  }

  function fieldDefs(v) {
    var I = function (key, label, o) { o = o || {}; return { kind: 'input', key: key, label: label, money: !!o.money, type: o.type || 'text', ph: o.ph || '', full: !!o.full, mode: o.mode || (o.money ? 'decimal' : '') }; };
    var C = function (key, label, options) { return { kind: 'choice', key: key, label: label, options: options, full: true }; };
    var graded = v.grading_societe !== 'Aucune';
    var etbOptions = [''].concat(S.data.prix.map(function (p) { return p.extension; }));
    var isEtbCandidate = v.type === 'Scellé' && v.licence === 'Pokémon' && S.data.prix.length > 0;
    var sections = [
      { title: 'Article', hint: 'Colle le lien Cardmarket avec tes filtres (langue, état...) : la fiche l\'ouvrira tel quel.', fields: [
        C('licence', 'Licence', ['One Piece', 'Pokémon']),
        C('type', 'Type', ['Carte', 'Scellé']),
        I('nom', 'Nom', { full: true, ph: v.type === 'Scellé' ? 'ex. ETB Pokémon 151' : 'ex. Dracaufeu-ex' }),
        I('reference', 'Numéro ou extension', { ph: 'OP05-119, 199/165...' }),
        I('variante', 'Variante', { ph: 'SEC, Reverse, Parallèle...' }),
        C('langue', 'Langue', ['Français', 'Anglais', 'Japonais']),
        C('etat', 'État', v.type === 'Scellé' ? ['Scellé intact', 'Scellé abîmé', 'Ouvert'] : ['Near Mint', 'Excellent', 'Good', 'Played']),
        I('lien_cardmarket', 'Lien Cardmarket', { full: true, type: 'url', ph: 'https://www.cardmarket.com/fr/...?language=2' })
      ].concat(isEtbCandidate ? [{ kind: 'select', key: 'etb_extension', label: 'Prix suivi par la grille ETB', options: etbOptions, full: true }] : []) },
      { title: 'Achat', fields: [
        I('prix_unitaire', 'Prix unitaire', { money: true }),
        I('qte', 'Quantité', { mode: 'numeric', ph: '1' }),
        I('date_achat', "Date d'achat", { type: 'date', full: true }),
        C('achete_ou', 'Acheté où', ['Vinted', 'Cardmarket', 'Boutique', 'Main propre', 'Échange', 'Ouverture de scellé']),
        I('port', 'Port', { money: true }),
        I('frais_service', 'Frais de service', { money: true, ph: 'protection acheteur...' })
      ] },
      { title: 'Grading', hint: graded ? 'Tous les frais du grading entrent dans le prix de revient.' : 'Choisis une société si la carte est gradée ou partie au grading.', fields: [
        C('grading_societe', 'Société', ['Aucune', 'PSA', 'Beckett', 'CGC', 'PCA'])
      ].concat(graded ? [
        I('grading_note', 'Note obtenue', { ph: 'en attente' }), I('grading_certificat', 'N° de certificat'),
        I('grading_frais', 'Frais de grading', { money: true }), I('grading_envoi', 'Envoi aller', { money: true }),
        I('grading_retour', 'Retour', { money: true }), I('grading_douane', 'Douane et TVA', { money: true })
      ] : []) },
      { title: 'Autres frais', hint: 'Étui, assurance, toploader : tout ce qui compte dans le prix de revient.', fields: [
        I('autre1_libelle', 'Libellé', { ph: 'ex. étui slab' }), I('autre1_montant', 'Montant', { money: true }),
        I('autre2_libelle', 'Libellé'), I('autre2_montant', 'Montant', { money: true })
      ] },
      { title: 'Suivi', fields: (filled(v.etb_extension) && isEtbCandidate ? [] : [
        I('prix_actuel', 'Prix actuel (unité)', { money: true }), I('date_releve', 'Relevé le', { type: 'date' })
      ]).concat([
        C('statut', 'Statut', ['Collection', 'À vendre', 'Au grading', 'Vendu'])
      ]).concat(v.statut === 'Au grading' ? [I('date_envoi_grading', 'Envoyé au grading le', { type: 'date', full: true })] : []).concat([
        I('rangement', 'Rangé où', { full: true, ph: 'Classeur, boîte, page...' }), I('note', 'Note', { full: true })
      ]) }
    ];
    if (v.statut === 'Vendu') {
      sections.push({ title: 'Vente', hint: 'Le gain net déduit le prix de revient des pièces vendues et tous les frais de vente.', fields: [
        I('vente_prix', 'Prix de vente total', { money: true }), I('vente_qte', 'Quantité vendue', { mode: 'numeric', ph: '1' }),
        I('vente_date', 'Date de vente', { type: 'date', full: true }),
        C('vente_plateforme', 'Vendu où', ['Vinted', 'Cardmarket', 'Main propre', 'Autre']),
        I('vente_commission', 'Commission', { money: true }), I('vente_port', 'Port à ta charge', { money: true }),
        I('vente_emballage', 'Emballage', { money: true }),
        C('acrylique', 'Acrylique de protection', ['Non', 'Oui'])
      ].concat(v.acrylique === 'Oui' ? [I('acrylique_facture', 'Supplément facturé', { money: true }), I('acrylique_cout', "Coût de l'acrylique", { money: true })] : []) });
    }
    return sections;
  }

  function renderField(f, v) {
    var full = f.full ? ' full' : '';
    if (f.kind === 'choice') {
      var gid = 'f-' + f.key;
      return '<div class="field' + full + '"><span id="' + gid + '" class="label-sm">' + esc(f.label) + '</span><div class="choices" role="group" aria-labelledby="' + gid + '">' +
        f.options.map(function (o) { return '<button type="button" data-choice="' + f.key + '" data-val="' + esc(o) + '" aria-pressed="' + (v[f.key] === o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
    }
    if (f.kind === 'select') {
      return '<div class="field' + full + '"><label for="f-' + f.key + '" class="label-sm">' + esc(f.label) + '</label><div class="input-box"><select id="f-' + f.key + '" data-key="' + f.key + '">' +
        f.options.map(function (o) { return '<option value="' + esc(o) + '"' + (v[f.key] === o ? ' selected' : '') + '>' + esc(o || 'Non, prix saisi à la main') + '</option>'; }).join('') + '</select></div></div>';
    }
    return '<div class="field' + full + '"><label for="f-' + f.key + '" class="label-sm">' + esc(f.label) + '</label><div class="input-box">' +
      '<input id="f-' + f.key + '" data-key="' + f.key + '" type="' + f.type + '"' + (f.mode ? ' inputmode="' + f.mode + '"' : '') + ' value="' + esc(v[f.key]) + '" placeholder="' + esc(f.ph) + '">' +
      (f.money ? '<span class="unit" aria-hidden="true">€</span>' : '') + '</div></div>';
  }

  function renderForm() {
    var F = S.form, v = F.v;
    var y = window.scrollY;
    V.innerHTML =
      (F.errors.length ? '<div class="form-errors" role="alert" id="form-errors">À corriger avant d\'enregistrer :<ul>' + F.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<p class="intro">Les frais laissés vides comptent pour zéro. Tout est enregistré dans le Google Sheet.</p>' +
      '<form id="item-form" novalidate><div class="form-sections">' + fieldDefs(v).map(function (s) {
        return '<section class="panel"><div class="cell" style="gap:2px"><h2 class="h3">' + esc(s.title) + '</h2>' + (s.hint ? '<p class="small muted" style="margin:0">' + esc(s.hint) + '</p>' : '') + '</div>' +
          '<div class="fields">' + s.fields.map(function (f) { return renderField(f, v); }).join('') + '</div></section>';
      }).join('') + '</div>' +
      '<section class="calc" aria-label="Calcul" style="margin-top:var(--gap)"><div class="kpi"><span class="label">Prix de revient</span><span class="kpi-value" id="calc-cost"></span><span class="sm" id="calc-fees" style="color:var(--side-label)"></span></div>' +
        '<div class="kpi"><span class="label" id="calc-label"></span><span class="kpi-value amber" id="calc-result"></span></div>' +
        '<div class="btn-row"><button type="submit" class="btn btn-amber btn-lg"' + (F.busy ? ' disabled' : '') + '>' + (F.busy ? 'Enregistrement...' : 'Enregistrer') + '</button>' +
        '<a class="btn btn-lg" style="color:var(--side-ink);border-color:var(--side-line)" href="' + (F.id ? '#fiche/' + esc(F.id) : '#stock') + '">Annuler</a></div></section></form>';
    updateCalc();
    window.scrollTo(0, y);
  }

  function formArticle(v) {
    var o = {};
    ARTICLE_KEYS.forEach(function (k) { o[k] = v[k]; });
    MONEY_KEYS.forEach(function (k) { if (k in o) { o[k] = filled(o[k]) ? round2(num(o[k])) : ''; } });
    o.qte = Math.max(1, Math.round(num(v.qte)) || 1);
    if (o.grading_societe === 'Aucune') {
      ['grading_note', 'grading_certificat', 'grading_frais', 'grading_envoi', 'grading_retour', 'grading_douane'].forEach(function (k) { o[k] = ''; });
    }
    if (!(o.type === 'Scellé' && o.licence === 'Pokémon')) { o.etb_extension = ''; }
    if (o.statut !== 'Au grading') { o.date_envoi_grading = ''; }
    return o;
  }

  function updateCalc() {
    var v = S.form.v;
    var a = formArticle(v);
    var cost = costOf(a);
    var fees = feesOf(a);
    var q = qtyOf(a);
    var result, label;
    if (v.statut === 'Vendu') {
      var vq = Math.min(q, Math.max(1, Math.round(num(v.vente_qte)) || 1));
      result = num(v.vente_prix) - num(v.vente_commission) - num(v.vente_port) - num(v.vente_emballage) - cost / q * vq;
      if (v.acrylique === 'Oui') { result += num(v.acrylique_facture) - num(v.acrylique_cout); }
      label = 'Gain net sur la vente';
    } else {
      result = unitPriceOf(a) * q - cost;
      label = 'Plus-value au prix actuel';
    }
    $('#calc-cost').textContent = eur(cost);
    $('#calc-fees').textContent = 'dont ' + eur(fees) + ' de frais';
    $('#calc-label').textContent = label;
    $('#calc-result').textContent = signed(result);
  }

  function validate(v) {
    var e = [];
    if (!filled(v.nom)) { e.push('Le nom de l\'article est obligatoire.'); }
    if (!filled(v.prix_unitaire) || num(v.prix_unitaire) < 0) { e.push('Indique le prix unitaire payé (0 si c\'était un cadeau).'); }
    if (!(Math.round(num(v.qte)) >= 1)) { e.push('La quantité doit être d\'au moins 1.'); }
    if (!parseISO(v.date_achat)) { e.push('Indique la date d\'achat, elle sert au bilan.'); }
    if (filled(v.lien_cardmarket) && !/^https:\/\/(www\.)?cardmarket\.com\//.test(v.lien_cardmarket.trim())) { e.push('Le lien Cardmarket doit commencer par https://www.cardmarket.com/'); }
    MONEY_KEYS.forEach(function (k) { if (filled(v[k]) && isNaN(parseFloat(String(v[k]).replace(',', '.')))) { e.push('Montant illisible dans un des champs (' + k.replace(/_/g, ' ') + ').'); } });
    if (v.statut === 'Vendu') {
      var q = Math.round(num(v.qte));
      if (!filled(v.vente_prix)) { e.push('Indique le prix de vente.'); }
      if (!(Math.round(num(v.vente_qte)) >= 1 && Math.round(num(v.vente_qte)) <= q)) { e.push('La quantité vendue doit être entre 1 et ' + q + '.'); }
      if (!parseISO(v.vente_date)) { e.push('Indique la date de vente.'); }
    }
    return e;
  }

  function submitForm() {
    var F = S.form, v = F.v;
    F.errors = validate(v);
    if (F.errors.length) { renderForm(); var box = $('#form-errors'); if (box) { box.scrollIntoView({ block: 'start' }); } return; }
    var article = formArticle(v);
    article.id = F.id || '';
    var selling = v.statut === 'Vendu';
    if (selling) { article.statut = F.prev || 'Collection'; }
    F.busy = true;
    renderForm();
    var savedId;
    call('saveArticle', { article: article })
      .then(function (res) {
        savedId = res.id;
        if (!selling) { return null; }
        return call('sellArticle', { id: savedId, vente: {
          qte: Math.round(num(v.vente_qte)), prix_vente: num(v.vente_prix), commission: num(v.vente_commission), port: num(v.vente_port),
          emballage: num(v.vente_emballage), acrylique_facture: v.acrylique === 'Oui' ? num(v.acrylique_facture) : 0,
          acrylique_cout: v.acrylique === 'Oui' ? num(v.acrylique_cout) : 0, plateforme: v.vente_plateforme, date_vente: v.vente_date
        } });
      })
      .then(reload)
      .then(function () {
        S.form = null;
        toast(selling ? 'Vente enregistrée.' : 'Article enregistré.');
        location.hash = selling ? 'archives' : 'fiche/' + savedId;
      })
      .catch(function (err) {
        if (!S.form) { return; }
        F.busy = false;
        F.errors = [err.message];
        if (S.token) { renderForm(); }
      });
  }

  /* ================================================================
     Événements
     ================================================================ */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) { return; }
    var action = t.getAttribute('data-action');
    if (action === 'theme') { cycleTheme(); return; }
    if (action === 'lock') { lockApp(); return; }
    if (!V.contains(t)) { return; }

    if (t.hasAttribute('data-open')) { location.hash = 'fiche/' + t.getAttribute('data-open'); return; }
    if (t.hasAttribute('data-filter')) {
      var scope = t.getAttribute('data-filter');
      var state = scope === 'stock' ? S.f : S.af;
      state[t.getAttribute('data-key')] = t.getAttribute('data-val');
      if (scope === 'stock') { updateStock(); } else { updateArchives(); }
      return;
    }
    if (t.hasAttribute('data-period')) { S.period = t.getAttribute('data-period'); viewBilan(); return; }
    if (t.hasAttribute('data-choice') && S.form) {
      var ck = t.getAttribute('data-choice'), cv = t.getAttribute('data-val');
      S.form.v[ck] = cv;
      if (ck === 'type') {
        var sealedStates = ['Scellé intact', 'Scellé abîmé', 'Ouvert'];
        var isSealedState = sealedStates.indexOf(S.form.v.etat) !== -1;
        if (cv === 'Scellé' && !isSealedState) { S.form.v.etat = 'Scellé intact'; }
        if (cv === 'Carte' && isSealedState) { S.form.v.etat = 'Near Mint'; }
      }
      renderForm();
      return;
    }
    if (action === 'csv') { exportCsv(); return; }
    if (action === 'ask-delete') { S.confirmDelete = true; $('#delete-zone').innerHTML = deleteZone(); return; }
    if (action === 'cancel-delete') { S.confirmDelete = false; $('#delete-zone').innerHTML = deleteZone(); return; }
    if (action === 'confirm-delete') {
      var id = (location.hash.split('/')[1] || '');
      t.disabled = true;
      call('deleteArticle', { id: decodeURIComponent(id) }).then(reload).then(function () {
        toast('Article supprimé.');
        location.hash = 'stock';
      }).catch(function (err) { toast(err.message, true); t.disabled = false; });
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q-stock') { S.f.q = t.value; updateStock(); return; }
    if (t.id === 'q-arch') { S.af.q = t.value; updateArchives(); return; }
    if (S.form && t.hasAttribute('data-key') && t.tagName === 'INPUT') { S.form.v[t.getAttribute('data-key')] = t.value; updateCalc(); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-ext')) { savePrix(t); return; }
    if (S.form && t.tagName === 'SELECT' && t.hasAttribute('data-key')) { S.form.v[t.getAttribute('data-key')] = t.value; renderForm(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-ext')) { e.preventDefault(); e.target.blur(); }
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id === 'item-form') { e.preventDefault(); if (S.form && !S.form.busy) { submitForm(); } return; }
    if (e.target.id === 'add-etb') {
      e.preventDefault();
      var name = $('#new-ext').value.trim(), price = $('#new-ext-prix').value.trim();
      if (!name || !filled(price) || num(price) < 0) { toast('Indique le nom de l\'extension et son prix.', true); return; }
      call('savePrix', { extension: name, prix: num(price) }).then(reload).then(function () { toast(name + ' ajoutée.'); viewPrix(); })
        .catch(function (err) { toast(err.message, true); });
    }
  });

  $('#lock-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('#code').value;
    var btn = $('#lock-submit');
    var err = $('#lock-error');
    btn.disabled = true;
    btn.textContent = 'Ouverture...';
    err.hidden = true;
    call('login', { code: code })
      .then(function (r) { S.token = r.token; store('session', 'coffre-token', r.token); return openApp(); })
      .catch(function (ex) { if (!S.token) { err.textContent = ex.message; err.hidden = false; } else { toast(ex.message, true); } })
      .then(function () { btn.disabled = false; btn.textContent = 'Ouvrir le coffre'; });
  });

  window.addEventListener('hashchange', function () {
    if (!S.token) { return; }
    route();
  });

  /* ================================================================
     Démarrage
     ================================================================ */
  applyTheme();
  $('#demo-note').hidden = !DEMO;
  var saved = store('session', 'coffre-token');
  if (saved) {
    S.token = saved;
    openApp().catch(function (err) { if (S.token) { lockApp(err.message); } });
  } else {
    lockApp();
  }
})();
