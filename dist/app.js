const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = { file: null, demo: true, pdfUrl: null };
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
  ["논문의 구조를 파악하고 있어요", "제목, 초록, 본문과 참고문헌을 구분하는 중입니다."],
  ["문단의 맥락을 살려 번역하고 있어요", "전문 용어와 앞뒤 문장의 연결을 함께 확인합니다."],
  ["시각 자료의 결과를 읽고 있어요", "캡션과 본문을 연결해 Figure와 Table의 의미를 찾습니다."],
  ["읽기 좋은 한국어 PDF로 정리하고 있어요", "원문의 순서와 인용을 유지해 마지막 페이지를 구성합니다."],
];

function runProcessing(demo = true) {
  state.demo = demo;
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
  showView("upload");
}

$("#newPaperButton").addEventListener("click", resetApp);
$("#backButton").addEventListener("click", () => showLibrary(true));

$$('.reader-tabs button').forEach((button) => button.addEventListener("click", () => {
  $$('.reader-tabs button').forEach((item) => item.classList.toggle("active", item === button));
  $("#translationTab").hidden = button.dataset.tab !== "translation";
  $("#visualTab").hidden = button.dataset.tab !== "visual";
}));

$$('.section-nav button').forEach((button) => button.addEventListener("click", () => {
  $$('.section-nav button').forEach((item) => item.classList.toggle("active", item === button));
  showLibrary(false);
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

function showLibrary(open) {
  $("#libraryPage").hidden = !open;
  $("#readerPage").hidden = open;
  $("#downloadButton").hidden = open;
  $("#headerPaperTitle").textContent = open ? "내 논문함" : ($(".original-title").textContent === "Attention Is All You Need" ? "Attention Is All You Need" : $(".reader-title h1").textContent);
  window.scrollTo(0, 0);
}

$("#libraryButton").addEventListener("click", () => showLibrary(true));
$("#openLibrarySidebar").addEventListener("click", () => showLibrary(true));
$("#closeLibrary").addEventListener("click", () => showLibrary(false));
$("[data-open-paper]").addEventListener("click", () => showLibrary(false));

$$('.sidebar-switch button').forEach((button) => button.addEventListener("click", () => {
  $$('.sidebar-switch button').forEach((item) => item.classList.toggle("active", item === button));
  $("#tocPanel").hidden = button.dataset.side !== "toc";
  $("#libraryPanel").hidden = button.dataset.side !== "library";
}));

function addLocalFolder() {
  const name = window.prompt("새 폴더 이름을 입력하세요.");
  if (!name?.trim()) return;
  const card = document.createElement("button");
  card.className = "folder-card";
  card.innerHTML = `<span class="folder-icon">▰</span><div><strong>${name.trim().replace(/[<>]/g, "")}</strong><small>새로 만든 폴더</small></div><b>0</b>`;
  $(".folder-grid").append(card);
  showToast(`‘${name.trim()}’ 폴더를 만들었어요.`);
}

$("#addFolderButton").addEventListener("click", addLocalFolder);
$("#addFolderMini").addEventListener("click", () => { showLibrary(true); setTimeout(addLocalFolder, 50); });

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
