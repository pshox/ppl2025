# PPL priprema (Srbija)

Aplikacija za pripremu teorijskih ispita za PPL zasnovana na pitanjima Direktorata civilnog vazduhoplovstva Srbije (CAD). Mobilni interfejs: izbor predmeta, kviz sa mešanjem odgovora, označavanje tačnog/pogrešnog i automatskim prelaskom na sledeće pitanje. Dugme „Pitaj AI” priprema upit za ChatGPT sa kontekstom pitanja.

Tehnologije: Svelte + Vite. Aplikacija je generisana uz pomoć Cursor-a.

### Lokalno pokretanje
```bash
npm install
npm run dev
```
Otvorite `http://localhost:5173/ppl2025/`.

### Deploy na GitHub Pages
```bash
npm run deploy
```

Available at https://pshox.github.io/ppl2025/#/

Build ide u `dist/`, `base` je podešen u `vite.config.ts`.

### Podaci i predmeti
- Banke pitanja se nalaze u `public/data/*.json` (po jedan fajl po predmetu).
- Lista predmeta je u `src/subjects.ts`.
- Rutiranje preko hash-a: izbor predmeta `#/`, kviz `#/quiz?s=<id>`.

### Ponašanje kviza
- Odgovori se mešaju na svakom pitanju.
- Na izbor odgovora: tačan je zelen, pogrešan izabrani je crven.
- Posle tačnog odgovora pokreće se tajmer od 1 s i prelazi na sledeće pitanje.
- Dugme „Prikaži tačan odgovor” označava tačan odgovor.
- Napredak (indeks pitanja) se čuva po predmetu u `localStorage`.

### Dodavanje novog predmeta
1) Dodajte fajl `public/data/<id>.json` iste strukture kao postojeći.
2) U `src/subjects.ts` dodajte `{ id: '<id>', title: '<Naziv>' }`.

### Odricanje odgovornosti
Materijal je isključivo edukativan. Ažurnost i tačnost pitanja/odgovora nisu garantovane; proverite sa zvaničnim izvorima CAD.
