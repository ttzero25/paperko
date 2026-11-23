const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "paperko.library.v1";
const HIGHLIGHT_KEY = "paperko.highlights.v1";
const state = {
  file: null,
  demo: true,
  pdfUrl: null,
  library: null,
  activeFolder: "all",
  paperFilter: "all",
  selectedGraphId: null,
  currentPaperId: "attention",
  highlights: {},
};
const baseSegmentHtml = $$('.segment-card').map((card) => ({
  source: $('.source-block p', card)?.innerHTML || "",
  translation: $('.translation-block p', card)?.innerHTML || "",
}));

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
    const content = saved?.[index] || baseSegmentHtml[index];
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
  const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
  const paragraph = ancestor?.closest?.('.source-block p, .translation-block p');
  if (!paragraph || !paragraph.contains(range.startContainer) || !paragraph.contains(range.endContainer)) { showToast("한 문단 안의 텍스트만 선택할 수 있어요."); return; }
  const mark = document.createElement("mark");
  mark.className = `reader-highlight highlight-${color}`;
  try { range.surroundContents(mark); }
  catch (error) { const fragment = range.extractContents(); mark.append(fragment); range.insertNode(mark); }
  paragraph.normalize();
  selection.removeAllRanges();
  saveHighlights();
  showToast("형광펜 표시를 저장했어요.");
}

function clearHighlights() {
  $$('.reader-highlight').forEach((mark) => mark.replaceWith(...mark.childNodes));
  $$('.source-block p, .translation-block p').forEach((paragraph) => paragraph.normalize());
  saveHighlights();
  showToast("현재 논문의 형광펜 표시를 지웠어요.");
}
const views = {
  upload: $("#uploadView"),
  processing: $("#processingView"),
  result: $("#resultView"),
};

function showView(name) {
  Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
  $(".topbar").hidden = name === "result";
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

function setFile(file) {
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
      setTimeout(() => {
        $("#demoBanner").hidden = !demo;
        $("#readerPage").hidden = false;
        $("#libraryPage").hidden = true;
        $("#originalPdfFrame").hidden = true;
        $("#samplePdf").hidden = false;
        $("#sourceFileName").textContent = "attention-is-all-you-need.pdf";
        if (!demo && state.file) {
          const title = state.file.name.replace(/\.pdf$/i, "");
          $("#headerPaperTitle").textContent = title;
          $(".reader-title h1").textContent = title;
          $(".original-title").textContent = "업로드 파일 · 분석 연동 준비됨";
          $("#sourceFileName").textContent = state.file.name;
          $("#originalPdfFrame").src = state.pdfUrl;
          $("#originalPdfFrame").hidden = false;
          $("#samplePdf").hidden = true;
          $("#demoBanner").hidden = false;
          $("#demoBanner").innerHTML = '<span>PREVIEW</span> 업로드한 원문 PDF를 왼쪽에 표시했습니다. 모델 API를 연결하면 오른쪽이 실제 문단 인식·번역 결과로 채워집니다.';
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
  $("#fileInput").value = "";
  $("#dropzone").hidden = false;
  $("#fileReady").hidden = true;
  $("#startButton").disabled = true;
  $("#headerPaperTitle").textContent = "Attention Is All You Need";
  $(".reader-title h1").textContent = "어텐션만으로 충분하다";
  $(".original-title").textContent = "Attention Is All You Need";
  history.replaceState(null, "", `${location.pathname}${location.search}`);
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

$$('.segment-card').forEach((card) => card.addEventListener("click", () => {
  $$('.segment-card').forEach((item) => item.classList.toggle("active", item === card));
  $(".page-control span").textContent = `${card.dataset.page} / 12`;
}));

$$('.segment-card footer button').forEach((button) => button.addEventListener("click", async (event) => {
  event.stopPropagation();
  const text = $('.translated-text', button.closest('.segment-card')).textContent;
  if (button.textContent === "복사") {
    await navigator.clipboard?.writeText(text);
    showToast("번역 문단을 복사했어요.");
  } else {
    showToast("문단 편집 기능은 모델 연동 버전에서 제공됩니다.");
  }
}));

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

function upsertUploadedPaper() {
  const title = state.file.name.replace(/\.pdf$/i, "");
  const field = $("#discipline").value === "자동 감지" ? "기타 연구" : $("#discipline").value;
  const fieldTags = {
    "컴퓨터과학·AI": ["deep learning", "artificial intelligence"],
    "의학·생명과학": ["biology", "medical research"],
    "공학·재료": ["engineering", "materials"],
    "사회과학": ["social science", "human behavior"],
    "기타 연구": ["research"],
  };
  const titleTags = title.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 2).slice(0, 5);
  const existing = state.library.papers.find((paper) => paper.title.toLowerCase() === title.toLowerCase());
  const folder = field === "의학·생명과학" ? "의료 · 바이오" : field === "컴퓨터과학·AI" ? "AI · 머신러닝" : "읽는 중";
  const paper = {
    id: existing?.id || `paper-${Date.now()}`,
    title,
    authors: "업로드한 논문",
    year: String(new Date().getFullYear()),
    folder,
    field,
    status: "complete",
    progress: 100,
    updatedAt: new Date().toISOString(),
    tags: [...new Set([...titleTags, ...fieldTags[field]])],
  };
  if (existing) Object.assign(existing, paper);
  else state.library.papers.unshift(paper);
  if (!state.library.folders.includes(folder)) state.library.folders.push(folder);
  state.currentPaperId = paper.id;
  saveLibrary();
  showToast("Saved to My Library.");
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

function renderLibrary() {
  const papers = [...state.library.papers].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const filtered = papers.filter((paper) => (state.activeFolder === "all" || paper.folder === state.activeFolder) && (state.paperFilter === "all" || paper.status === state.paperFilter));
  const folders = ["all", ...state.library.folders];
  const folderLabel = (folder) => folder === "all" ? "모든 논문" : folder;
  $("#folderGrid").innerHTML = folders.map((folder, index) => `<button class="folder-card ${state.activeFolder === folder ? "active" : ""}" data-folder="${escapeHtml(folder)}"><span class="folder-icon ${index % 3 === 1 ? "teal" : index % 3 === 2 ? "violet" : ""}">▰</span><div><strong>${escapeHtml(folderLabel(folder))}</strong><small>${folder === "all" ? "전체 분석 기록" : "주제별 논문"}</small></div><b>${folderCount(folder)}</b></button>`).join("");
  $("#miniFolderList").innerHTML = folders.slice(0, 4).map((folder) => `<button class="folder-row ${state.activeFolder === folder ? "active" : ""}" data-folder="${escapeHtml(folder)}"><span>▣</span>${escapeHtml(folderLabel(folder))}<b>${folderCount(folder)}</b></button>`).join("");
  $("#miniPaperList").innerHTML = papers.slice(0, 3).map((paper) => `<button class="mini-paper ${state.currentPaperId === paper.id ? "active" : ""}" data-paper="${paper.id}"><i>PDF</i><span>${escapeHtml(paper.title)}<small>${relativeTime(paper.updatedAt)} · ${paper.progress}%</small></span></button>`).join("");
  $("#paperTableBody").innerHTML = filtered.length ? filtered.map((paper) => `<button class="paper-row ${state.currentPaperId === paper.id ? "is-selected" : ""}" data-paper="${paper.id}"><span class="paper-name"><i>PDF</i><span><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.authors)} · ${paper.year} · ${paper.tags.length}개 키워드</small></span></span><span class="folder-tag ${paper.field.includes("생명") ? "violet" : paper.status === "reading" ? "muted" : ""}">${escapeHtml(paper.folder)}</span><span class="row-progress"><i><b style="width:${paper.progress}%"></b></i>${paper.progress}%</span><span>${relativeTime(paper.updatedAt)}</span><span class="row-actions">•••</span></button>`).join("") : '<div class="paper-table-empty">이 조건에 맞는 논문이 없습니다.</div>';
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

function openStoredPaper(id) {
  const paper = state.library.papers.find((item) => item.id === id);
  if (!paper) return;
  state.currentPaperId = id;
  $("#headerPaperTitle").textContent = paper.title;
  $(".reader-title h1").textContent = paper.title;
  $(".original-title").textContent = `${paper.authors} · ${paper.year}`;
  $("#demoBanner").hidden = false;
  $("#demoBanner").innerHTML = '<span>LIBRARY</span> 저장된 분석 기록을 열었습니다. 실제 문단 데이터 동기화는 백엔드 연동 단계에서 활성화됩니다.';
  restoreHighlights(id);
  renderLibrary();
  showWorkspace("reader");
}

function showWorkspace(name) {
  $("#readerPage").hidden = name !== "reader";
  $("#libraryPage").hidden = name !== "library";
  $("#knowledgePage").hidden = name !== "map";
  $("#downloadButton").hidden = name !== "reader";
  $("#headerPaperTitle").textContent = name === "library" ? "My Library" : name === "map" ? "Obsidian" : $(".reader-title h1").textContent;
  $$('.sidebar-switch button').forEach((button) => button.classList.toggle("active", button.dataset.side === name));
  $("#tocPanel").hidden = name !== "reader";
  if (name === "library") renderLibrary();
  if (name === "map") requestAnimationFrame(renderGraph);
  history.replaceState(null, "", `#${name}`);
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
$("#closeLibrary").addEventListener("click", () => showWorkspace("reader"));
$("#closeMap").addEventListener("click", () => showWorkspace("reader"));
$("#openLibraryFromMap").addEventListener("click", () => showWorkspace("library"));
$("#openMapFromLibrary").addEventListener("click", () => showWorkspace("map"));
$$('[data-main-nav]').forEach((button) => button.addEventListener("click", () => { showView("result"); showWorkspace(button.dataset.mainNav); }));
$$('.sidebar-switch button').forEach((button) => button.addEventListener("click", () => showWorkspace(button.dataset.side)));
$("#folderGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; state.activeFolder = button.dataset.folder; renderLibrary(); });
$("#miniFolderList").addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; state.activeFolder = button.dataset.folder; showWorkspace("library"); });
$("#paperTableBody").addEventListener("click", (event) => { const button = event.target.closest("[data-paper]"); if (button) openStoredPaper(button.dataset.paper); });
$("#miniPaperList").addEventListener("click", (event) => { const button = event.target.closest("[data-paper]"); if (button) openStoredPaper(button.dataset.paper); });
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
  exportRoot.innerHTML = `
    <div class="export-page"><section class="export-cover">
        <div class="export-logo">PaperKo</div>
        <div class="export-tag">KOREAN TRANSLATED PAPER</div>
        <h1 class="export-title">${title}</h1>
        <div class="export-subtitle">${original}</div>
        <div class="export-meta">Vaswani et al. · 2017<br/>자연스러운 학술 번역 · Figure/Table 해설 포함</div>
    </section></div>
    <div class="export-page">
      <section class="export-section"><h2>한눈에 보는 핵심</h2>
        <div class="export-summary"><p>순환 신경망이나 합성곱 없이 어텐션 메커니즘만으로 구성한 Transformer를 제안합니다. 병렬 처리가 가능해 학습 비용을 줄이면서도 기계 번역 성능을 크게 높였습니다.</p></div>
      </section>
      <section class="export-section"><h2>초록</h2>
        <p><strong>01</strong><br/>기존의 지배적인 시퀀스 변환 모델은 인코더와 디코더를 포함하는 복잡한 순환 신경망 또는 합성곱 신경망에 기반합니다. 가장 우수한 모델들은 어텐션 메커니즘을 통해 인코더와 디코더를 연결합니다.</p>
        <p><strong>02</strong><br/>본 연구에서는 순환 구조와 합성곱을 완전히 배제하고 어텐션 메커니즘에만 기반한 새로운 네트워크 구조인 Transformer를 제안합니다.</p>
      </section>
      <section class="export-section"><h2>서론</h2>
        <p>순환 신경망, 특히 장단기 기억 네트워크와 게이트 순환 신경망은 언어 모델링과 기계 번역 같은 시퀀스 모델링 문제에서 최첨단 접근법으로 확고히 자리 잡았습니다.</p>
      </section>
    </div>
    <div class="export-page"><section class="export-section">
        <h2>Figure · Table 해설</h2>
        <div class="export-figure"><div class="export-chart">Multi-Head Attention</div><p><strong>Figure 1 · Transformer 전체 구조</strong><br/>왼쪽 인코더와 오른쪽 디코더가 여러 층으로 반복되며, 각 층의 핵심은 멀티헤드 어텐션입니다. 순환 연결이 없어 모든 토큰을 동시에 처리할 수 있습니다.</p></div>
        <div class="export-figure"><div class="export-chart">BLEU 28.40<br/>Cost 1.0×</div><p><strong>Table 2 · 번역 성능</strong><br/>Transformer는 비교 모델보다 높은 BLEU 점수를 기록하면서 학습 비용은 더 낮았습니다. 품질과 효율을 동시에 개선한 결과입니다.</p></div>
        <div class="export-foot">PaperKo AI 번역 · 중요한 내용은 원문과 비교해 주세요.</div>
    </section></div>`;
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
renderLibrary();
if (["#reader", "#library", "#map"].includes(location.hash)) {
  const initialWorkspace = location.hash.slice(1);
  showView("result");
  showWorkspace(initialWorkspace);
}
