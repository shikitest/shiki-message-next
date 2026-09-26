# RandomIME lexicon sources

## JMdict

The generated file `js/ime/ime-lexicon-data.js` is derived from **JMdict_e**, a
Japanese–English lexical database maintained by the Electronic Dictionary
Research and Development Group (EDRDG).

- Official project: https://www.edrdg.org/jmdict/j_jmdict.html
- Official download: https://www.edrdg.org/pub/Nihongo/JMdict_e.gz
- Official licence statement: https://www.edrdg.org/edrdg/licence.html
- Licence: Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/

The generated lexicon data is distributed under CC BY-SA 4.0. The rest of the
application is not relicensed by this notice. EDRDG does not endorse this
project or its filtering and weighting choices.

The modern build profile can select 8,000 generated base entries by JMdict priority tags
(`ichi`, `news`, `spec`, `gai`, and `nf` rank), maps JMdict's detailed parts of
speech to RandomIME's small runtime POS set, applies proportional POS caps,
and removes archaic/rare and specialist entries. A small explicit field
allowlist keeps modern consumer vocabulary for computing, internet, games,
food, music, sports, phones/electronics, photo, film/TV, manga, clothing,
transport, art, and print. Readings are normalized to hiragana and assigned
conservative heuristic weights. These weights are **not corpus frequencies**,
and the source file is never truncated by JMdict document order. The Stage 6.3
8,000-entry trial was not adopted as runtime data because its fixed-seed
structural-quality proxy regressed. The checked-in runtime data therefore
remains the accepted 2,200-entry generated set while the scalable profile is
kept for later frequency-source improvements.

No example sentences, glosses, user messages, chat history, or conversation
templates are included in the generated browser data.
