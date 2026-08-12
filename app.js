pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const previewBody = document.querySelector("#preview-table tbody");
const downloadBtn = document.getElementById("download-btn");

let parsedCourses = [];

// --- Drop zone interactions ---
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  if (file.type !== "application/pdf") {
    setStatus("That doesn't look like a PDF — export your schedule from Banner's Print view first.", "error");
    return;
  }

  setStatus("Reading your schedule…", "working");
  previewEl.classList.add("hidden");

  try {
    const text = await extractPdfText(file);
    parsedCourses = parseCourses(text);

    if (parsedCourses.length === 0) {
      setStatus("Couldn't find any courses in that PDF. Make sure it's the Banner schedule print-out.", "error");
      return;
    }

    renderPreview(parsedCourses);
    setStatus(`Found ${parsedCourses.length} course${parsedCourses.length === 1 ? "" : "s"}. Check the preview below.`, "success");
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong reading that PDF. Try re-exporting it from Banner.", "error");
  }
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join("\n");
    fullText += pageText + "\n";
  }
  return fullText;
}

function renderPreview(courses) {
  previewBody.innerHTML = "";
  courses.forEach((course) => {
    course.meetings.forEach((m) => {
      const row = document.createElement("tr");
      const dayLabel = m.days ? m.days.join("/") : "—";
      const timeLabel = m.timeStart ? `${m.timeStart} – ${m.timeEnd}` : "—";
      row.innerHTML = `
        <td>${course.subj} ${course.num}-${course.sec}</td>
        <td>${dayLabel}</td>
        <td>${timeLabel}</td>
        <td>${m.location || "TBD"}</td>
      `;
      previewBody.appendChild(row);
    });
  });
  previewEl.classList.remove("hidden");
}

downloadBtn.addEventListener("click", () => {
  const icsText = buildIcs(parsedCourses);
  const blob = new Blob([icsText], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lehigh_schedule.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (kind || "");
}
