const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "paperko.library.v1";
const HIGHLIGHT_KEY = "paperko.highlights.v1";
const FILE_DB_NAME = "paperko-files";
const FILE_STORE_NAME = "pdfs";
const TRENDING_KEY = "paperko.trending.v2";
const ANALYSIS_KEY = "paperko.analysis.v1";
const TRANSLATION_CACHE_KEY = "paperko.translations.v1";
const RESEARCH_SOURCES = {
  arxiv: { id: "S4306400194", label: "arXiv" },
  neurips: { id: "S4363606243", label: "NeurIPS" },
  icml: { id: "S4306419644", label: "ICML" },
  iclr: { id: "S4306419637", label: "ICLR" },
  aaai: { id: "S4210191458", label: "AAAI" },
};
const FEATURED_PAPERS = {
  mustRead: [
    { title: "Attention Is All You Need", authors: "Vaswani et al. · 2017", url: "https://arxiv.org/abs/1706.03762", source: "Transformer" },
    { title: "BERT: Pre-training of Deep Bidirectional Transformers", authors: "Devlin et al. · 2018", url: "https://arxiv.org/abs/1810.04805", source: "NLP" },
    { title: "Learning Transferable Visual Models From Natural Language Supervision", authors: "Radford et al. · 2021", url: "https://arxiv.org/abs/2103.00020", source: "Multimodal" },
    { title: "Denoising Diffusion Probabilistic Models", authors: "Ho et al. · 2020", url: "https://arxiv.org/abs/2006.11239", source: "Generative AI" },
  ],
  security: [
    { title: "Explaining and Harnessing Adversarial Examples", authors: "Goodfellow et al. · 2014", url: "https://arxiv.org/abs/1412.6572", source: "Adversarial ML" },
    { title: "SoK: Security and Privacy in Machine Learning", authors: "Biggio et al. · 2018", url: "https://arxiv.org/abs/1802.04989", source: "ML Security" },
    { title: "BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain", authors: "Gu et al. · 2017", url: "https://arxiv.org/abs/1708.06733", source: "Backdoor" },
    { title: "Membership Inference Attacks Against Machine Learning Models", authors: "Shokri et al. · 2017", url: "https://arxiv.org/abs/1610.05820", source: "Privacy" },
  ],
};
const state = {
  file: null,
  demo: true,
  pdfUrl: null,
  library: null,
  activeFolder: "all",
  readFolder: "all",
  paperFilter: "all",
  selectedGraphId: null,
  currentPaperId: "attention",
  trendingSource: "all",
  pdfDocument: null,
  currentPdfPage: 1,
  analyzedParagraphs: [],
  highlights: {},
};
const baseSegmentHtml = $$('.segment-card').map((card) => ({
  source: $('.source-block p', card)?.innerHTML || "",
  translation: $('.translation-block p', card)?.innerHTML || "",
}));
const baseStreamSectionsHtml = $$('.translation-stream .stream-section').map((section) => section.outerHTML).join("");

function seedLibrary() {
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  return {
    folders: ["AI · 머신러닝", "의료 · 바이오", "읽는 중"],
    papers: [
      { id: "attention", title: "Attention Is All You Need", authors: "Vaswani et al.", year: "2017", folder: "AI · 머신러닝", field: "컴퓨터과학·AI", status: "complete", progress: 100, updatedAt: ago(0), tags: ["transformer", "attention", "translation", "deep learning"] },
      { id: "bert", title: "BERT: Pre-training of Deep Bidirectional Transformers", authors: "Devlin et al.", year: "2018", folder: "AI · 머신러닝", field: "컴퓨터과학·AI", status: "complete", progress: 100, updatedAt: ago(1), tags: ["transformer", "language model", "pre-training", "deep learning"] },
      { id: "resnet", title: "Deep Residual Learning for Image Recognition", authors: "He et al.", year: "2015", folder: "읽는 중", field: "컴퓨터과학·AI", status: "reading", progress: 76, updatedAt: ago(3), tags: ["computer vision", "deep learning", "residual network"] },
      { id: "alphafold", title: "Highly accurate protein structure prediction", authors: "Jumper et al.", year: "2021", folder: "의료 · 바이오", field: "의학·생명과학", status: "reading", progress: 42, updatedAt: ago(5), tags: ["protein", "structure prediction", "deep learning", "biology"] },
    ],
  };
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.papers && saved?.folders) return saved;
  } catch (error) {
    console.warn("Saved library could not be read", error);
  }
  const initial = seedLibrary();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveLibrary() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.library));
}

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) request.result.createObjectStore(FILE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePdfFile(paperId, file) {
  const database = await openFileDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).put(file, paperId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function loadPdfFile(paperId) {
  const database = await openFileDatabase();
  const file = await new Promise((resolve, reject) => {
    const request = database.transaction(FILE_STORE_NAME, "readonly").objectStore(FILE_STORE_NAME).get(paperId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
}

async function deletePdfFile(paperId) {
  const database = await openFileDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).delete(paperId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

function groupLinesByIndent(lines, { indentThreshold = 12, gapThreshold = 8 } = {}) {
  const paragraphs = [];
  let current = [];
  const flush = () => { if (current.length) paragraphs.push(current.join(" ").replace(/\s+/g, " ").trim()); current = []; };
  lines.forEach((line) => {
    const item = typeof line === "string" ? { text: line, indent: 0, gapBefore: 0 } : line;
    const text = String(item?.text || "").trim();
    if (!text) { flush(); return; }
    if (current.length && (Number(item.indent || 0) >= indentThreshold || Number(item.gapBefore || 0) >= gapThreshold)) flush();
    current.push(text);
  });
  flush();
  return paragraphs;
}
window.PaperKoParagraphs = { groupLinesByIndent };

const KNOWLEDGE_GLOSSARY = [
  { pattern: /transformer/i, term: "Transformer", description: "어텐션을 중심으로 입력 토큰 사이의 관계를 병렬 처리하는 신경망 구조입니다." },
  { pattern: /attention/i, term: "Attention", description: "현재 토큰을 이해할 때 입력의 어느 부분을 얼마나 참고할지 계산하는 메커니즘입니다." },
  { pattern: /embedding/i, term: "Embedding", description: "단어나 개체를 의미 관계가 보존되는 숫자 벡터로 표현하는 방법입니다." },
  { pattern: /token/i, term: "Token", description: "모델이 텍스트를 처리하기 위해 나눈 기본 단위로, 단어 또는 단어 조각일 수 있습니다." },
  { pattern: /pre-?train/i, term: "Pre-training", description: "대규모 데이터로 일반적인 패턴을 먼저 학습하는 단계입니다." },
  { pattern: /fine-?tun/i, term: "Fine-tuning", description: "사전 학습된 모델을 특정 과제나 데이터에 맞게 추가 학습하는 과정입니다." },
  { pattern: /inference/i, term: "Inference", description: "학습된 모델이 새로운 입력을 받아 예측이나 생성을 수행하는 단계입니다." },
  { pattern: /benchmark/i, term: "Benchmark", description: "모델이나 방법의 성능을 동일한 조건에서 비교하기 위한 데이터셋과 평가 절차입니다." },
  { pattern: /dataset|corpus/i, term: "Dataset · Corpus", description: "학습 또는 평가에 사용하는 구조화된 데이터 모음입니다." },
  { pattern: /ablation/i, term: "Ablation study", description: "구성 요소를 하나씩 제거해 각 요소가 결과에 미치는 영향을 확인하는 실험입니다." },
  { pattern: /loss function|objective/i, term: "Loss function", description: "모델의 예측과 정답 사이의 오차를 수치화해 학습 방향을 정하는 함수입니다." },
  { pattern: /gradient/i, term: "Gradient", description: "손실을 줄이기 위해 모델 파라미터를 어느 방향으로 바꿀지 나타내는 변화율입니다." },
  { pattern: /convolution/i, term: "Convolution", description: "국소 패턴을 공유 가중치로 추출하는 연산으로 이미지와 시계열 처리에 널리 쓰입니다." },
  { pattern: /recurrent|RNN/i, term: "Recurrent network", description: "이전 단계의 상태를 다음 단계로 전달하며 순차 데이터를 처리하는 신경망입니다." },
];

function loadAnalyses() {
  try { return JSON.parse(localStorage.getItem(ANALYSIS_KEY)) || {}; }
  catch (error) { console.warn("Saved analyses could not be read", error); return {}; }
}

function saveCurrentAnalysis() {
  if (!state.currentPaperId || !state.analyzedParagraphs.length) return;
  try {
    const analyses = loadAnalyses();
    analyses[state.currentPaperId] = state.analyzedParagraphs;
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analyses));
  } catch (error) {
    console.warn("Paragraph analysis could not be persisted", error);
  }
}

function relatedKnowledge(text) {
  return KNOWLEDGE_GLOSSARY.filter((item) => item.pattern.test(text)).slice(0, 4);
}

function enhanceSampleKnowledge() {
  $$('.segment-card:not(.analyzed-segment)').forEach((card) => {
    if ($('.knowledge-panel', card)) return;
    const source = $('.source-block p', card)?.textContent || "";
    const knowledge = relatedKnowledge(source);
    if (!knowledge.length) return;
    const panel = document.createElement("div");
    panel.className = "knowledge-panel";
    panel.hidden = true;
    panel.innerHTML = knowledge.map((item) => `<article><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.description)}</p></article>`).join("");
    card.querySelector("footer").before(panel);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knowledge-toggle";
    button.textContent = "기초 용어";
    card.querySelector("footer").prepend(button);
  });
}

function lineText(items) {
  return items.sort((a, b) => a.x - b.x).reduce((text, item) => {
    if (!text) return item.text;
    if (text.endsWith("-") && /^[a-z]/i.test(item.text)) return `${text.slice(0, -1)}${item.text}`;
    return `${text} ${item.text}`;
  }, "").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function pdfItemsToParagraphs(items, pageNumber, pageWidth) {
  const normalized = items.map((item) => ({ text: String(item.str || "").trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: Math.max(item.width || 0, 2), height: Math.max(Math.abs(item.transform?.[3] || item.height || 10), 6) })).filter((item) => item.text);
  const rows = [];
  normalized.forEach((item) => {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2.5, item.height * .3));
    if (row) { row.items.push(item); row.y = (row.y + item.y) / 2; }
    else rows.push({ y: item.y, items: [item] });
  });
  const lines = [];
  rows.forEach((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let group = [];
    sorted.forEach((item) => {
      const previous = group[group.length - 1];
      if (previous && item.x - (previous.x + previous.width) > Math.max(52, previous.height * 5)) {
        lines.push(group);
        group = [];
      }
      group.push(item);
    });
    if (group.length) lines.push(group);
  });
  const mapped = lines.map((group) => {
    const x = Math.min(...group.map((item) => item.x));
    const right = Math.max(...group.map((item) => item.x + item.width));
    const y = Math.min(...group.map((item) => item.y));
    const height = Math.max(...group.map((item) => item.height));
    const width = right - x;
    const column = width > pageWidth * .62 ? "wide" : x + width / 2 < pageWidth / 2 ? "left" : "right";
    return { text: lineText(group), x, y, width, height, column };
  });
  const byY = (a, b) => b.y - a.y || a.x - b.x;
  const wide = mapped.filter((line) => line.column === "wide").sort(byY);
  const left = mapped.filter((line) => line.column === "left").sort(byY);
  const right = mapped.filter((line) => line.column === "right").sort(byY);
  const ordered = left.length > 5 && right.length > 5 ? [...wide, ...left, ...right] : mapped.sort(byY);
  const paragraphs = [];
  let current = null;
  ordered.forEach((line) => {
    if (!line.text) return;
    const verticalGap = current ? Math.abs(current.lastY - line.y) : 0;
    const changedColumn = current && current.column !== line.column;
    const indented = current && line.x - current.baseX > Math.max(11, line.height * .8);
    const separated = current && verticalGap > Math.max(18, line.height * 1.7);
    if (!current || changedColumn || indented || separated) {
      current = { page: pageNumber, text: line.text, boxes: [{ x: line.x, y: line.y, width: line.width, height: line.height }], baseX: line.x, lastY: line.y, column: line.column };
      paragraphs.push(current);
    } else {
      current.text = current.text.endsWith("-") ? `${current.text.slice(0, -1)}${line.text}` : `${current.text} ${line.text}`;
      current.boxes.push({ x: line.x, y: line.y, width: line.width, height: line.height });
      current.lastY = line.y;
    }
  });
  return paragraphs.filter((paragraph) => paragraph.text.length >= 35 && /[A-Za-z가-힣]/.test(paragraph.text)).map((paragraph) => ({ page: paragraph.page, source: paragraph.text.replace(/\s+/g, " ").trim(), translation: "", translationStatus: "pending", boxes: paragraph.boxes, knowledge: relatedKnowledge(paragraph.text) }));
}

async function loadPdfDocument(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js is unavailable");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  state.pdfDocument = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  state.currentPdfPage = 1;
  return state.pdfDocument;
}

async function extractPdfParagraphs(file) {
  const document = await loadPdfDocument(file);
  const paragraphs = [];
  for (let pageNumber = 1; pageNumber <= document.numPages && paragraphs.length < 160; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    paragraphs.push(...pdfItemsToParagraphs(content.items, pageNumber, viewport.width));
  }
  return paragraphs.slice(0, 160);
}

function utf8Length(text) {
  return new TextEncoder().encode(text).length;
}

function translationChunks(text, limit = 440) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";
  sentences.forEach((sentence) => {
    const candidate = `${current} ${sentence}`.trim();
    if (utf8Length(candidate) <= limit) { current = candidate; return; }
    if (current) chunks.push(current);
    const words = sentence.trim().split(/\s+/);
    current = "";
    words.forEach((word) => {
      const next = `${current} ${word}`.trim();
      if (utf8Length(next) > limit && current) { chunks.push(current); current = word; }
      else current = next;
    });
  });
  if (current) chunks.push(current);
  return chunks;
}

async function translateText(text) {
  const cache = (() => { try { return JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY)) || {}; } catch { return {}; } })();
  if (cache[text]) return cache[text];
  const translated = [];
  for (const chunk of translationChunks(text)) {
    const params = new URLSearchParams({ q: chunk, langpair: "en|ko", mt: "1" });
    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    const payload = await response.json();
    if (!response.ok || payload.responseStatus >= 400 || !payload.responseData?.translatedText) throw new Error(payload.responseDetails || "Translation failed");
    translated.push(payload.responseData.translatedText);
  }
  const result = translated.join(" ").trim();
  cache[text] = result;
  localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
  return result;
}

function paragraphCard(paragraph, index) {
  const knowledge = paragraph.knowledge?.length ? paragraph.knowledge.map((item) => `<article><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.description)}</p></article>`).join("") : '<p class="knowledge-empty">이 문단에서 별도의 기초 용어를 찾지 못했습니다.</p>';
  const translation = paragraph.translation ? escapeHtml(paragraph.translation) : paragraph.translationStatus === "loading" ? "문단의 맥락을 유지해 번역하고 있습니다…" : "아직 번역하지 않은 문단입니다.";
  return `<article class="segment-card analyzed-segment ${index === 0 ? "active" : ""}" data-page="${paragraph.page}" data-paragraph-index="${index}"><header><span class="segment-no">문단 ${String(index + 1).padStart(2, "0")}</span><span class="page-chip">p.${paragraph.page}</span><span class="mapping-ready">원문 위치 연결됨</span></header><div class="source-block"><span>원문</span><p>${escapeHtml(paragraph.source)}</p></div><div class="translation-block ${paragraph.translation ? "" : "is-pending"}"><span>한국어 번역</span><p class="translated-text">${translation}</p>${paragraph.translationStatus === "pending" || paragraph.translationStatus === "error" ? `<button class="translate-paragraph" data-translate-index="${index}">${paragraph.translationStatus === "error" ? "다시 번역" : "이 문단 번역"}</button>` : ""}</div><div class="knowledge-panel" hidden>${knowledge}</div><footer><span>문단 단위 · 원문 p.${paragraph.page}</span><button class="knowledge-toggle" type="button">기초 용어</button><button class="copy-translation" type="button">복사</button></footer></article>`;
}

function renderAnalyzedParagraphs(paragraphs) {
  state.analyzedParagraphs = paragraphs;
  const stream = $(".translation-stream");
  $$(".stream-section", stream).forEach((section) => section.remove());
  stream.insertAdjacentHTML("beforeend", `<section class="stream-section analyzed-section" id="abstract"><div class="stream-section-title"><span>EXTRACTED PARAGRAPHS</span><h2>문단별 원문 · 번역</h2><b>${paragraphs.length}개 문단</b></div>${paragraphs.map(paragraphCard).join("")}</section>`);
  $('.reader-tabs button[data-tab="translation"] b').textContent = paragraphs.length;
  $(".sidebar-progress strong").textContent = `${paragraphs.filter((item) => item.translation).length} / ${paragraphs.length}`;
  $(".sidebar-progress div span").textContent = "문단 번역 완료";
}

function restoreSampleStream() {
  const stream = $(".translation-stream");
  $$(".stream-section", stream).forEach((section) => section.remove());
  stream.insertAdjacentHTML("beforeend", baseStreamSectionsHtml);
  state.analyzedParagraphs = [];
  enhanceSampleKnowledge();
}

async function translateParagraphAt(index) {
  const paragraph = state.analyzedParagraphs[index];
  if (!paragraph || paragraph.translationStatus === "loading") return;
  paragraph.translationStatus = "loading";
  renderAnalyzedParagraphs(state.analyzedParagraphs);
  try {
    paragraph.translation = await translateText(paragraph.source);
    paragraph.translationStatus = "complete";
  } catch (error) {
    console.error(error);
    paragraph.translationStatus = "error";
    showToast("번역 사용량이 초과되었거나 네트워크 연결이 불안정합니다.");
  }
  saveCurrentAnalysis();
  updateTranslationProgress();
  renderAnalyzedParagraphs(state.analyzedParagraphs);
}

async function analyzeUploadedPdf(file) {
  const paragraphs = await extractPdfParagraphs(file);
  if (!paragraphs.length) throw new Error("No extractable text found in PDF");
  state.analyzedParagraphs = paragraphs;
  for (let index = 0; index < Math.min(5, paragraphs.length); index += 1) {
    try { paragraphs[index].translation = await translateText(paragraphs[index].source); paragraphs[index].translationStatus = "complete"; }
    catch (error) { console.warn("Initial paragraph translation failed", error); paragraphs[index].translationStatus = "error"; break; }
  }
  saveCurrentAnalysis();
  return paragraphs;
}

async function renderPdfPage(pageNumber) {
  if (!state.pdfDocument) return;
  const page = await state.pdfDocument.getPage(Math.min(Math.max(1, pageNumber), state.pdfDocument.numPages));
  state.currentPdfPage = page.pageNumber;
  const baseViewport = page.getViewport({ scale: 1 });
  const available = Math.max(320, $("#pdfCanvasView").clientWidth - 12);
  const scale = Math.min(1.45, available / baseViewport.width);
  const viewport = page.getViewport({ scale });
  state.pdfViewport = viewport;
  const canvas = $("#pdfCanvas");
  const stage = $("#pdfCanvasStage");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  stage.style.width = `${viewport.width}px`;
  stage.style.height = `${viewport.height}px`;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  $("#pdfPageIndicator").textContent = `${state.currentPdfPage} / ${state.pdfDocument.numPages}`;
  $("#prevPdfPage").disabled = state.currentPdfPage <= 1;
  $("#nextPdfPage").disabled = state.currentPdfPage >= state.pdfDocument.numPages;
  $("#pdfTextHighlight").innerHTML = "";
}

function drawPdfHighlight(paragraph) {
  const layer = $("#pdfTextHighlight");
  if (!state.pdfViewport || !paragraph) return;
  layer.innerHTML = paragraph.boxes.map((box) => {
    const [x1, y1, x2, y2] = state.pdfViewport.convertToViewportRectangle([box.x, box.y, box.x + box.width, box.y + box.height]);
    const left = Math.min(x1, x2) - 3;
    const top = Math.min(y1, y2) - 3;
    return `<i style="left:${left}px;top:${top}px;width:${Math.abs(x2 - x1) + 6}px;height:${Math.abs(y2 - y1) + 6}px"></i>`;
  }).join("");
}

async function highlightPdfParagraph(paragraph) {
  if (!paragraph || !state.pdfDocument) return;
  if (state.currentPdfPage !== paragraph.page) await renderPdfPage(paragraph.page);
  drawPdfHighlight(paragraph);
}

function loadHighlights() {
  try { return JSON.parse(localStorage.getItem(HIGHLIGHT_KEY)) || {}; }
  catch (error) { console.warn("Saved highlights could not be read", error); return {}; }
}

function saveHighlights() {
  state.highlights[state.currentPaperId] = $$('.segment-card').map((card) => ({
    source: $('.source-block p', card)?.innerHTML || "",
    translation: $('.translation-block p', card)?.innerHTML || "",
  }));
  localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(state.highlights));
}

function restoreHighlights(paperId) {
  const saved = state.highlights[paperId];
  $$('.segment-card').forEach((card, index) => {
    const content = saved?.[index] || (paperId === "attention" ? baseSegmentHtml[index] : null);
    if (!content) return;
    const source = $('.source-block p', card);
    const translation = $('.translation-block p', card);
    if (source) source.innerHTML = content.source;
    if (translation) translation.innerHTML = content.translation;
  });
}

function applyHighlight(color) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) { showToast("강조할 문장을 먼저 드래그해 선택해 주세요."); return; }
  const range = selection.getRangeAt(0);
  const walker = document.createTreeWalker($("#translationTab"), NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const inPaperText = node.parentElement?.closest('.source-block p, .translation-block p');
      return inPaperText && node.nodeValue?.trim() && range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const slices = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
    if (end > start) slices.push({ node, start, end });
  }
  if (!slices.length) { showToast("원문이나 번역문에서 강조할 텍스트를 선택해 주세요."); return; }
  slices.reverse().forEach(({ node, start, end }) => {
    const existing = node.parentElement?.closest('.reader-highlight');
    if (existing) { existing.className = `reader-highlight highlight-${color}`; return; }
    const selectedNode = node.splitText(start);
    selectedNode.splitText(end - start);
    const mark = document.createElement("mark");
    mark.className = `reader-highlight highlight-${color}`;
    selectedNode.replaceWith(mark);
    mark.append(selectedNode);
  });
  $$('.source-block p, .translation-block p').forEach((paragraph) => paragraph.normalize());
  selection.removeAllRanges();
  saveHighlights();
  showToast(slices.length > 1 ? "여러 문단의 형광펜 표시를 저장했어요." : "형광펜 표시를 저장했어요.");
}

function clearHighlights() {
  $$('.reader-highlight').forEach((mark) => mark.replaceWith(...mark.childNodes));
  $$('.source-block p, .translation-block p').forEach((paragraph) => paragraph.normalize());
  saveHighlights();
  showToast("현재 논문의 형광펜 표시를 지웠어요.");
}
const views = {
  home: $("#homeView"),
  upload: $("#uploadView"),
  processing: $("#processingView"),
  result: $("#resultView"),
};

function showView(name) {
  Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
  $(".topbar").hidden = name === "processing";
  const activeNav = name === "home" ? "home" : name === "upload" ? "read" : name === "result" ? (location.hash.slice(1) || "read") : "";
  $$('[data-main-nav]').forEach((button) => button.classList.toggle("active", button.dataset.mainNav === activeNav || (activeNav === "reader" && button.dataset.mainNav === "read")));
  window.scrollTo(0, 0);
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function setFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    showToast("PDF 파일만 업로드할 수 있어요.");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast("파일 크기는 50MB 이하여야 해요.");
    return;
  }
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.file = file;
  state.pdfUrl = URL.createObjectURL(file);
  state.demo = false;
  $("#fileName").textContent = file.name;
  $("#fileMeta").textContent = `${formatBytes(file.size)} · PDF 파일 확인 완료`;
  $("#dropzone").hidden = true;
  $("#fileReady").hidden = false;
  $("#startButton").disabled = false;
  const paperId = saveUploadedPaperDraft(file);
  try {
    await savePdfFile(paperId, file);
    showToast("PDF를 Library에 자동 저장했어요.");
  } catch (error) {
    console.error(error);
    showToast("Library 정보는 저장했지만 PDF 파일 저장 공간이 부족해요.");
  }
}

const dropzone = $("#dropzone");
$("#fileInput").addEventListener("change", (event) => setFile(event.target.files[0]));
["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add("dragover"); }));
["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove("dragover"); }));
dropzone.addEventListener("drop", (event) => setFile(event.dataTransfer.files[0]));

$("#removeFile").addEventListener("click", () => {
  state.file = null;
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.pdfUrl = null;
  $("#fileInput").value = "";
  $("#dropzone").hidden = false;
  $("#fileReady").hidden = true;
  $("#startButton").disabled = true;
});

const processCopy = [
  ["논문의 구조를 파악하고 있어요", "첫 줄 들여쓰기와 문단 간격을 기준으로 원문 문단을 묶는 중입니다."],
  ["문단의 맥락을 살려 번역하고 있어요", "문장별로 끊지 않고 문단 전체의 의미와 전문 용어를 함께 확인합니다."],
  ["시각 자료의 결과를 읽고 있어요", "캡션과 본문을 연결해 Figure와 Table의 의미를 찾습니다."],
  ["읽기 좋은 한국어 PDF로 정리하고 있어요", "원문의 순서와 인용을 유지해 마지막 페이지를 구성합니다."],
];

function runProcessing(demo = true) {
  state.demo = demo;
  if (demo) state.currentPaperId = "attention";
  const analysisPromise = !demo && state.file ? analyzeUploadedPdf(state.file).catch((error) => { console.error(error); return null; }) : Promise.resolve(null);
  showView("processing");
  let step = 0;
  let progress = 7;
  const bar = $("#progressBar");
  bar.style.width = `${progress}%`;
  $("#processTitle").textContent = processCopy[0][0];
  $("#processMessage").textContent = processCopy[0][1];
  $$('[data-process-step]').forEach((el, index) => el.classList.toggle("active", index === 0));

  const timer = setInterval(() => {
    progress += 7 + Math.random() * 8;
    if (progress >= 100) {
      clearInterval(timer);
      bar.style.width = "100%";
      setTimeout(async () => {
        const analyzed = await analysisPromise;
        $("#demoBanner").hidden = !demo;
        $("#readerPage").hidden = false;
        $("#libraryPage").hidden = true;
        $("#originalPdfFrame").hidden = true;
        $("#pdfCanvasView").hidden = true;
        $("#samplePdf").hidden = false;
        $("#sourceFileName").textContent = "attention-is-all-you-need.pdf";
        if (demo) restoreSampleStream();
        if (!demo && state.file) {
          const title = state.file.name.replace(/\.pdf$/i, "");
          $("#headerPaperTitle").textContent = title;
          $(".reader-title h1").textContent = title;
          $(".original-title").textContent = analyzed ? "업로드 PDF · 문단 분석 완료" : "업로드 PDF · 원문 보기";
          $("#sourceFileName").textContent = state.file.name;
          if (analyzed) {
            renderAnalyzedParagraphs(analyzed);
            $("#pdfCanvasView").hidden = false;
            $("#samplePdf").hidden = true;
            await renderPdfPage(1);
          } else {
            $("#originalPdfFrame").src = state.pdfUrl;
            $("#originalPdfFrame").hidden = false;
            $("#samplePdf").hidden = true;
          }
          $("#demoBanner").hidden = false;
          $("#demoBanner").innerHTML = analyzed ? `<span>PARAGRAPH MODE</span> PDF에서 ${analyzed.length}개 문단을 인식했습니다. 문단을 누르면 왼쪽 원문 위치가 표시됩니다.` : '<span>PDF VIEW</span> 텍스트를 추출할 수 없는 PDF입니다. 스캔 문서는 OCR 연동이 필요합니다.';
        }
        if (!demo && state.file) upsertUploadedPaper();
        restoreHighlights(state.currentPaperId);
        renderLibrary();
        showWorkspace("reader");
        showView("result");
      }, 450);
      return;
    }
    bar.style.width = `${Math.min(progress, 96)}%`;
    const nextStep = Math.min(3, Math.floor(progress / 25));
    if (nextStep !== step) {
      step = nextStep;
      $("#processTitle").textContent = processCopy[step][0];
      $("#processMessage").textContent = processCopy[step][1];
      $$('[data-process-step]').forEach((el, index) => {
        el.classList.toggle("active", index <= step);
        if (index < step) el.querySelector("i").textContent = "✓";
      });
    }
  }, 370);
}

$("#sampleButton").addEventListener("click", () => runProcessing(true));
$("#startButton").addEventListener("click", () => runProcessing(false));

function resetApp() {
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.file = null;
  state.demo = true;
  state.pdfUrl = null;
  state.pdfDocument = null;
  state.analyzedParagraphs = [];
  $("#fileInput").value = "";
  $("#dropzone").hidden = false;
  $("#fileReady").hidden = true;
  $("#startButton").disabled = true;
  $("#headerPaperTitle").textContent = "Attention Is All You Need";
  $(".reader-title h1").textContent = "어텐션만으로 충분하다";
  $(".original-title").textContent = "Attention Is All You Need";
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  renderReadLibrary();
  showView("upload");
}

$("#newPaperButton").addEventListener("click", resetApp);
$("#backButton").addEventListener("click", () => showWorkspace("library"));

$$('.reader-tabs button').forEach((button) => button.addEventListener("click", () => {
  $$('.reader-tabs button').forEach((item) => item.classList.toggle("active", item === button));
  $("#translationTab").hidden = button.dataset.tab !== "translation";
  $("#visualTab").hidden = button.dataset.tab !== "visual";
}));

$$('.section-nav button').forEach((button) => button.addEventListener("click", () => {
  $$('.section-nav button').forEach((item) => item.classList.toggle("active", item === button));
  showWorkspace("reader");
  if (button.dataset.target === "visuals") {
    $('.reader-tabs button[data-tab="visual"]').click();
  } else {
    $('.reader-tabs button[data-tab="translation"]').click();
  }
  document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
}));

$("#topButton").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
$("#helpButton").addEventListener("click", () => showToast("PDF를 업로드하거나 샘플 논문으로 전체 흐름을 체험해 보세요."));
$(".brand").addEventListener("click", (event) => { event.preventDefault(); history.replaceState(null, "", `${location.pathname}${location.search}`); showView("home"); renderHomeRecent(); });
$("#homeReadButton").addEventListener("click", resetApp);
$("#homeLibraryButton").addEventListener("click", resetApp);
$("#homeAllPapers").addEventListener("click", resetApp);
$("#collectTrending").addEventListener("click", collectTrendingPapers);
$$('[data-trending-source]').forEach((button) => button.addEventListener("click", () => {
  state.trendingSource = button.dataset.trendingSource;
  $$('[data-trending-source]').forEach((item) => item.classList.toggle("active", item === button));
  collectTrendingPapers();
}));
$("#trendingQuery").addEventListener("keydown", (event) => { if (event.key === "Enter") collectTrendingPapers(); });
$("#homeRecentPapers").addEventListener("click", (event) => { const button = event.target.closest("[data-home-paper]"); if (button) openStoredPaper(button.dataset.homePaper); });

$("#translationTab").addEventListener("click", async (event) => {
  const translateButton = event.target.closest("[data-translate-index]");
  if (translateButton) { event.stopPropagation(); await translateParagraphAt(Number(translateButton.dataset.translateIndex)); return; }
  const knowledgeButton = event.target.closest(".knowledge-toggle");
  if (knowledgeButton) {
    event.stopPropagation();
    const panel = $(".knowledge-panel", knowledgeButton.closest(".segment-card"));
    panel.hidden = !panel.hidden;
    knowledgeButton.textContent = panel.hidden ? "기초 용어" : "용어 닫기";
    return;
  }
  const footerButton = event.target.closest(".segment-card footer button");
  if (footerButton) {
    event.stopPropagation();
    if (footerButton.classList.contains("copy-translation") || footerButton.textContent === "복사") {
      const text = $(".translated-text", footerButton.closest(".segment-card"))?.textContent || "";
      await navigator.clipboard?.writeText(text);
      showToast("번역 문단을 복사했어요.");
    } else showToast("문단 편집은 다음 업데이트에서 제공됩니다.");
    return;
  }
  const card = event.target.closest(".segment-card");
  if (!card) return;
  $$('.segment-card').forEach((item) => item.classList.toggle("active", item === card));
  const index = Number(card.dataset.paragraphIndex);
  if (Number.isInteger(index) && state.analyzedParagraphs[index]) await highlightPdfParagraph(state.analyzedParagraphs[index]);
  else $("#pdfPageIndicator").textContent = `${card.dataset.page} / 12`;
});

$("#prevPdfPage").addEventListener("click", () => renderPdfPage(state.currentPdfPage - 1));
$("#nextPdfPage").addEventListener("click", () => renderPdfPage(state.currentPdfPage + 1));

$("#collapseOriginals").addEventListener("click", (event) => {
  const collapsed = $("#translationTab").classList.toggle("originals-collapsed");
  event.currentTarget.textContent = collapsed ? "원문 펼치기" : "원문 접기";
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function relativeTime(iso) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return "방금 전";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

function renderHomeRecent() {
  const container = $("#homeRecentPapers");
  if (!container || !state.library) return;
  const papers = [...state.library.papers].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4);
  container.innerHTML = papers.length ? papers.map((paper) => `<button class="home-paper" data-home-paper="${paper.id}"><i>PDF</i><span><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.authors)} · ${relativeTime(paper.updatedAt)}</small></span><b>${paper.progress}%</b></button>`).join("") : '<div class="home-empty">Read에서 첫 논문을 올려보세요.</div>';
}

function savedTrendingPapers() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRENDING_KEY));
    return Array.isArray(saved) ? saved : saved?.papers || [];
  }
  catch (error) { console.warn("Trending papers could not be read", error); return []; }
}

function savedTrendingRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRENDING_KEY));
    return saved && !Array.isArray(saved) ? saved : null;
  } catch { return null; }
}

function restoreTrendingControls() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRENDING_KEY));
    if (!saved || Array.isArray(saved)) return;
    if (saved.source === "all" || RESEARCH_SOURCES[saved.source]) state.trendingSource = saved.source;
    $("#trendingQuery").value = saved.query || "";
    $$('[data-trending-source]').forEach((button) => button.classList.toggle("active", button.dataset.trendingSource === state.trendingSource));
  } catch (error) {
    console.warn("Trending search controls could not be restored", error);
  }
}

function renderTrending(papers = savedTrendingPapers()) {
  const container = $("#trendingPapers");
  if (!container) return;
  container.innerHTML = papers.length ? papers.slice(0, 12).map((paper) => `<a class="trend-paper" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer"><span class="trend-source">${escapeHtml(paper.source || "Research")}</span><strong>${escapeHtml(paper.title)}</strong><span>${escapeHtml(paper.authors)} · ${paper.date || paper.year} · 인용 ${Number(paper.citations || 0).toLocaleString()}</span></a>`).join("") : '<div class="home-empty">4대 AI 학회와 arXiv에서 최신 논문을 불러오고 있습니다.</div>';
  const renderFeatured = (items) => items.map((paper) => `<a class="featured-paper" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(paper.source)}</span><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.authors)}</small></a>`).join("");
  $("#mustReadPapers").innerHTML = renderFeatured(FEATURED_PAPERS.mustRead);
  $("#securityPapers").innerHTML = renderFeatured(FEATURED_PAPERS.security);
}

async function fetchLatestFromSource(sourceKey, source, query, fromDate, todayDate) {
  const filters = [`locations.source.id:${source.id}`, `from_publication_date:${fromDate}`, `to_publication_date:${todayDate}`, "is_retracted:false"];
  if (sourceKey === "arxiv") filters.push("primary_topic.subfield.id:1702|1707");
  const parameters = new URLSearchParams({
    filter: filters.join(","),
    sort: "publication_date:desc",
    "per-page": "6",
    select: "id,display_name,publication_date,publication_year,authorships,primary_location,best_oa_location,cited_by_count,locations,primary_topic",
  });
  if (query) parameters.set("search", query);
  const response = await fetch(`https://api.openalex.org/works?${parameters}`);
  if (!response.ok) throw new Error(`OpenAlex ${source.label} ${response.status}`);
  const payload = await response.json();
  return payload.results.map((work) => {
    const matchedLocation = (work.locations || []).find((location) => location.source?.id?.endsWith(source.id));
    return {
      id: work.id,
      title: work.display_name || "Untitled research",
      authors: (work.authorships || []).slice(0, 2).map((item) => item.author?.display_name).filter(Boolean).join(", ") || "Unknown authors",
      year: work.publication_year || new Date().getFullYear(),
      date: work.publication_date || String(work.publication_year || new Date().getFullYear()),
      citations: Number(work.cited_by_count || 0),
      source: source.label,
      topic: work.primary_topic?.display_name || "AI research",
      url: matchedLocation?.landing_page_url || work.best_oa_location?.landing_page_url || work.primary_location?.landing_page_url || work.id,
    };
  });
}

async function collectTrendingPapers() {
  const button = $("#collectTrending");
  const caption = $("#radarCaption");
  const query = $("#trendingQuery").value.trim();
  const selectedSources = state.trendingSource === "all" ? Object.entries(RESEARCH_SOURCES) : [[state.trendingSource, RESEARCH_SOURCES[state.trendingSource]]];
  button.classList.add("collecting");
  button.textContent = "Loading…";
  caption.textContent = `${selectedSources.map(([, source]) => source.label).join(" · ")}의 최신 발표를 확인하고 있습니다.`;
  const today = new Date();
  const from = new Date(today);
  from.setMonth(from.getMonth() - 24);
  const date = (value) => value.toISOString().slice(0, 10);
  try {
    const settled = await Promise.allSettled(selectedSources.map(([key, source]) => fetchLatestFromSource(key, source, query, date(from), date(today))));
    const buckets = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!buckets.length) throw new Error("Every research source failed");
    const papers = [];
    const seen = new Set();
    for (let row = 0; row < 6; row += 1) buckets.forEach((bucket) => {
      const paper = bucket[row];
      if (paper && !seen.has(paper.id)) { seen.add(paper.id); papers.push(paper); }
    });
    localStorage.setItem(TRENDING_KEY, JSON.stringify({ papers, query, source: state.trendingSource, updatedAt: new Date().toISOString() }));
    renderTrending(papers);
    const failedCount = settled.length - buckets.length;
    caption.textContent = papers.length ? `${query ? `“${query}” · ` : ""}출처별 최신 발표순 · ${papers.length}편${failedCount ? ` · ${failedCount}개 출처 재시도 필요` : ""}` : "선택한 조건에 맞는 최신 논문이 없습니다.";
  } catch (error) {
    console.error(error);
    caption.textContent = "수집에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
    showToast("최근 논문을 불러오지 못했어요.");
  } finally {
    button.classList.remove("collecting");
    button.textContent = "Refresh";
  }
}

function uploadedPaperDescriptor(file) {
  const title = file.name.replace(/\.pdf$/i, "");
  const field = $("#discipline").value === "자동 감지" ? "기타 연구" : $("#discipline").value;
  const fieldTags = {
    "컴퓨터과학·AI": ["deep learning", "artificial intelligence"],
    "의학·생명과학": ["biology", "medical research"],
    "공학·재료": ["engineering", "materials"],
    "사회과학": ["social science", "human behavior"],
    "기타 연구": ["research"],
  };
  const titleTags = title.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 2).slice(0, 5);
  const folder = field === "의학·생명과학" ? "의료 · 바이오" : field === "컴퓨터과학·AI" ? "AI · 머신러닝" : "읽는 중";
  return { title, field, folder, tags: [...new Set([...titleTags, ...fieldTags[field]])] };
}

function saveUploadedPaperDraft(file) {
  const descriptor = uploadedPaperDescriptor(file);
  const existing = state.library.papers.find((paper) => paper.title.toLowerCase() === descriptor.title.toLowerCase());
  const paper = {
    id: existing?.id || `paper-${Date.now()}`,
    ...descriptor,
    authors: "업로드한 논문",
    year: String(new Date().getFullYear()),
    status: existing?.status || "reading",
    progress: existing?.progress || 0,
    updatedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, paper);
  else state.library.papers.unshift(paper);
  if (!state.library.folders.includes(paper.folder)) state.library.folders.push(paper.folder);
  state.currentPaperId = paper.id;
  saveLibrary();
  renderLibrary();
  return paper.id;
}

function upsertUploadedPaper() {
  const descriptor = uploadedPaperDescriptor(state.file);
  const existing = state.library.papers.find((paper) => paper.title.toLowerCase() === descriptor.title.toLowerCase());
  if (!existing) return saveUploadedPaperDraft(state.file);
  const translatedCount = state.analyzedParagraphs.filter((paragraph) => paragraph.translation).length;
  const progress = state.analyzedParagraphs.length ? Math.round(translatedCount / state.analyzedParagraphs.length * 100) : 0;
  Object.assign(existing, descriptor, { status: progress === 100 ? "complete" : "reading", progress, updatedAt: new Date().toISOString() });
  state.currentPaperId = existing.id;
  saveLibrary();
  showToast("Analysis saved to Library.");
  return existing.id;
}

function updateTranslationProgress() {
  const paper = state.library.papers.find((item) => item.id === state.currentPaperId);
  if (!paper || !state.analyzedParagraphs.length) return;
  paper.progress = Math.round(state.analyzedParagraphs.filter((paragraph) => paragraph.translation).length / state.analyzedParagraphs.length * 100);
  paper.status = paper.progress === 100 ? "complete" : "reading";
  paper.updatedAt = new Date().toISOString();
  saveLibrary();
  renderLibrary();
}

function paperRelations(papers = state.library.papers) {
  const edges = [];
  papers.forEach((paper, index) => papers.slice(index + 1).forEach((other) => {
    const shared = paper.tags.filter((tag) => other.tags.includes(tag));
    if (shared.length) edges.push({ source: paper.id, target: other.id, shared });
  }));
  return edges;
}

function folderCount(folder) {
  return folder === "all" ? state.library.papers.length : state.library.papers.filter((paper) => paper.folder === folder).length;
}

function renderReadLibrary() {
  if (!state.library || !$("#readLibraryPapers")) return;
  const folders = ["all", ...state.library.folders];
  const papers = [...state.library.papers]
    .filter((paper) => state.readFolder === "all" || paper.folder === state.readFolder)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  $("#readLibraryFolders").innerHTML = folders.map((folder) => `<button class="${state.readFolder === folder ? "active" : ""}" data-read-folder="${escapeHtml(folder)}">${escapeHtml(folder === "all" ? "전체" : folder)} <b>${folderCount(folder)}</b></button>`).join("");
  $("#readLibraryPapers").innerHTML = papers.length ? papers.slice(0, 8).map((paper) => `<button class="read-paper-card" data-read-paper="${paper.id}"><span class="read-paper-type">PDF</span><span class="read-paper-copy"><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.folder)} · ${relativeTime(paper.updatedAt)}</small></span><span class="read-paper-progress"><i><b style="width:${paper.progress}%"></b></i><small>${paper.progress}%</small></span></button>`).join("") : '<div class="read-library-empty">이 폴더에는 아직 논문이 없습니다.</div>';
}

function renderLibrary() {
  const papers = [...state.library.papers].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const filtered = papers.filter((paper) => (state.activeFolder === "all" || paper.folder === state.activeFolder) && (state.paperFilter === "all" || paper.status === state.paperFilter));
  const folders = ["all", ...state.library.folders];
  const folderLabel = (folder) => folder === "all" ? "모든 논문" : folder;
  $("#folderGrid").innerHTML = folders.map((folder, index) => `<button class="folder-card ${state.activeFolder === folder ? "active" : ""}" data-folder="${escapeHtml(folder)}"><span class="folder-icon ${index % 3 === 1 ? "teal" : index % 3 === 2 ? "violet" : ""}">▰</span><div><strong>${escapeHtml(folderLabel(folder))}</strong><small>${folder === "all" ? "전체 분석 기록" : "주제별 논문"}</small></div><b>${folderCount(folder)}</b></button>`).join("");
  $("#miniFolderList").innerHTML = folders.slice(0, 4).map((folder) => `<button class="folder-row ${state.activeFolder === folder ? "active" : ""}" data-folder="${escapeHtml(folder)}"><span>▣</span>${escapeHtml(folderLabel(folder))}<b>${folderCount(folder)}</b></button>`).join("");
  $("#miniPaperList").innerHTML = papers.slice(0, 3).map((paper) => `<div class="mini-paper-row"><button class="mini-paper ${state.currentPaperId === paper.id ? "active" : ""}" data-paper="${paper.id}"><i>PDF</i><span>${escapeHtml(paper.title)}<small>${relativeTime(paper.updatedAt)} · ${paper.progress}%</small></span></button><button class="mini-paper-delete" type="button" data-delete-paper="${paper.id}" aria-label="${escapeHtml(paper.title)} 삭제">🗑️</button></div>`).join("");
  $("#paperTableBody").innerHTML = filtered.length ? filtered.map((paper) => `<div class="paper-row ${state.currentPaperId === paper.id ? "is-selected" : ""}" data-paper="${paper.id}" role="button" tabindex="0"><span class="paper-name"><i>PDF</i><span><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.authors)} · ${paper.year} · ${paper.tags.length}개 키워드</small></span></span><span class="folder-tag ${paper.field.includes("생명") ? "violet" : paper.status === "reading" ? "muted" : ""}">${escapeHtml(paper.folder)}</span><span class="row-progress"><i><b style="width:${paper.progress}%"></b></i>${paper.progress}%</span><span>${relativeTime(paper.updatedAt)}</span><button class="paper-delete" type="button" data-delete-paper="${paper.id}" aria-label="${escapeHtml(paper.title)} 삭제">🗑️</button></div>`).join("") : '<div class="paper-table-empty">이 조건에 맞는 논문이 없습니다.</div>';
  $("#paperListCaption").textContent = `${filtered.length}편 · 최근 분석한 순서`;
  $("#totalPaperCount").textContent = papers.length;
  $("#completePaperCount").textContent = papers.filter((paper) => paper.status === "complete").length;
  $("#readingPaperCount").textContent = papers.filter((paper) => paper.status === "reading").length;
  $("#relationCount").textContent = paperRelations().length;
  const now = new Date();
  $("#monthlyPaperCount").textContent = `이번 달 +${papers.filter((paper) => { const date = new Date(paper.updatedAt); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }).length}`;
  $(".sidebar-progress strong").textContent = `${papers.filter((paper) => paper.status === "complete").length} / ${papers.length}`;
  $(".sidebar-progress div span").textContent = "논문 분석 완료";
  const percent = papers.length ? Math.round(papers.filter((paper) => paper.status === "complete").length / papers.length * 100) : 0;
  $(".complete-bar i").style.width = `${percent}%`;
  renderReadLibrary();
}

async function deletePaper(id) {
  const paper = state.library.papers.find((item) => item.id === id);
  if (!paper || !window.confirm(`‘${paper.title}’ 논문을 삭제할까요?`)) return;
  const wasCurrent = state.currentPaperId === id;
  state.library.papers = state.library.papers.filter((item) => item.id !== id);
  if (wasCurrent) state.currentPaperId = state.library.papers[0]?.id || null;
  saveLibrary();
  try { await deletePdfFile(id); } catch (error) { console.warn("Saved PDF could not be deleted", error); }
  const analyses = loadAnalyses();
  delete analyses[id];
  localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analyses));
  const highlights = loadHighlights();
  delete highlights[id];
  localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(highlights));
  if (wasCurrent && state.currentPaperId) await openStoredPaper(state.currentPaperId);
  else if (wasCurrent) resetApp();
  else renderLibrary();
  showToast("논문을 삭제했어요.");
}

function graphColor(paper) {
  if (paper.field.includes("AI")) return "#2f6fa7";
  if (paper.field.includes("생명")) return "#7b62b3";
  return "#1d9a8d";
}

function selectGraphPaper(id) {
  state.selectedGraphId = id;
  const paper = state.library.papers.find((item) => item.id === id);
  if (!paper) return;
  const related = paperRelations().filter((edge) => edge.source === id || edge.target === id).map((edge) => ({ paper: state.library.papers.find((item) => item.id === (edge.source === id ? edge.target : edge.source)), shared: edge.shared }));
  $("#selectedPaperTitle").textContent = paper.title;
  $("#selectedPaperMeta").textContent = `${paper.authors} · ${paper.year} · ${paper.folder}`;
  $("#selectedPaperTags").innerHTML = paper.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  $("#relatedPaperCount").textContent = related.length;
  $("#relatedPaperList").innerHTML = related.length ? related.map(({ paper: item, shared }) => `<button class="relation-item" data-paper="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>공통 키워드 · ${escapeHtml(shared.join(", "))}</span></button>`).join("") : '<div class="relation-none">아직 직접 연결된 논문이 없습니다.</div>';
  $$('.graph-node').forEach((node) => { const connected = related.some(({ paper: item }) => item.id === node.dataset.paper); node.classList.toggle("active", node.dataset.paper === id); node.classList.toggle("is-muted", node.dataset.paper !== id && !connected); });
  $$('.graph-line').forEach((line) => line.classList.toggle("is-muted", line.dataset.source !== id && line.dataset.target !== id));
}

function renderGraph() {
  const canvas = $("#knowledgeCanvas");
  const papers = [...state.library.papers].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 12);
  const edges = paperRelations(papers);
  $("#graphEmpty").hidden = papers.length >= 2;
  if (!papers.length) return;
  const width = canvas.clientWidth || 820;
  const height = canvas.clientHeight || 590;
  const degrees = Object.fromEntries(papers.map((paper) => [paper.id, edges.filter((edge) => edge.source === paper.id || edge.target === paper.id).length]));
  papers.sort((a, b) => degrees[b.id] - degrees[a.id]);
  const positions = {};
  papers.forEach((paper, index) => {
    if (index === 0) positions[paper.id] = { x: width * .5, y: height * .48 };
    else { const angle = (Math.PI * 2 * (index - 1)) / Math.max(1, papers.length - 1) - Math.PI / 2; const ring = index > 7 ? .42 : .34; positions[paper.id] = { x: width * (.5 + Math.cos(angle) * ring), y: height * (.5 + Math.sin(angle) * ring) }; }
  });
  $("#connectionLines").setAttribute("viewBox", `0 0 ${width} ${height}`);
  $("#connectionLines").innerHTML = edges.map((edge) => `<line class="graph-line ${edge.shared.length > 1 ? "strong" : ""}" data-source="${edge.source}" data-target="${edge.target}" x1="${positions[edge.source].x}" y1="${positions[edge.source].y}" x2="${positions[edge.target].x}" y2="${positions[edge.target].y}" />`).join("");
  $("#connectionNodes").innerHTML = papers.map((paper) => `<button class="graph-node" data-paper="${paper.id}" style="left:${positions[paper.id].x}px;top:${positions[paper.id].y}px;--node-color:${graphColor(paper)}"><strong>${escapeHtml(paper.title)}</strong><span>${escapeHtml(paper.field)}</span></button>`).join("");
  selectGraphPaper(state.selectedGraphId && papers.some((paper) => paper.id === state.selectedGraphId) ? state.selectedGraphId : papers[0].id);
}

async function openStoredPaper(id) {
  const paper = state.library.papers.find((item) => item.id === id);
  if (!paper) return;
  state.currentPaperId = id;
  $("#headerPaperTitle").textContent = paper.title;
  $(".reader-title h1").textContent = paper.title;
  $(".original-title").textContent = `${paper.authors} · ${paper.year}`;
  $("#demoBanner").hidden = false;
  try {
    const storedFile = await loadPdfFile(id);
    if (storedFile) {
      if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
      state.pdfUrl = URL.createObjectURL(storedFile);
      const savedAnalysis = loadAnalyses()[id] || [];
      await loadPdfDocument(storedFile);
      $("#originalPdfFrame").hidden = true;
      $("#pdfCanvasView").hidden = false;
      $("#samplePdf").hidden = true;
      $("#sourceFileName").textContent = storedFile.name || `${paper.title}.pdf`;
      if (savedAnalysis.length) renderAnalyzedParagraphs(savedAnalysis);
      else restoreSampleStream();
      await renderPdfPage(1);
      $("#demoBanner").innerHTML = savedAnalysis.length ? `<span>LIBRARY</span> 저장된 원문과 ${savedAnalysis.length}개 문단 번역을 열었습니다.` : '<span>LIBRARY</span> 원문 PDF를 열었습니다. Read에서 다시 분석하면 문단 번역이 생성됩니다.';
    } else {
      $("#originalPdfFrame").hidden = true;
      $("#pdfCanvasView").hidden = true;
      $("#samplePdf").hidden = false;
      restoreSampleStream();
      $("#sourceFileName").textContent = `${paper.title}.pdf`;
      $("#demoBanner").innerHTML = '<span>LIBRARY</span> 저장된 분석 기록입니다. 이 샘플의 원문 PDF는 브라우저에 보관되어 있지 않습니다.';
    }
  } catch (error) {
    console.error(error);
    $("#originalPdfFrame").hidden = true;
    $("#pdfCanvasView").hidden = true;
    $("#samplePdf").hidden = false;
  }
  restoreHighlights(id);
  renderLibrary();
  showView("result");
  showWorkspace("reader");
}

function showWorkspace(name) {
  document.body.dataset.workspace = name;
  $("#readerPage").hidden = name !== "reader";
  $("#libraryPage").hidden = name !== "library";
  $("#knowledgePage").hidden = name !== "map";
  $("#downloadButton").hidden = name !== "reader";
  $("#headerPaperTitle").textContent = name === "library" ? "My Library" : name === "map" ? "Connect" : $(".reader-title h1").textContent;
  $$('.sidebar-switch button').forEach((button) => button.classList.toggle("active", button.dataset.side === name));
  $("#tocPanel").hidden = name !== "reader";
  if (name === "library") renderLibrary();
  if (name === "map") requestAnimationFrame(renderGraph);
  history.replaceState(null, "", `#${name}`);
  $$('[data-main-nav]').forEach((button) => button.classList.toggle("active", button.dataset.mainNav === (["reader", "library"].includes(name) ? "read" : name)));
  window.scrollTo(0, 0);
}

function addLocalFolder() {
  const name = window.prompt("새 폴더 이름을 입력하세요.")?.trim();
  if (!name) return;
  if (state.library.folders.some((folder) => folder.toLowerCase() === name.toLowerCase())) { showToast("이미 같은 이름의 폴더가 있어요."); return; }
  state.library.folders.push(name.replace(/[<>]/g, ""));
  saveLibrary();
  renderLibrary();
  showToast(`‘${name}’ 폴더를 만들었어요.`);
}

$("#libraryButton").addEventListener("click", () => showWorkspace("library"));
$("#mapButton").addEventListener("click", () => showWorkspace("map"));
$("#openLibrarySidebar").addEventListener("click", () => showWorkspace("library"));
$("#closeLibrary").addEventListener("click", resetApp);
$("#closeMap").addEventListener("click", () => showWorkspace("reader"));
$("#openLibraryFromMap").addEventListener("click", () => showWorkspace("library"));
$("#openMapFromLibrary").addEventListener("click", () => showWorkspace("map"));
$("#readManageLibrary").addEventListener("click", () => { showView("result"); showWorkspace("library"); });
$("#readLibraryFolders").addEventListener("click", (event) => { const button = event.target.closest("[data-read-folder]"); if (!button) return; state.readFolder = button.dataset.readFolder; renderReadLibrary(); });
$("#readLibraryPapers").addEventListener("click", (event) => { const button = event.target.closest("[data-read-paper]"); if (button) openStoredPaper(button.dataset.readPaper); });
$$('[data-main-nav]').forEach((button) => button.addEventListener("click", () => {
  const target = button.dataset.mainNav;
  if (target === "home") { history.replaceState(null, "", `${location.pathname}${location.search}`); showView("home"); renderHomeRecent(); return; }
  if (target === "read") { resetApp(); return; }
  showView("result");
  showWorkspace(target);
}));
$$('.sidebar-switch button').forEach((button) => button.addEventListener("click", () => showWorkspace(button.dataset.side)));
$("#folderGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; state.activeFolder = button.dataset.folder; renderLibrary(); });
$("#miniFolderList").addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; state.activeFolder = button.dataset.folder; showWorkspace("library"); });
$("#paperTableBody").addEventListener("click", (event) => { const deleteButton = event.target.closest("[data-delete-paper]"); if (deleteButton) { event.stopPropagation(); deletePaper(deleteButton.dataset.deletePaper); return; } const row = event.target.closest("[data-paper]"); if (row) openStoredPaper(row.dataset.paper); });
$("#miniPaperList").addEventListener("click", (event) => { const button = event.target.closest("[data-paper]"); if (button) openStoredPaper(button.dataset.paper); });
$("#miniPaperList").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-paper]"); if (button) { event.stopPropagation(); deletePaper(button.dataset.deletePaper); } });
$("#connectionNodes").addEventListener("click", (event) => { const button = event.target.closest("[data-paper]"); if (button) selectGraphPaper(button.dataset.paper); });
$("#relatedPaperList").addEventListener("click", (event) => { const button = event.target.closest("[data-paper]"); if (button) selectGraphPaper(button.dataset.paper); });
$$('.paper-filters button').forEach((button) => button.addEventListener("click", () => { state.paperFilter = button.dataset.filter; $$('.paper-filters button').forEach((item) => item.classList.toggle("active", item === button)); renderLibrary(); }));
$("#addFolderButton").addEventListener("click", addLocalFolder);
$("#addFolderMini").addEventListener("click", () => { showWorkspace("library"); setTimeout(addLocalFolder, 50); });
$$('[data-highlight]').forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => applyHighlight(button.dataset.highlight));
});
$("#clearHighlights").addEventListener("mousedown", (event) => event.preventDefault());
$("#clearHighlights").addEventListener("click", clearHighlights);

function buildExportDocument() {
  const exportRoot = $("#pdfExport");
  const title = $(".reader-title h1").textContent;
  const original = $(".original-title").textContent;
  const translated = state.analyzedParagraphs.length
    ? state.analyzedParagraphs.map((paragraph, index) => ({ index: index + 1, text: paragraph.translation || "번역 대기 중인 문단입니다." }))
    : $$(".translation-stream .translated-text").map((node, index) => ({ index: index + 1, text: node.textContent.trim() }));
  const chunks = [];
  translated.forEach(({ index, text }) => {
    let remaining = text;
    while (remaining.length > 900) {
      let cut = remaining.lastIndexOf(" ", 900);
      if (cut < 500) cut = 900;
      chunks.push({ index, text: remaining.slice(0, cut).trim(), continued: true });
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push({ index, text: remaining, continued: false });
  });
  const pages = [`<div class="export-page"><section class="export-cover"><div class="export-logo">PaperKo</div><div class="export-tag">KOREAN TRANSLATED PAPER</div><h1 class="export-title">${escapeHtml(title)}</h1><div class="export-subtitle">${escapeHtml(original)}</div><div class="export-meta">전체 문단 번역본<br/>PaperKo AI 번역 · 중요한 내용은 원문과 비교해 주세요.</div></section></div>`];
  for (let index = 0; index < chunks.length; index += 2) {
    const items = chunks.slice(index, index + 2).map((chunk) => `<p><strong>문단 ${String(chunk.index).padStart(2, "0")}${chunk.continued ? " (계속)" : ""}</strong><br/>${escapeHtml(chunk.text)}</p>`).join("");
    pages.push(`<div class="export-page"><section class="export-section"><h2>논문 전체 번역</h2>${items}</section></div>`);
  }
  pages.push(`<div class="export-page"><section class="export-section"><h2>Figure · Table 해설</h2><div class="export-figure"><div class="export-chart">Multi-Head Attention</div><p><strong>Figure 1 · Transformer 전체 구조</strong><br/>인코더와 디코더가 여러 층으로 반복되며 각 층의 핵심은 멀티헤드 어텐션입니다. 순환 연결이 없어 모든 토큰을 동시에 처리할 수 있습니다.</p></div><div class="export-figure"><div class="export-chart">BLEU 28.40<br/>Cost 1.0×</div><p><strong>Table 2 · 번역 성능</strong><br/>Transformer는 비교 모델보다 높은 BLEU 점수를 기록하면서 학습 비용은 더 낮았습니다.</p></div><div class="export-foot">PaperKo AI 번역 · 중요한 내용은 원문과 비교해 주세요.</div></section></div>`);
  exportRoot.innerHTML = pages.join("");
  return $$(".export-page", exportRoot);
}

$("#downloadButton").addEventListener("click", async () => {
  const button = $("#downloadButton");
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.textContent = "PDF 만드는 중…";
  try {
    if (!window.html2canvas || !window.jspdf) throw new Error("PDF library unavailable");
    const exportPages = buildExportDocument();
    await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let index = 0; index < exportPages.length; index += 1) {
      const canvas = await window.html2canvas(exportPages[index], { scale: 1.7, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
    }
    pdf.save("ko.pdf");
    showToast("ko.pdf 다운로드를 시작했어요.");
  } catch (error) {
    console.error(error);
    showToast("PDF 생성 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
});

state.library = loadLibrary();
state.highlights = loadHighlights();
restoreHighlights(state.currentPaperId);
enhanceSampleKnowledge();
renderLibrary();
renderHomeRecent();
restoreTrendingControls();
renderTrending();
const latestPaperRecord = savedTrendingRecord();
if (!latestPaperRecord?.papers?.length || Date.now() - new Date(latestPaperRecord.updatedAt || 0).getTime() > 6 * 60 * 60 * 1000) {
  setTimeout(collectTrendingPapers, 0);
}
if (["#reader", "#library", "#map"].includes(location.hash)) {
  const initialWorkspace = location.hash.slice(1);
  showView("result");
  showWorkspace(initialWorkspace);
} else if (location.hash === "#read") {
  showView("upload");
} else {
  showView("home");
}
