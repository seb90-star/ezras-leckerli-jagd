// Spiel-Bot für Ezras Leckerli-Jagd
// Spielt die Level mit simulierten Kindern und Erwachsenen durch und schreibt einen Bericht nach test-ergebnisse/.
// Braucht ENTWICKLUNG = true in docs/index.html (dort steckt der Test-Zugang).
//
//   npm run bot                                   alle Level, alle Spieler, je 30 Runden
//   npm run bot -- --runden 20 --level 1-10       nur der Garten, 20 Runden
//   npm run bot -- --spieler kind5,profi          nur bestimmte Spieler
//   npm run bot -- --endlos                       zusätzlich das Endlos-Spiel
//   npm run bot -- --ausr pfoten:2,kappe:1        mit Ausrüstung (Teil:Stufe)
//   npm run bot -- --zuschauen --level 10 --spieler kind8 --runden 1   im sichtbaren Browser zuschauen

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(HIER, '..', 'docs');
const AUSGABE = path.join(HIER, '..', 'test-ergebnisse');

// ---------- Die Spieler: geschätzte Werte, hier anpassen ----------
// reaktion: so oft (Sekunden) schaut der Spieler neu hin und entscheidet
// streuung: so viele Pixel zielt der Finger daneben
// fingerTempo: so schnell (Pixel pro Sekunde) wischt der Finger höchstens
// ablenkung: Chance pro Sekunde, kurz nicht hinzuschauen (ablenkDauer in Sekunden)
// verwechslung: Chance, etwas Ekliges für etwas Gutes zu halten
// bemerken: so viele Sekunden dauert es im Schnitt, bis eine neue Sache bemerkt wird
// uebersehen: Chance, eine Sache gar nicht zu bemerken
// vorsicht: wie stark Socken & Co. gemieden werden (0 = gar nicht, 1 = sehr)
// vorausschau: wie viele Sekunden im Voraus der Spieler plant
// sparen: Chance, den Knall für einen brenzligen Moment aufzuheben statt ihn sofort zu zünden
const SPIELER = {
  kind5: { name: 'Kind 5–6 J.', reaktion: .45, streuung: 22, fingerTempo: 650, ablenkung: .05, ablenkDauer: [.6, 1.6], verwechslung: .1, bemerken: .7, uebersehen: .04, vorsicht: .55, vorausschau: 1, sparen: 0 },
  kind8: { name: 'Kind 8–10 J.', reaktion: .32, streuung: 14, fingerTempo: 900, ablenkung: .025, ablenkDauer: [.4, 1.2], verwechslung: .04, bemerken: .4, uebersehen: .02, vorsicht: .75, vorausschau: 1.2, sparen: .5 },
  erwachsen: { name: 'Erwachsen', reaktion: .24, streuung: 9, fingerTempo: 1100, ablenkung: .01, ablenkDauer: [.3, .8], verwechslung: .015, bemerken: .25, uebersehen: .01, vorsicht: .9, vorausschau: 1.4, sparen: .9 },
  profi: { name: 'Profi', reaktion: .12, streuung: 3, fingerTempo: 1500, ablenkung: 0, ablenkDauer: [0, 0], verwechslung: 0, bemerken: .08, uebersehen: 0, vorsicht: 1, vorausschau: 1.6, sparen: 1 },
};

// ---------- Aufruf auswerten ----------
function argumente() {
  const a = process.argv.slice(2), o = { runden: 30, level: '1-30', spieler: 'alle', endlos: false, ausr: {}, zuschauen: false, maxZeit: 300 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, ''), v = a[i + 1];
    if (k === 'endlos' || k === 'zuschauen' || k === 'offen' || k === 'ohneWelle') o[k] = true;
    else if (k === 'runden' || k === 'maxZeit') { o[k] = +v; i++; }
    else if (k === 'ausr') { for (const t of v.split(',')) { const [id, st] = t.split(':'); o.ausr[id] = +st || 1; } i++; }
    // --gefahr .2,.42 – anderen Anteil von Socke & Co. ausprobieren (Anfang, volle Schwierigkeit)
    else if (k === 'gefahr') { o.gefahr = v.split(',').map(Number); i++; }
    // --stufen 10:22,5:30/45/60 – andere Zielzahlen für einzelne Level ausprobieren
    else if (k === 'stufen') { o.stufen = {}; for (const t of v.split(',')) { const [nr, st] = t.split(':'); o.stufen[nr] = st.split('/').map(Number); } i++; }
    // --offen: Level enden nicht bei 3 Pfoten – misst, wie weit die Spieler kommen
    // --setze kind8.reaktion=.25,profi.streuung=0 – Spieler-Werte ausprobieren, ohne die Datei zu ändern
    else if (k === 'setze') {
      for (const t of v.split(',')) {
        const [wer, wert] = t.split('='), [id, feld] = wer.split('.');
        if (!SPIELER[id] || !(feld in SPIELER[id])) throw new Error(`Unbekannt: ${wer}`);
        SPIELER[id][feld] = +wert;
      }
      i++;
    }
    else { o[k] = v; i++; }
  }
  o.levels = o.level === '0' ? [] : o.level.split(',').flatMap((t) => {
    const [von, bis] = t.split('-').map(Number);
    return Array.from({ length: (bis || von) - von + 1 }, (_, i) => von + i);
  });
  o.spielerIds = o.spieler === 'alle' ? Object.keys(SPIELER) : o.spieler.split(',');
  for (const id of o.spielerIds) if (!SPIELER[id]) throw new Error(`Unbekannter Spieler „${id}“. Möglich: ${Object.keys(SPIELER).join(', ')}`);
  return o;
}

// ---------- Kleiner Server für docs/ ----------
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
function serverStarten() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const datei = path.join(DOCS, p);
    if (!datei.startsWith(DOCS) || !fs.existsSync(datei)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
    fs.createReadStream(datei).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------- Eine Runde spielen (läuft im Browser) ----------
async function botRunde({ nr, p, seed, ausr, maxZeit, zuschauen, gefahr, extra }) {
  // gleicher Startwert = gleiche Runde
  let s = seed >>> 0;
  const zufall = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = zufall;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += zufall(); return (u - 3) / .707; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const T = window.ezraTest, dt = 1 / 60;
  const art = nr ? T.levels[nr - 1].art : null;

  // Wann kommt eine Sache auf Maulhöhe an? (null = gar nicht mehr)
  const ankunft = (it, yc, unten) => {
    if (it.y > unten) return null;
    if (it.y >= yc) return 0;
    if (!it.g) return it.vy > 0 ? (yc - it.y) / it.vy : null;
    return (-it.vy + Math.sqrt(it.vy * it.vy + 2 * it.g * (yc - it.y))) / it.g;
  };
  // Wie wichtig ist eine Sache? (Verpasstes kostet nur die Combo)
  const wertVon = (it, L) => {
    if (it.bonus) return 1.5;
    if (it.typ === 'knochen') return 2;
    if (it.typ === 'gold') return art === 'gold' ? 8 : 5;
    if (it.typ === 'pfote') return L.leben < 3 ? 5 : 1;
    if (it.typ === 'magnet' || it.typ === 'schild') return 3;
    if (it.typ === 'ball') return art === 'baelle' ? 5 : 2;
    return 2;
  };

  const verwechselt = new Map(), uebersehen = new Map(), bemerktAb = new Map();
  const merken = (m, id, chance) => { if (!m.has(id)) m.set(id, zufall() < chance); return m.get(id); };
  // neue Sachen fallen erst nach einer Weile auf (mal schneller, mal langsamer)
  const bemerkt = (id, jetzt) => {
    if (!bemerktAb.has(id)) bemerktAb.set(id, jetzt - Math.log(1 - zufall()) * p.bemerken);
    return jetzt >= bemerktAb.get(id);
  };
  let finger = 0;

  function planen(L) {
    const ziele = [];
    for (const it of L.items) {
      // Zeitfenster, in dem die Sache auf Maulhöhe ist
      const rein = ankunft(it, L.fang.oben, L.fang.unten), raus = ankunft(it, L.fang.unten, L.fang.unten + 1);
      if (!bemerkt(it.id, L.zeit) || merken(uebersehen, it.id, p.uebersehen)) continue; // die Uhr fürs Bemerken läuft ab dem ersten Blick
      if (rein === null || rein > p.vorausschau) continue;
      const eklig = it.eklig && !merken(verwechselt, it.id, p.verwechslung);
      const tm = (rein + (raus ?? rein)) / 2;
      const x = clamp(it.x + (it.wackelt ? 0 : it.vx * tm) + L.wind * tm, 0, L.W);
      ziele.push({ x, rein, raus: raus ?? rein + .05, eklig, wert: wertVon(it, L), breite: L.fang.breite + it.r * .6 });
    }
    // Warnflecken der Boss-Angriffe: dort darf Ezra beim Einschlag nicht stehen
    for (const z of L.zonen || []) ziele.push({ x: z.x, rein: Math.max(0, z.t - .05), raus: z.t + .05, eklig: true, wert: 0, breite: z.b - 2 });
    const tempo = Math.min(p.fingerTempo, 1200), vonX = L.ezraX, start = .04;
    const gute = ziele.filter((z) => !z.eklig).sort((a, b) => a.rein - b.rein), eklige = ziele.filter((z) => z.eklig);
    // Läuft Ezra auf dem Weg (x0 → x1, dann warten bis bisT) in etwas Ekliges?
    const ekligAufWeg = (x0, t0, x1, t1, bisT) => {
      let strafe = 0;
      for (const z of eklige) {
        for (let k = 0; k <= 3; k++) {
          const ts = z.rein + (z.raus - z.rein) * k / 3;
          if (ts < t0 || ts > bisT) continue;
          const pos = ts >= t1 ? x1 : x0 + (x1 - x0) * (ts - t0) / Math.max(t1 - t0, 1e-6);
          if (Math.abs(pos - z.x) < z.breite + 8) { strafe += p.vorsicht * 8; break; }
        }
      }
      return strafe;
    };
    // Reihenfolge planen: welche der nächsten guten Sachen schafft Ezra nacheinander? (DP über die Ankunftszeiten)
    const kette = gute.map(() => null);
    const anlaufen = (x, t, z) => {
      const b = z.breite * .7, weg = Math.max(0, Math.abs(z.x - x) - b);
      const an = t + weg / tempo, fangT = Math.max(z.rein, an);
      if (an > z.raus) return null;
      const fangX = z.x - Math.sign(z.x - x) * Math.min(b, Math.abs(z.x - x));
      return { an, fangT, fangX };
    };
    let besteKette = null;
    gute.forEach((z, i) => {
      const wert = z.wert * Math.exp(-z.rein / 2);
      const optionen = [{ x: vonX, t: start, summe: 0, vor: -1 }];
      for (let j = 0; j < i; j++) if (kette[j]) optionen.push({ x: kette[j].fangX, t: kette[j].fangT, summe: kette[j].summe, vor: j });
      for (const o of optionen) {
        const a = anlaufen(o.x, o.t, z);
        if (!a) continue;
        const summe = o.summe + wert - ekligAufWeg(o.x, o.t, a.fangX, a.an, a.fangT);
        if (!kette[i] || summe > kette[i].summe) kette[i] = { ...a, summe, vor: o.vor };
      }
      if (kette[i] && (!besteKette || kette[i].summe > besteKette.summe)) besteKette = { ...kette[i], i };
    });
    let ziel = vonX;
    if (besteKette && besteKette.summe > 0) {
      let i = besteKette.i;
      while (kette[i].vor >= 0) i = kette[i].vor;
      ziel = kette[i].fangX;
    }
    // Steht dort gleich etwas Ekliges im Weg? Dann die nächste sichere Stelle suchen
    if (ekligAufWeg(vonX, start, ziel, start + Math.abs(ziel - vonX) / tempo, start + .6) > 0) {
      let bestWert = -Infinity;
      for (let px = 20; px <= L.W - 20; px += 6) {
        const wert = -ekligAufWeg(vonX, start, px, start + Math.abs(px - vonX) / tempo, start + .6) - Math.abs(px - ziel) * .01;
        if (wert > bestWert) { bestWert = wert; ziel = px; }
      }
    }
    return clamp(ziel + gauss() * p.streuung, 20, L.W - 20);
  }

  if (gefahr) T.gefahr(...gefahr);
  // Tasche: Knall aufheben (wer spart) bis es eng wird, alles andere gleich zünden
  let knallSparen = null;
  function taschePruefen(L) {
    // alles außer dem Knall gleich zünden
    const andere = L.tasche.findIndex((typ) => typ !== 'knall');
    if (andere >= 0) return T.zuenden(andere);
    const platz = L.tasche.indexOf('knall');
    if (platz < 0) return;
    if (knallSparen === null) knallSparen = zufall() < p.sparen;
    const nahEklig = L.items.filter((it) => it.eklig && !it.bonus && it.y > L.fang.oben - 260 && Math.abs(it.x - L.ezraX) < 90).length;
    if (!knallSparen || L.welle === 'aktiv' || nahEklig >= 3 || (L.boss && L.boss.phase === 'wut' && nahEklig >= 2)) { knallSparen = null; T.zuenden(platz); }
  }
  T.starten(nr, ausr, zuschauen ? 'zuschauen' : 'schnell', extra);
  finger = T.lage().ezraX;
  let plan = finger, bisPlan = 0, abgelenkt = 0, schritte = 0;
  const verluste = { verpasst: 0, eklig: 0 }, protokoll = [], letztePlaene = [];
  while (true) {
    const L = T.lage();
    if (L.zustand !== 'laeuft') break;
    if (L.zeit > maxZeit) { T.beenden(); break; }
    if (abgelenkt > 0) abgelenkt -= dt;
    else if (zufall() < p.ablenkung * dt) abgelenkt = p.ablenkDauer[0] + zufall() * (p.ablenkDauer[1] - p.ablenkDauer[0]);
    bisPlan -= dt;
    if (bisPlan <= 0 && abgelenkt <= 0) {
      plan = planen(L); bisPlan = p.reaktion * (.7 + zufall() * .6);
      taschePruefen(L);
      letztePlaene.push({ zeit: +L.zeit.toFixed(2), ezraX: Math.round(L.ezraX), plan: Math.round(plan),
        sieht: L.items.map((it) => `${it.typ}@${Math.round(it.x)},${Math.round(it.y)}${bemerktAb.get(it.id) > L.zeit ? '?' : ''}`).join(' ') });
      if (letztePlaene.length > 4) letztePlaene.shift();
    }
    const d = plan - finger, max = p.fingerTempo * dt;
    finger += Math.abs(d) <= max ? d : Math.sign(d) * max;
    T.finger(finger);
    T.schritt(dt);
    // Woran ging ein Leben verloren? Knochen verpasst oder etwas Ekliges gefangen
    const N = T.lage();
    if (N.leben < L.leben) {
      const weg = L.items.filter((it) => !N.items.some((n) => n.id === it.id));
      const grund = weg.some((it) => it.eklig && it.y < L.fang.unten + 20) ? 'eklig' : 'verpasst';
      verluste[grund]++;
      if (protokoll.length < 30) protokoll.push({ zeit: +L.zeit.toFixed(2), grund, ezraX: Math.round(L.ezraX), finger: Math.round(finger), plan: Math.round(plan),
        abgelenkt: abgelenkt > 0, fang: [Math.round(L.fang.oben), Math.round(L.fang.unten)],
        weg: weg.map((it) => `${it.typ}@${Math.round(it.x)},${Math.round(it.y)} v${Math.round(it.vx)},${Math.round(it.vy)}`), vorher: [...letztePlaene] });
    }
    if (zuschauen) await new Promise((ok) => requestAnimationFrame(ok));
    else if (++schritte % 300 === 0) await new Promise((ok) => setTimeout(ok, 0));
  }
  if (T.lage().zustand !== 'ende') throw new Error(`Runde unterbrochen (Zustand: ${T.lage().zustand})`);
  return { ...T.ergebnis(), verluste, protokoll };
}

// ---------- Bericht ----------
const prozent = (n, von) => (von ? Math.round(n / von * 100) : 0);
const schnitt = (liste, f) => (liste.length ? liste.reduce((a, x) => a + f(x), 0) / liste.length : 0);
const AUFGABE = { gefangen: 'Sachen fangen', punkte: 'Punkte', baelle: 'Bälle', serie: 'Serie', dauer: 'Sekunden durchhalten',
  gold: 'Goldene', sauber: 'Punkte ohne Socke', boss: 'Boss' };

function berichtSchreiben(o, levels, ergebnisse, fehler, dauerSek) {
  const md = [];
  const jetzt = new Date();
  md.push(`# Spiel-Bot-Bericht – ${jetzt.toLocaleString('de-DE')}`, '');
  md.push(`${ergebnisse.length} Runden in ${Math.round(dauerSek)} s · je ${o.runden} Runden pro Level und Spieler · Ausrüstung: ${Object.keys(o.ausr).length ? Object.entries(o.ausr).map(([k, v]) => `${k} ${v}`).join(', ') : 'keine'}`, '');
  md.push('> Die Spieler sind Schätzungen (Werte oben in `test/spielbot.mjs`). Der Bericht zeigt Tendenzen, keine echten Kinder.', '');
  md.push('**So liest du die Tabelle:** `Ø 🐾` = Pfoten im Schnitt · `≥1` = so oft geschafft · `3🐾` = so oft alle 3 Pfoten', '');

  const spieler = o.spielerIds;
  const kopf = ['Level', 'Aufgabe', ...spieler.map((id) => SPIELER[id].name)];
  // Auffälligkeiten nach Art sammeln: Text → Level (mit Wert)
  const hinweise = new Map();
  const merke = (text, nr, wert) => { if (!hinweise.has(text)) hinweise.set(text, []); hinweise.get(text).push(wert == null ? `${nr}` : `${nr} (${wert} %)`); };
  const zeilen = [];
  for (const nr of o.levels) {
    const l = levels[nr - 1];
    const zelle = [];
    for (const id of spieler) {
      const r = ergebnisse.filter((e) => e.nr === nr && e.spieler === id);
      const geschafft = prozent(r.filter((e) => e.pfoten >= 1).length, r.length), drei = prozent(r.filter((e) => e.pfoten === 3).length, r.length);
      zelle.push(`${schnitt(r, (e) => e.pfoten).toFixed(1)} · ${geschafft} % · ${drei} %`);
      if (id === 'kind5' && geschafft < 40) merke('Kleine Kinder schaffen es selten (unter 40 %)', nr, geschafft);
      if (id === 'kind8' && geschafft < 60) merke('Ältere Kinder schaffen es oft nicht (unter 60 %)', nr, geschafft);
      if (id === 'erwachsen' && geschafft < 60) merke('Erwachsene schaffen es oft nicht (unter 60 %)', nr, geschafft);
      if (id === 'erwachsen' && drei < 15) merke('Erwachsene holen fast nie 3 Pfoten (unter 15 %)', nr, drei);
      if (id === 'profi' && drei < 60) merke('Selbst der Profi holt selten 3 Pfoten (unter 60 %) – evtl. kaum schaffbar', nr, drei);
      if (id === 'kind5' && drei > 85 && l.art !== 'boss' && nr > 1) merke('Sehr leicht – sogar kleine Kinder holen meist 3 Pfoten', nr, drei);
    }
    const ziel = l.art === 'boss' ? `${l.stufen[0]} Treffer` : `${l.stufen.join('/')} ${AUFGABE[l.art]}`;
    zeilen.push([`${nr} ${{ garten: '🌼', wald: '🌲', strand: '🏖️' }[l.welt]}`, ziel, ...zelle]);
  }
  if (zeilen.length) {
    md.push('## Level', '', `| ${kopf.join(' | ')} |`, `|${kopf.map(() => '---').join('|')}|`, ...zeilen.map((z) => `| ${z.join(' | ')} |`), '');
    md.push('Jede Zelle: `Ø 🐾 · ≥1 · 3🐾`', '');
  }

  // Sprünge im Schwierigkeitsgrad (ältere Kinder)
  if (spieler.includes('kind8')) {
    let vorher = null;
    for (const nr of o.levels) {
      const r = ergebnisse.filter((e) => e.nr === nr && e.spieler === 'kind8');
      const g = prozent(r.filter((e) => e.pfoten >= 1).length, r.length);
      if (vorher !== null && vorher - g >= 35) merke('Großer Sprung – ältere Kinder schaffen deutlich weniger als im Level davor', nr);
      vorher = g;
    }
  }

  md.push('## Spieler im Überblick', '', '| Spieler | Ø Dauer pro Level | Ø Leben verloren | davon Knochen verpasst | davon Ekliges gefangen | Level geschafft |', '|---|---|---|---|---|---|');
  for (const id of spieler) {
    const r = ergebnisse.filter((e) => e.spieler === id && e.nr);
    const verpasst = r.reduce((a, e) => a + e.verluste.verpasst, 0), eklig = r.reduce((a, e) => a + e.verluste.eklig, 0);
    md.push(`| ${SPIELER[id].name} | ${schnitt(r, (e) => e.zeit).toFixed(0)} s | ${schnitt(r, (e) => 3 - e.leben).toFixed(1)} | ${prozent(verpasst, verpasst + eklig)} % | ${prozent(eklig, verpasst + eklig)} % | ${prozent(r.filter((e) => e.pfoten >= 1).length, r.length)} % |`);
  }
  md.push('');

  if (o.endlos) {
    md.push('## Endlos-Spiel', '', '| Spieler | Ø Punkte | Bester Lauf | Ø Dauer |', '|---|---|---|---|');
    for (const id of spieler) {
      const r = ergebnisse.filter((e) => e.spieler === id && !e.nr);
      md.push(`| ${SPIELER[id].name} | ${schnitt(r, (e) => e.punkte).toFixed(0)} | ${Math.max(0, ...r.map((e) => e.punkte))} | ${schnitt(r, (e) => e.zeit).toFixed(0)} s |`);
    }
    md.push('');
  }

  md.push('## Auffälligkeiten', '', ...(hinweise.size ? [...hinweise].map(([text, nrn]) => `- **${text}:** Level ${nrn.join(', ')}`) : ['- Nichts Auffälliges']), '');
  md.push('## Fehler im Spiel', '', ...(fehler.length ? fehler.map((f) => `- ${f}`) : ['- Keine Fehler 👍']), '');

  fs.mkdirSync(AUSGABE, { recursive: true });
  const stempel = jetzt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const mdDatei = path.join(AUSGABE, `bericht-${stempel}.md`);
  fs.writeFileSync(mdDatei, md.join('\n'));
  fs.writeFileSync(path.join(AUSGABE, `rohdaten-${stempel}.json`), JSON.stringify({ optionen: o, ergebnisse, fehler }, null, 1));
  return mdDatei;
}

// ---------- Los geht’s ----------
async function main() {
  const o = argumente();
  const server = await serverStarten();
  const adresse = `http://127.0.0.1:${server.address().port}/?test`;
  const browser = await chromium.launch({ channel: 'chrome', headless: !o.zuschauen, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

  const auftraege = [];
  for (const id of o.spielerIds) {
    for (const nr of [...o.levels, ...(o.endlos ? [0] : [])]) {
      for (let k = 0; k < o.runden; k++) auftraege.push({ nr, spieler: id, seed: nr * 100003 + k * 7919 + id.length * 31 + 1 });
    }
  }
  const ergebnisse = [], fehler = [], gesamt = auftraege.length;
  let levels = null, fertig = 0;
  const start = Date.now();

  async function arbeiter() {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, serviceWorkers: 'block' });
    const seite = await ctx.newPage();
    let jetzt = null;
    seite.on('pageerror', (e) => fehler.push(`${jetzt ? (jetzt.nr ? `Level ${jetzt.nr}` : 'Endlos') + `, ${SPIELER[jetzt.spieler].name}` : 'Beim Laden'}: ${e.message}`));
    await seite.goto(adresse);
    const ok = await seite.waitForFunction(() => window.ezraTest, null, { timeout: 10000 }).catch(() => null);
    if (!ok) throw new Error('Test-Zugang fehlt – steht in docs/index.html ENTWICKLUNG = true?');
    levels ??= await seite.evaluate(() => window.ezraTest.levels);
    while (auftraege.length) {
      jetzt = auftraege.shift();
      try {
        const e = await seite.evaluate(botRunde, { nr: jetzt.nr, p: SPIELER[jetzt.spieler], seed: jetzt.seed, ausr: o.ausr, maxZeit: o.maxZeit, zuschauen: o.zuschauen, gefahr: o.gefahr, extra: { offen: o.offen, stufen: o.stufen, ohneWelle: o.ohneWelle } });
        ergebnisse.push({ ...jetzt, ...e });
      } catch (err) {
        fehler.push(`${jetzt.nr ? `Level ${jetzt.nr}` : 'Endlos'}, ${SPIELER[jetzt.spieler].name}: ${err.message.split('\n')[0]}`);
      }
      fertig++;
      if (fertig % 50 === 0 || fertig === gesamt) process.stdout.write(`\r${fertig} von ${gesamt} Runden gespielt …`);
    }
    await ctx.close();
  }
  const anzahl = o.zuschauen ? 1 : Math.max(1, Math.min(4, os.cpus().length - 1));
  await Promise.all(Array.from({ length: anzahl }, arbeiter));
  await browser.close();
  server.close();

  ergebnisse.sort((a, b) => a.nr - b.nr || a.spieler.localeCompare(b.spieler) || a.seed - b.seed);
  const datei = berichtSchreiben(o, levels, ergebnisse, fehler, (Date.now() - start) / 1000);
  console.log(`\nFertig. Bericht: ${path.relative(process.cwd(), datei)}`);
  if (fehler.length) console.log(`${fehler.length} Fehler im Spiel – siehe Bericht.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
