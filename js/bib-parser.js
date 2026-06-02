/**
 * bib-parser.js
 * Parses papers.bib and powers the Research page.
 *
 * Custom BibTeX fields:
 *   abstract        -- paper abstract
 *   categories      -- comma-separated list
 *   publishedurl    -- URL to published version
 *   workingpaperurl -- URL to SSRN / arXiv / PDF
 *   ecnote          -- note about prior EC extended abstract
 */

'use strict';

/* ------------------------------------------------------------------ */
/*  Coauthor homepage links                                             */
/* ------------------------------------------------------------------ */
var COAUTHOR_LINKS = {
  'Avinatan Hassidim':      'https://u.cs.biu.ac.il/~avinatan/',
  'Ran I. Shorrer':         'https://rshorrer.weebly.com/',
  'Ori Heffetz':            'https://economics.cornell.edu/ori-heffetz',
  'Bnaya Dreyfuss':         'https://b3fuss.github.io/',
  'Itai Ashlagi':           'https://profiles.stanford.edu/itai-ashlagi',
  'Afshin Nikzad':          'https://dornsife.usc.edu/profile/afshin-nikzad/',
  'Yannai A. Gonczarowski': 'https://yannai.gonch.name/scientific/',
  'Noam Nisan':             'https://www.cs.huji.ac.il/~noam/',
  'Sandor Sovago':          'https://sovagos.github.io/',
  'Peter Biro':             'https://mechanismdesign.eu/biro/',
  'Mira Frick':             'https://economics.yale.edu/people/faculty/mira-frick',
  'Noga Alon':              'https://english.tau.ac.il/profile/nogaa',
  'Alvin E. Roth':          'https://web.stanford.edu/~alroth/',
  'Leon Y. Deouell':        'https://elsc.huji.ac.il/people-directory/faculty-members/leon-deouell/',
  'Sacha Bourgeois-Gironde': 'https://sites.google.com/view/sachaborgeoisgironde',
};

/* ------------------------------------------------------------------ */
/*  BibTeX parser                                                       */
/* ------------------------------------------------------------------ */

function extractValue(text, pos) {
  var ch = text[pos];
  if (ch === '{') {
    var depth = 0, i = pos, result = '';
    while (i < text.length) {
      if (text[i] === '{') {
        depth++;
        if (depth > 1) result += '{';   // preserve inner opening braces
        i++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) return { value: result, endIndex: i + 1 };
        result += text[i++];
      } else {
        result += text[i++];
      }
    }
  } else if (ch === '"') {
    var i2 = pos + 1, result2 = '';
    while (i2 < text.length && text[i2] !== '"') result2 += text[i2++];
    return { value: result2, endIndex: i2 + 1 };
  } else {
    var i3 = pos, result3 = '';
    while (i3 < text.length && /\d/.test(text[i3])) result3 += text[i3++];
    return { value: result3, endIndex: i3 };
  }
  return { value: '', endIndex: pos + 1 };
}

// Direct replacement table for LaTeX accent patterns
var LATEX_CHARS = {
  "{\\'a}": 'á', "{\\'e}": 'é', "{\\'i}": 'í',
  "{\\'o}": 'ó', "{\\'u}": 'ú', "{\\'y}": 'ý',
  "{\\'A}": 'Á', "{\\'E}": 'É', "{\\'I}": 'Í',
  "{\\'O}": 'Ó', "{\\'U}": 'Ú', "{\\'Y}": 'Ý',
  '{\\"{a}}': 'ä', '{\\"{e}}': 'ë', '{\\"{i}}': 'ï',
  '{\\"{o}}': 'ö', '{\\"{u}}': 'ü',
  '{\\"{A}}': 'Ä', '{\\"{E}}': 'Ë', '{\\"{O}}': 'Ö', '{\\"{U}}': 'Ü',
  '{\\"a}': 'ä', '{\\"e}': 'ë', '{\\"o}': 'ö', '{\\"u}': 'ü',
  '{\\"A}': 'Ä', '{\\"E}': 'Ë', '{\\"O}': 'Ö', '{\\"U}': 'Ü',
  '{\\ss}': 'ß',
  '{\\ae}': 'æ', '{\\AE}': 'Æ',
  '{\\oe}': 'œ', '{\\OE}': 'Œ',
  '{\\o}':  'ø', '{\\O}':  'Ø',
  "{\\~n}": 'ñ', "{\\~N}": 'Ñ',
  "{\\v{c}}": 'č', "{\\v{C}}": 'Č',
  "{\\v{s}}": 'š', "{\\v{S}}": 'Š',
  "{\\v{z}}": 'ž', "{\\v{Z}}": 'Ž',
};

// Build a simpler version with direct Unicode chars for the common accents
LATEX_CHARS["{\\'a}"] = 'á';  // a-acute
LATEX_CHARS["{\\'e}"] = 'é';  // e-acute
LATEX_CHARS["{\\'i}"] = 'í';  // i-acute
LATEX_CHARS["{\\'o}"] = 'ó';  // o-acute
LATEX_CHARS["{\\'u}"] = 'ú';  // u-acute
LATEX_CHARS["{\\'y}"] = 'ý';
LATEX_CHARS["{\\'A}"] = 'Á';
LATEX_CHARS["{\\'E}"] = 'É';
LATEX_CHARS["{\\'I}"] = 'Í';
LATEX_CHARS["{\\'O}"] = 'Ó';
LATEX_CHARS["{\\'U}"] = 'Ú';
LATEX_CHARS["{\\'Y}"] = 'Ý';

function cleanLatex(s) {
  if (!s) return '';
  // Apply direct replacements first (longest-match friendly: do in two passes)
  for (var key in LATEX_CHARS) {
    if (s.indexOf(key) !== -1) {
      s = s.split(key).join(LATEX_CHARS[key]);
    }
  }
  // Generic accent fallback: {\ACCENT LETTER} or \ACCENT{LETTER}
  s = s.replace(/\{\\['"`\^~=.]([a-zA-Z])\}/g, function(m, c) { return c; });
  s = s.replace(/\\['"`\^~=.]\{([a-zA-Z])\}/g, function(m, c) { return c; });
  s = s.replace(/\\['"`\^~=.]([a-zA-Z])/g,     function(m, c) { return c; });
  // Dashes and quotes
  s = s.replace(/---/g, '—');
  s = s.replace(/--/g,  '–');
  s = s.replace(/``/g,  '“');
  s = s.replace(/''/g,  '”');
  s = s.replace(/\\&/g, '&');
  s = s.replace(/\\ldots/g, '…');
  // LaTeX commands
  s = s.replace(/\\textit\{([^}]*)\}/g, '$1');
  s = s.replace(/\\textbf\{([^}]*)\}/g, '$1');
  s = s.replace(/\\emph\{([^}]*)\}/g,   '$1');
  // Strip remaining braces
  s = s.replace(/\{([^{}]*)\}/g, '$1');
  s = s.replace(/\{([^{}]*)\}/g, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function parseBibTeX(text) {
  var entries = [];
  var i = 0;
  while (i < text.length) {
    var atPos = text.indexOf('@', i);
    if (atPos === -1) break;
    i = atPos + 1;
    var typeMatch = text.slice(i).match(/^([a-zA-Z]+)\s*\{/);
    if (!typeMatch) continue;
    var type = typeMatch[1].toLowerCase();
    i += typeMatch[0].length;
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    var keyEnd = text.indexOf(',', i);
    if (keyEnd === -1) continue;
    var key = text.slice(i, keyEnd).trim();
    i = keyEnd + 1;
    var fields = { _type: type, _key: key };
    while (i < text.length) {
      while (i < text.length && /[\s,]/.test(text[i])) i++;
      if (i >= text.length) break;
      if (text[i] === '}') { i++; break; }
      var nameMatch = text.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
      if (!nameMatch) { i++; continue; }
      var fieldName = nameMatch[1].toLowerCase();
      i += nameMatch[0].length;
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length) break;
      var extracted = extractValue(text, i);
      fields[fieldName] = extracted.value;
      i = extracted.endIndex;
    }
    entries.push(fields);
  }
  return entries;
}

function parseAuthors(authorStr) {
  if (!authorStr) return [];
  return authorStr.split(/\s+and\s+/i).map(function(a) {
    return cleanLatex(a.trim());
  });
}

function normalizeAuthorName(raw) {
  if (raw.indexOf(',') !== -1) {
    var parts = raw.split(',');
    var last  = parts[0].trim();
    var first = parts[1] ? parts[1].trim() : '';
    return first ? first + ' ' + last : last;
  }
  return raw;
}

function asciiFold(s) {
  return s
    .replace(/[áàâäã]/g, 'a')
    .replace(/[ÁÀÂÄÃ]/g, 'A')
    .replace(/[éèêë]/g, 'e')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[íìîï]/g, 'i')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[óòôöõ]/g, 'o')
    .replace(/[ÓÒÔÖÕ]/g, 'O')
    .replace(/[úùûü]/g, 'u')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/ß/g, 'ss');
}

function renderAuthor(name) {
  var norm = normalizeAuthorName(name);
  var link = COAUTHOR_LINKS[norm] || COAUTHOR_LINKS[asciiFold(norm)];
  if (norm === 'Assaf Romm') return norm;
  if (link) return '<a href="' + link + '" target="_blank" rel="noopener">' + norm + '</a>';
  return norm;
}

function catClass(cat) {
  return 'tag-' + cat.trim().toLowerCase().replace(/\s+/g, '-');
}

function formatCitation(e) {
  var authors = parseAuthors(e.author).map(normalizeAuthorName).join(', ');
  var title   = cleanLatex(e.title || '');
  var year    = e.year || '';
  if (e._type === 'article') {
    var vol   = e.volume  ? ', ' + e.volume                    : '';
    var num   = e.number  ? '(' + e.number + ')'               : '';
    var pages = e.pages   ? ', ' + cleanLatex(e.pages)         : '';
    var doi   = e.doi     ? '. DOI: ' + e.doi                  : '';
    var j     = cleanLatex(e.journal || '');
    return authors + '. ' + year + '. "' + title + '." ' + j + vol + num + pages + doi + '.';
  }
  if (e._type === 'inproceedings') {
    var bt = cleanLatex(e.booktitle || '');
    return authors + '. ' + year + '. "' + title + '." In ' + bt + '.';
  }
  var note = cleanLatex(e.note || 'Working Paper');
  return authors + '. ' + year + '. "' + title + '." ' + note + '.';
}

function formatBibTeX(e) {
  var skip = ['abstract','categories','publishedurl','workingpaperurl','ecnote','_type','_key'];
  var lines = [];
  for (var k in e) {
    if (skip.indexOf(k) === -1) {
      lines.push('  ' + k.padEnd(16) + ' = {' + e[k] + '}');
    }
  }
  return '@' + e._type + '{' + e._key + ',\n' + lines.join(',\n') + '\n}';
}

/* ------------------------------------------------------------------ */
/*  DOM rendering                                                       */
/* ------------------------------------------------------------------ */
var ALL_ENTRIES = [];

function renderPapers(entries) {
  var byYear = {};
  for (var i = 0; i < entries.length; i++) {
    var y = parseInt(entries[i].year) || 0;
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(entries[i]);
  }
  var years = Object.keys(byYear).map(Number).sort(function(a,b){ return b-a; });
  var container = document.getElementById('papers-container');
  container.innerHTML = '';
  if (entries.length === 0) {
    container.innerHTML = '<div class="no-results">No papers match your search.</div>';
    document.getElementById('paper-count').textContent = '';
    return;
  }
  var total = entries.length;
  document.getElementById('paper-count').textContent =
    'Showing ' + total + ' paper' + (total !== 1 ? 's' : '');
  for (var yi = 0; yi < years.length; yi++) {
    var year = years[yi];
    var group = document.createElement('div');
    group.className = 'year-group';
    var heading = document.createElement('div');
    heading.className = 'year-heading';
    heading.textContent = year === 0 ? 'Undated' : String(year);
    group.appendChild(heading);
    var papers = byYear[year];
    for (var pi = 0; pi < papers.length; pi++) {
      group.appendChild(renderCard(papers[pi]));
    }
    container.appendChild(group);
  }
}

function renderCard(e) {
  var card = document.createElement('div');
  card.className = 'paper-card';
  card.dataset.key = e._key;

  var title   = cleanLatex(e.title || 'Untitled');
  var authors = parseAuthors(e.author || '');
  var cats    = (e.categories || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);

  // Venue
  var venue = '';
  if (e._type === 'article') {
    var j     = cleanLatex(e.journal || '');
    var parts = [j];
    if (e.volume) parts.push('vol. ' + e.volume);
    if (e.number) parts.push('no. ' + e.number);
    if (e.pages)  parts.push('pp. ' + cleanLatex(e.pages));
    if (e.year)   parts.push(e.year);
    venue = parts.join(', ');
  } else if (e._type === 'inproceedings') {
    venue = cleanLatex(e.booktitle || '');
    if (e.year) venue += ' (' + e.year + ')';
  } else {
    venue = cleanLatex(e.note || 'Working Paper');
    if (e.year) venue += ' (' + e.year + ')';
  }

  // Title link
  var titleLink = e.publishedurl || e.workingpaperurl || '';
  var titleHtml = titleLink
    ? '<a href="' + titleLink + '" target="_blank" rel="noopener">' + title + '</a>'
    : title;

  // Authors
  var authorsHtml = authors.map(renderAuthor).join(', ');

  // Tags
  var tagsHtml = cats.map(function(cat) {
    return '<span class="tag ' + catClass(cat) + '" data-cat="' + cat + '">' + cat + '</span>';
  }).join('');

  // Venue HTML
  var venueParts    = venue.split(', ');
  var venueNamePart = venueParts.shift();
  var venueRest     = venueParts.length ? ', ' + venueParts.join(', ') : '';
  var venueHtml     = '<span class="venue-name">' + venueNamePart + '</span>' + venueRest;

  // EC note
  var ecHtml = e.ecnote
    ? '<div class="paper-ecnote">' + cleanLatex(e.ecnote) + '</div>'
    : '';

  // Buttons
  var pubBtn = e.publishedurl
    ? '<a href="' + e.publishedurl + '" target="_blank" rel="noopener" class="btn btn-sm btn-outline">Published version</a>'
    : '';
  var wpBtn  = e.workingpaperurl
    ? '<a href="' + e.workingpaperurl + '" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">Working paper</a>'
    : '';

  var abstractText = cleanLatex(e.abstract || 'No abstract available.');

  card.innerHTML =
    '<div class="paper-title">' + titleHtml + '</div>' +
    '<div class="paper-authors">' + authorsHtml + '</div>' +
    '<div class="paper-venue">' + venueHtml + '</div>' +
    ecHtml +
    (tagsHtml ? '<div class="paper-tags">' + tagsHtml + '</div>' : '') +
    '<div class="paper-actions">' +
      '<button class="btn btn-sm btn-ghost abstract-toggle" data-key="' + e._key + '">Abstract ▾</button>' +
      '<button class="btn btn-sm btn-ghost cite-btn" data-key="' + e._key + '">Cite</button>' +
      pubBtn + wpBtn +
    '</div>' +
    '<div class="abstract-wrap" id="abstract-' + e._key + '">' + abstractText + '</div>';

  // Tag click -> filter
  var tagEls = card.querySelectorAll('.tag[data-cat]');
  for (var ti = 0; ti < tagEls.length; ti++) {
    tagEls[ti].addEventListener('click', (function(cat) {
      return function(ev) { ev.stopPropagation(); applyCategoryFilter(cat); };
    })(tagEls[ti].dataset.cat));
  }

  return card;
}

/* ------------------------------------------------------------------ */
/*  Coauthor dropdown builder                                           */
/* ------------------------------------------------------------------ */
function buildCoauthorDropdown() {
  var counts = {};
  for (var i = 0; i < ALL_ENTRIES.length; i++) {
    var authors = parseAuthors(ALL_ENTRIES[i].author || '');
    for (var j = 0; j < authors.length; j++) {
      var norm = normalizeAuthorName(authors[j]);
      if (norm !== 'Assaf Romm') {
        counts[norm] = (counts[norm] || 0) + 1;
      }
    }
  }
  var names = Object.keys(counts).sort(function(a, b) {
    var la = a.split(' ').pop().toLowerCase();
    var lb = b.split(' ').pop().toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  var sel = document.getElementById('coauthor-filter');
  if (!sel) return;
  names.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

/* ------------------------------------------------------------------ */
/*  Filter / search                                                     */
/* ------------------------------------------------------------------ */
function getFilteredEntries() {
  var q       = (document.getElementById('search-input').value || '').toLowerCase().trim();
  var yearMin = parseInt(document.getElementById('year-min').value) || 0;
  var yearMax = parseInt(document.getElementById('year-max').value) || 9999;
  var catCBs  = document.querySelectorAll('.cat-filter:checked');
  var checkedCats = [];
  for (var i = 0; i < catCBs.length; i++) checkedCats.push(catCBs[i].value);
  var selCoauthor = (document.getElementById('coauthor-filter').value || '').trim();

  return ALL_ENTRIES.filter(function(e) {
    var year = parseInt(e.year) || 0;
    if (year < yearMin || year > yearMax) return false;
    if (checkedCats.length > 0) {
      var eCats = (e.categories || '').split(',').map(function(s){ return s.trim(); });
      var found = false;
      for (var i = 0; i < checkedCats.length; i++) {
        if (eCats.indexOf(checkedCats[i]) !== -1) { found = true; break; }
      }
      if (!found) return false;
    }
    if (selCoauthor) {
      var paperAuthors = parseAuthors(e.author || '').map(normalizeAuthorName);
      if (paperAuthors.indexOf(selCoauthor) === -1) return false;
    }
    if (q) {
      var blob = [
        cleanLatex(e.title || ''),
        cleanLatex(e.author || ''),
        cleanLatex(e.abstract || ''),
        cleanLatex(e.journal || ''),
        cleanLatex(e.booktitle || ''),
        e.year || ''
      ].join(' ').toLowerCase();
      if (blob.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function refresh() { renderPapers(getFilteredEntries()); }

function applyCategoryFilter(cat) {
  document.getElementById('filter-panel').classList.add('open');
  var cbs = document.querySelectorAll('.cat-filter');
  for (var i = 0; i < cbs.length; i++) cbs[i].checked = (cbs[i].value === cat);
  refresh();
  document.getElementById('filter-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------------------------------------------ */
/*  Cite modal                                                          */
/* ------------------------------------------------------------------ */
function openCiteModal(key) {
  var e = null;
  for (var i = 0; i < ALL_ENTRIES.length; i++) {
    if (ALL_ENTRIES[i]._key === key) { e = ALL_ENTRIES[i]; break; }
  }
  if (!e) return;
  document.getElementById('cite-citation').textContent = formatCitation(e);
  document.getElementById('cite-bibtex').textContent   = formatBibTeX(e);
  document.getElementById('cite-modal').classList.add('open');
}

/* ------------------------------------------------------------------ */
/*  Init                                                                */
/* ------------------------------------------------------------------ */
async function init() {
  var bibText = '';
  try {
    var r = await fetch('papers.bib');
    if (r.ok) bibText = await r.text();
    else if (typeof BIBTEX_DATA !== 'undefined') bibText = BIBTEX_DATA;
  } catch(_) {
    if (typeof BIBTEX_DATA !== 'undefined') bibText = BIBTEX_DATA;
  }
  if (!bibText) {
    document.getElementById('papers-container').innerHTML =
      '<div class="no-results">Could not load papers.bib. ' +
      'Serve this site via a local HTTP server (e.g. <code>python -m http.server</code>).</div>';
    return;
  }

  ALL_ENTRIES = parseBibTeX(bibText).filter(function(e) {
    return e._type !== 'comment' && e._type !== 'string' && e._type !== 'preamble';
  });

  var years = ALL_ENTRIES.map(function(e){ return parseInt(e.year); }).filter(Boolean);
  if (years.length) {
    document.getElementById('year-min').placeholder = Math.min.apply(null, years);
    document.getElementById('year-max').placeholder = Math.max.apply(null, years);
  }

  buildCoauthorDropdown();
  renderPapers(ALL_ENTRIES);

  // --- Controls ---
  document.getElementById('search-btn').addEventListener('click', function() {
    document.getElementById('search-wrap').classList.toggle('open');
    if (document.getElementById('search-wrap').classList.contains('open')) {
      document.getElementById('search-input').focus();
    }
  });
  document.getElementById('search-input').addEventListener('input', refresh);
  document.getElementById('filter-btn').addEventListener('click', function() {
    document.getElementById('filter-panel').classList.toggle('open');
  });
  var filterInputs = document.querySelectorAll('.cat-filter, #year-min, #year-max, #coauthor-filter');
  for (var i = 0; i < filterInputs.length; i++) {
    filterInputs[i].addEventListener('change', refresh);
    filterInputs[i].addEventListener('input',  refresh);
  }
  document.getElementById('clear-filters').addEventListener('click', function() {
    var cbs = document.querySelectorAll('.cat-filter');
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
    document.getElementById('year-min').value = '';
    document.getElementById('year-max').value = '';
    document.getElementById('search-input').value = '';
    document.getElementById('coauthor-filter').value = '';
    refresh();
  });

  // Abstract / Cite (delegated)
  document.getElementById('papers-container').addEventListener('click', function(ev) {
    var btn = ev.target.closest('.abstract-toggle');
    if (btn) {
      var key  = btn.dataset.key;
      var wrap = document.getElementById('abstract-' + key);
      var open = wrap.classList.toggle('open');
      btn.textContent = open ? 'Abstract ▴' : 'Abstract ▾';
      return;
    }
    var citeBtn = ev.target.closest('.cite-btn');
    if (citeBtn) openCiteModal(citeBtn.dataset.key);
  });

  // Modal
  document.getElementById('cite-modal').addEventListener('click', function(ev) {
    if (ev.target === document.getElementById('cite-modal')) {
      document.getElementById('cite-modal').classList.remove('open');
    }
  });
  document.getElementById('cite-close').addEventListener('click', function() {
    document.getElementById('cite-modal').classList.remove('open');
  });
  document.getElementById('copy-citation-btn').addEventListener('click', function() {
    var text = document.getElementById('cite-citation').textContent;
    navigator.clipboard.writeText(text).then(function() {
      document.getElementById('copy-citation-btn').textContent = 'Copied!';
      setTimeout(function() {
        document.getElementById('copy-citation-btn').textContent = 'Copy citation';
      }, 1500);
    });
  });
  document.getElementById('copy-bibtex-btn').addEventListener('click', function() {
    var text = document.getElementById('cite-bibtex').textContent;
    navigator.clipboard.writeText(text).then(function() {
      document.getElementById('copy-bibtex-btn').textContent = 'Copied!';
      setTimeout(function() {
        document.getElementById('copy-bibtex-btn').textContent = 'Copy BibTeX';
      }, 1500);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
