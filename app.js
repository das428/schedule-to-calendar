import * as pdfjsLib from "./lib/pdf.min.mjs"

pdfjsLib.GlobalWorkerOptions.workerSrc= "./lib/pdf.worker.min.mjs"

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
    setStatus("Error: doesn't look like a PDF.", "error");
    return;
  }

  setStatus("Reading your schedule…", "working");
  previewEl.classList.add("hidden");

  try {
    const text = await extractPdfText(file);
    parsedCourses = parseCourses(text);

    if (parsedCourses.length === 0) {
      setStatus("Error: couldn't find any courses in that PDF.", "error");
      return;
    }

    renderPreview(parsedCourses);
    // Recitations/labs are linked sections with 0 credit hours — they still
    // get their own calendar events, but they shouldn't inflate the course count.
    const courseCount = parsedCourses.filter((c) => parseFloat(c.credits) !== 0).length;
    setStatus(`Found ${courseCount} course${courseCount === 1 ? "" : "s"}. Check the preview below.`, "success");
    // google analytics tag for user uploading their pdf
    gtag("event", "schedule_parsed", { course_count: courseCount });
  } catch (err) {
    console.error(err);
    setStatus(`DEBUG: ${err.message}\n${err.stack || ""}`, "error"); // TEMPORARY
  }
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += groupItemsIntoLines(content.items) + "\n";
  }
  return fullText;
}

// pdf.js gives back individual text fragments with x/y positions, not
// whole lines. Group fragments that share a y-coordinate (same visual
// row) into one line, ordered left-to-right, so regex matching against
// full lines (like pdfplumber's output) actually works.
function groupItemsIntoLines(items) {
  const rows = new Map(); // rounded y -> array of {x, str}

  items.forEach((item) => {
    const y = Math.round(item.transform[5]); // vertical position
    const x = item.transform[4]; // horizontal position
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x, str: item.str });
  });

  const sortedYs = [...rows.keys()].sort((a, b) => b - a);

  return sortedYs
    .map((y) =>
      rows
        .get(y)
        .sort((a, b) => a.x - b.x)
        .map((f) => f.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

function renderPreview(courses) {
  previewBody.innerHTML = "";

  // Group sections by subject+number so a course's lecture, its linked
  // recitation/lab, and its common-hour exam blocks all land in one block.
  const groups = new Map(); // "SUBJ NUM" -> { subj, num, title, credits, sections: [course, ...] }
  courses.forEach((course) => {
    const key = `${course.subj} ${course.num}`;
    if (!groups.has(key)) {
      groups.set(key, {
        subj: course.subj,
        num: course.num,
        title: course.title,
        credits: course.credits,
        sections: [],
      });
    }
    const group = groups.get(key);
    // The credit-bearing section (not the 0-credit linked recitation/lab)
    // is the one whose title/credits represent the course as a whole.
    if (parseFloat(course.credits) !== 0) {
      group.title = course.title;
      group.credits = course.credits;
    }
    group.sections.push(course);
  });

  groups.forEach((group) => {
    const headerRow = document.createElement("tr");
    headerRow.className = "group-header";
    headerRow.innerHTML = `<th colspan="7">${group.subj} ${group.num} — ${group.title} (${group.credits} cr)</th>`;
    previewBody.appendChild(headerRow);

    group.sections.forEach((course) => {
      course.meetings.forEach((m) => {
        const row = document.createElement("tr");
        const dayLabel = m.days ? m.days.join("/") : "—";
        const dateLabel = m.dateStart === m.dateEnd ? m.dateStart : `${m.dateStart} – ${m.dateEnd}`;
        const timeLabel = m.timeStart ? `${m.timeStart} – ${m.timeEnd}` : "—";
        row.innerHTML = `
          <td>${course.subj} ${course.num}-${course.sec}</td>
          <td>${course.crn}</td>
          <td>${dayLabel}</td>
          <td>${dateLabel}</td>
          <td>${timeLabel}</td>
          <td>${m.location || "TBD"}</td>
          <td>${m.instructor || "TBD"}</td>
        `;
        previewBody.appendChild(row);
      });
    });
  });

  previewEl.classList.remove("hidden");
}

downloadBtn.addEventListener("click", () => {
  //google analytics tag for user downloading the .ics file
  gtag("event", "ics_downloaded", { course_count: parsedCourses.length });
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
