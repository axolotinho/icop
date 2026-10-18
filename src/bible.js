// [nome em português, nome em inglês (usado na API)]
const PARES = [
  ['Gênesis','genesis'],['Êxodo','exodus'],['Levítico','leviticus'],['Números','numbers'],['Deuteronômio','deuteronomy'],
  ['Josué','joshua'],['Juízes','judges'],['Rute','ruth'],['1 Samuel','1 samuel'],['2 Samuel','2 samuel'],
  ['1 Reis','1 kings'],['2 Reis','2 kings'],['1 Crônicas','1 chronicles'],['2 Crônicas','2 chronicles'],['Esdras','ezra'],
  ['Neemias','nehemiah'],['Ester','esther'],['Jó','job'],['Salmos','psalms'],['Provérbios','proverbs'],
  ['Eclesiastes','ecclesiastes'],['Cantares','song of solomon'],['Isaías','isaiah'],['Jeremias','jeremiah'],['Lamentações','lamentations'],
  ['Ezequiel','ezekiel'],['Daniel','daniel'],['Oseias','hosea'],['Joel','joel'],['Amós','amos'],
  ['Obadias','obadiah'],['Jonas','jonah'],['Miqueias','micah'],['Naum','nahum'],['Habacuque','habakkuk'],
  ['Sofonias','zephaniah'],['Ageu','haggai'],['Zacarias','zechariah'],['Malaquias','malachi'],
  ['Mateus','matthew'],['Marcos','mark'],['Lucas','luke'],['João','john'],['Atos','acts'],
  ['Romanos','romans'],['1 Coríntios','1 corinthians'],['2 Coríntios','2 corinthians'],['Gálatas','galatians'],['Efésios','ephesians'],
  ['Filipenses','philippians'],['Colossenses','colossians'],['1 Tessalonicenses','1 thessalonians'],['2 Tessalonicenses','2 thessalonians'],
  ['1 Timóteo','1 timothy'],['2 Timóteo','2 timothy'],['Tito','titus'],['Filemom','philemon'],['Hebreus','hebrews'],
  ['Tiago','james'],['1 Pedro','1 peter'],['2 Pedro','2 peter'],['1 João','1 john'],['2 João','2 john'],
  ['3 João','3 john'],['Judas','jude'],['Apocalipse','revelation'],
]

const CAPS = [
  50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,
  28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22,
]

// [nome em português, nome em inglês, nº de capítulos]
export const LIVROS = PARES.map(([pt, en], i) => [pt, en, CAPS[i]])
