# Publishing Checklist

## 1) Build release package

```bash
./build.sh
```

Expected output: `zotero-google-this-1.0.0.xpi`

## 2) Create a GitHub release

1. Tag: `v1.0.0`
2. Release title: `Google This v1.0.0`
3. Upload asset: `zotero-google-this-1.0.0.xpi`

The `updates.json` file expects this release URL:

`https://github.com/visser/zotero-google-this/releases/download/v1.0.0/zotero-google-this-1.0.0.xpi`

## 3) Verify update feed

`manifest.json` points to:

`https://raw.githubusercontent.com/visser/zotero-google-this/main/updates.json`

After publishing, verify that URL is reachable and returns valid JSON.

## 4) Install-test from released file

1. Zotero -> `Tools` -> `Plugins`
2. Gear icon -> `Install Plugin From File...`
3. Choose release `.xpi`
4. Check PDF and EPUB selection context menus show `Google this` at the top.
