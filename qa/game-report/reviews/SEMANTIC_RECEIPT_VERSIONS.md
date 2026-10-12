# Semantic receipt versions

`report-ui-integrity.cjs` writes its latest result to `report-ui-integrity.json`. That working receipt was rerun after the final Sources presentation and Houston-origin pose changes. Its current result checks Game Report JS `1e00bfaa…`, CSS `234141bc…`, report index `cd43314d…`, nine semantic regressions and all 444 report structures.

The final result is also saved as the versioned `report-ui-integrity-final-20261012.json` for the release packet. Earlier UI closure documents record the hashes and outcomes of the earlier working receipt; those historical hashes do not identify the current bytes at the mutable working filename. The earlier receipt binary was replaced by the rerun, so it is not presented as a separately preserved downloadable artifact.

Native preview/run folders, their original screenshots, source manifests and execution helpers remain separately versioned. The final native runs and independent current-source data/adapter/refresh receipts are the release acceptance gates.
