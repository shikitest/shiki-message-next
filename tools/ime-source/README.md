# IME build source

Download the official English JMdict XML archive to this directory:

`https://www.edrdg.org/pub/Nihongo/JMdict_e.gz`

Expected local path: `tools/ime-source/JMdict_e.gz`

The archive is intentionally ignored by Git. It is a build input, not a browser
runtime dependency. Run the builder from the repository root:

```text
node tools/build-ime-lexicon.js
```

The generated browser data is written to `js/ime/ime-lexicon-data.js`.

The default keeps the accepted 2,200-entry runtime set. The rejected Stage 6.3
8,000-entry experiment can be reproduced to a separate preview file without
overwriting runtime data:

```text
node tools/build-ime-lexicon.js --profile modern --limit 8000 --output tools/ime-source/ime-lexicon-preview.js
```
