# replicad-opencascadejs (eigener Build)

OpenCascade als WebAssembly, gebaut aus replicad v1.1.0 plus zusätzlichen Bindungen
(heute `BRepAlgoAPI_Defeaturing` für „Fläche löschen“). Ersetzt das npm-Paket gleichen Namens
über `"replicad-opencascadejs": "file:vendor/replicad-opencascadejs"` in package.json.

Neu bauen: GitHub → Actions → OpenCascade-Build → Run workflow (ca. 15 min), dann

    gh run download <run-id> -n occt -D vendor/replicad-opencascadejs/dist

Lizenz: LGPL-2.1 (siehe LICENSE). Quelle: sgenoud/replicad, Konfiguration in
`.github/workflows/opencascade.yml`, Bauprotokoll in `dist/replicad_single.provenance.json`.
