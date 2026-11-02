# TrueCal — Wireframes (text only)

> Early design sketch. The built app differs in places (review screen, I-CAR lookup, own records). See [docs/user-guide.html](./docs/user-guide.html) for how it works now.

PWA for checking whether an ADAS calibration is **Required / Not required / Self-learning**, with the OEM source cited.
Built from `ADAS-Calibration-Overview.md`; VIN scan, vPIC decode, photo capture and dictation patterns reused from `D:\Collision-Voice`.

Brand: navy `#10243E`, orange `#E8601C`. Logo files are in [icons/](./icons).

Legend: `[ Button ]`  `[v Dropdown]`  `( ) radio`  `[x] checkbox`  `____` text input  `📷` camera  `🎤` dictate

---

## Screen map

```
Home ─► New Check ─► Ruling ─► Report (print / share)
  │         │
  │         └─► Scan VIN (full-screen camera) / Take photo
  └─► Past Checks ─► Ruling (read-only)
```

---

## 1. Home

```
┌──────────────────────────────────────┐
│ [logo] TrueCal                  ☰   │
├──────────────────────────────────────┤
│  Is that calibration really needed?  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   [ + New check ]              │  │
│  └────────────────────────────────┘  │
│                                      │
│  Recent checks                       │
│  ┌────────────────────────────────┐  │
│  │ 2021 Honda Civic    ● REQUIRED │  │
│  │ Front bumper R&I   Today 9:14  │  │
│  ├────────────────────────────────┤  │
│  │ 2019 Toyota RAV4  ○ NOT NEEDED │  │
│  │ Windshield          Yesterday  │  │
│  ├────────────────────────────────┤  │
│  │ 2022 Ford F-150  ◐ SELF-LEARN  │  │
│  │ Alignment           Mon        │  │
│  └────────────────────────────────┘  │
│  [ See all ]                         │
│                                      │
│  Offline ✓   Rules updated 10/28     │
└──────────────────────────────────────┘
```

Menu (☰): How to use · Check for updates · Disclaimer · Version

---

## 2. New Check (one scrolling page, three cards)

```
┌──────────────────────────────────────┐
│ ‹ Back          New check            │
├──────────────────────────────────────┤
│ ① VEHICLE                            │
│  VIN                                 │
│  [ _________________ ] [ ▌▌▐▌ scan ] │
│   ✓ Check digit OK                   │
│   Filled from VIN lookup — verify    │
│                                      │
│  Year [v 2021]   Make [v Honda]      │
│  Model ______    Trim ______         │
│  Plate ________  [ 📷 ]  (optional)  │
│                                      │
├──────────────────────────────────────┤
│ ② WHAT WAS DONE                      │
│  Repair / trigger                    │
│  [v Front bumper R&I            ]    │
│     · Front bumper R&I               │
│     · Rear bumper R&I                │
│     · Windshield replacement         │
│     · Wheel alignment                │
│     · Collision (structural)         │
│     · Module replacement             │
│     · Suspension / ride height       │
│     · Mirror / door / liftgate       │
│     · Other…                         │
│                                      │
│  Sensors on this vehicle             │
│  [x] Forward camera                  │
│  [x] Front radar                     │
│  [ ] Blind spot monitors             │
│  [x] Rear / backup camera            │
│  [ ] Surround-view cameras           │
│  [ ] Parking sensors                 │
│  [ ] Lane departure / keeping        │
│  [ ] Adaptive cruise                 │
│  [ ] Night vision                    │
│  [ ] Other…                          │
│  (pre-ticked from VIN when known)    │
│                                      │
│  Conditions                          │
│  [ ] Sensor / bracket disturbed      │
│  [ ] Airbag deployed                 │
│  [ ] Ride height changed             │
│                                      │
├──────────────────────────────────────┤
│ ③ EVIDENCE (optional)                │
│  [ 📷 Add photo ]  [ 🎤 Dictate note ]│
│  ┌────┐ ┌────┐ ┌────┐                │
│  │ #1 │ │ #2 │ │ +  │                │
│  └────┘ └────┘ └────┘                │
│  Shop quote lists: ☐ Forward camera  │
│  ☐ Front radar  ☐ Blind spot         │
│                                      │
│  [        Get ruling        ]        │
└──────────────────────────────────────┘
```

Notes
- "Shop quote lists" ticks what the shop is charging for, so the result can show a **match / mismatch** per sensor.
- VIN scan reuses the Collision-Voice barcode scanner (Code 39/128, Data Matrix, PDF417, QR; "Use a photo" fallback).
- Year/make/model auto-filled from NHTSA vPIC; only empty fields are filled, never overwritten silently.
- Photo capture and dictation are the same per-photo number + note pattern as Collision-Voice observations.

---

## 3. Scan VIN (full-screen)

```
┌──────────────────────────────────────┐
│ ✕                          [ 🔦 ]    │
│                                      │
│      ┌──────────────────────┐        │
│      │                      │        │
│      │   line up the VIN    │        │
│      │   barcode in here    │        │
│      │                      │        │
│      └──────────────────────┘        │
│                                      │
│   Door jamb sticker barcode works    │
│   best. Image is never saved.        │
│                                      │
│   [ Use a photo ]   [ Type VIN ]     │
└──────────────────────────────────────┘
```

---

## 4. Ruling

```
┌──────────────────────────────────────┐
│ ‹ Edit             Ruling            │
├──────────────────────────────────────┤
│ 2021 Honda Civic EX                  │
│ VIN 2HGFC…12345   Front bumper R&I   │
├──────────────────────────────────────┤
│ Forward camera                       │
│  ┌────────────────────────────────┐  │
│  │ ● CALIBRATION REQUIRED         │  │
│  │ Type: Static + dynamic         │  │
│  │ Shop quote: ✓ listed  — MATCH  │  │
│  │ Source: Honda position stmt.   │  │
│  │ Published 03/2024 · Verified   │  │
│  │ 10/2026   [ Open source ↗ ]    │  │
│  │ Confidence: High               │  │
│  └────────────────────────────────┘  │
│                                      │
│ Front radar                          │
│  ┌────────────────────────────────┐  │
│  │ ○ NOT REQUIRED                 │  │
│  │ Only if bracket disturbed      │  │
│  │ Shop quote: ✓ listed — CHALLENGE│ │
│  │ Source: Honda iN (cited)       │  │
│  │ Confidence: Medium             │  │
│  └────────────────────────────────┘  │
│                                      │
│ Rear camera                          │
│  ┌────────────────────────────────┐  │
│  │ ◐ SELF-LEARNING                │  │
│  │ Learns during normal driving   │  │
│  │ Source: …                      │  │
│  └────────────────────────────────┘  │
│                                      │
│ ⚠ No cited source found → shown as  │
│   "UNVERIFIED — ask OEM / shop".     │
│                                      │
│ [ Report ]   [ Save ]   [ New check ]│
└──────────────────────────────────────┘
```

Result states (always icon + word, never color alone)

| State | Icon | Meaning |
|---|---|---|
| Required | ● orange | OEM says calibrate (static, dynamic, or both) |
| Not required | ○ navy | OEM says nothing needed; citation mandatory |
| Self-learning | ◐ | System recalibrates itself |
| Unverified | ? grey | No cited source; never shown as "not needed" |

Quote comparison per sensor: **MATCH** (required & quoted), **CHALLENGE** (quoted but not required), **MISSING** (required but not quoted).

---

## 5. Report (printable / shareable)

```
┌──────────────────────────────────────┐
│ [logo] TrueCal Calibration Report    │
│ Date · Checked by · Claim / RO #     │
├──────────────────────────────────────┤
│ Vehicle: 2021 Honda Civic EX         │
│ VIN: 2HGFC…12345   Plate: ABC-1234   │
│ Repair: Front bumper R&I             │
├──────────────────────────────────────┤
│ Sensor        Ruling    Quote  Result│
│ Fwd camera    Required  Yes    Match │
│ Front radar   Not req.  Yes    Chall.│
│ Rear camera   Self-lrn  No     OK    │
├──────────────────────────────────────┤
│ Sources (with dates)                 │
│  1. Honda position statement 03/2024 │
│  2. Honda iN doc …                   │
├──────────────────────────────────────┤
│ Photos #1–#3 · Notes                 │
├──────────────────────────────────────┤
│ Disclaimer: informational; always    │
│ confirm against current OEM service  │
│ information.                         │
└──────────────────────────────────────┘
 [ Share ]  [ Print / PDF ]  [ Done ]
```

---

## 6. Past Checks

```
┌──────────────────────────────────────┐
│ ‹ Back       Past checks             │
│ Search VIN / plate / claim ____ 🔍   │
│ Filter: [v All results] [v Any make] │
├──────────────────────────────────────┤
│ 2021 Honda Civic  ● 2 req · 1 chall. │
│ 2019 Toyota RAV4  ○ none required    │
│ …                                    │
└──────────────────────────────────────┘
```

---

## Data model mapping (from the overview doc)

| Screen field | Model entity |
|---|---|
| VIN, year, make, model, trim | Vehicle |
| Sensors ticked | ADAS system |
| Repair / trigger, conditions | Trigger event |
| Required / Not required / Self-learning, static/dynamic | Calibration type |
| Source link, publish date, retrieved date | Source |
| Confidence, notes, last verified | Rule extras |

Lookup key: Vehicle + ADAS system + Trigger event → Calibration type + Source.

---

## PWA essentials

- Installable (manifest + icons in [icons/](./icons)), standalone display, navy `#10243E` splash.
- Works offline for saved rules and past checks; VIN decode and rule refresh need a connection.
- Camera for VIN scan and photos; microphone for dictation. Images never leave the device unless shared.
- Rules and sources carry a "last verified" date, shown on every ruling.

## Open questions

1. Who uses it: us checking shop quotes, or adjusters and customers too?
2. Which makes first, and which triggers (bumper R&I, windshield, alignment)?
3. Public OEM documents first, or licensed data (Opus IVS, Mitchell, CCC) from day one?
4. Should "Get ruling" work offline from a bundled rule set, or always call a server?
