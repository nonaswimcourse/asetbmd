import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { KIB_SCHEMAS, KIB_LIST, emptyRecord } from "./schemas.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 15;

// ---------- state ----------
let activeKibKey = "A";
let page = 0;
let search = "";
let totalCount = 0;
let editingRow = null; // record currently in the add/edit modal
let deleteTarget = null;

// ---------- DOM refs ----------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const userEmailLabel = document.getElementById("userEmailLabel");
const logoutBtn = document.getElementById("logoutBtn");
const sidebarNav = document.getElementById("sidebarNav");
const pageTitle = document.getElementById("pageTitle");
const pageDesc = document.getElementById("pageDesc");
const searchInput = document.getElementById("searchInput");
const addBtn = document.getElementById("addBtn");
const exportExcelBtn = document.getElementById("exportExcelBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const importFileInput = document.getElementById("importFileInput");
const errorBox = document.getElementById("errorBox");
const tableHeadRow = document.getElementById("tableHeadRow");
const tableBody = document.getElementById("tableBody");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

const formModalOverlay = document.getElementById("formModalOverlay");
const formModalTitle = document.getElementById("formModalTitle");
const formModalClose = document.getElementById("formModalClose");
const assetForm = document.getElementById("assetForm");
const formGrid = document.getElementById("formGrid");
const formCancelBtn = document.getElementById("formCancelBtn");
const formSaveBtn = document.getElementById("formSaveBtn");

const confirmModalOverlay = document.getElementById("confirmModalOverlay");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

function currentSchema() {
  return KIB_SCHEMAS[activeKibKey];
}

// ================= AUTH =================

supabase.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session);
  else showLogin();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showLogin();
});

function showLogin() {
  loginScreen.style.display = "flex";
  appShell.style.display = "none";
}

function showApp(session) {
  loginScreen.style.display = "none";
  appShell.style.display = "flex";
  userEmailLabel.textContent = session.user.email;
  buildSidebar();
  loadData();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.style.display = "none";
  loginBtn.disabled = true;
  loginBtn.textContent = "Memproses…";
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  loginBtn.disabled = false;
  loginBtn.textContent = "Masuk";
  if (error) {
    loginError.textContent = error.message;
    loginError.style.display = "block";
  }
});

logoutBtn.addEventListener("click", () => supabase.auth.signOut());

// ================= SIDEBAR =================

function buildSidebar() {
  sidebarNav.innerHTML = "";
  KIB_LIST.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "sidebar-item" + (s.key === activeKibKey ? " active" : "");
    btn.innerHTML = `<span class="sidebar-letter">${s.key}</span><span>${s.title.replace(
      `KIB ${s.key} - `,
      ""
    )}</span>`;
    btn.addEventListener("click", () => {
      activeKibKey = s.key;
      page = 0;
      search = "";
      searchInput.value = "";
      buildSidebar();
      loadData();
    });
    sidebarNav.appendChild(btn);
  });
}

// ================= DATA LOADING =================

async function loadData() {
  const schema = currentSchema();
  pageTitle.textContent = schema.title;
  pageDesc.textContent = schema.description;
  errorBox.style.display = "none";
  tableBody.innerHTML = `<tr><td class="muted center" colspan="99">Memuat data…</td></tr>`;

  const searchableCols = schema.fields
    .filter((f) => f.type === "text")
    .slice(0, 4)
    .map((f) => f.key);

  let query = supabase
    .from(schema.table)
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (search.trim()) {
    const orFilter = searchableCols.map((c) => `${c}.ilike.%${search.trim()}%`).join(",");
    query = query.or(orFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    errorBox.textContent = error.message;
    errorBox.style.display = "block";
    renderTable(schema, []);
    return;
  }

  totalCount = count || 0;
  renderTable(schema, data || []);
  updatePagination();
}

function updatePagination() {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  pageInfo.textContent = `Halaman ${page + 1} dari ${totalPages} (${totalCount} data)`;
  prevPageBtn.disabled = page === 0;
  nextPageBtn.disabled = page + 1 >= totalPages;
}

prevPageBtn.addEventListener("click", () => {
  if (page > 0) {
    page -= 1;
    loadData();
  }
});
nextPageBtn.addEventListener("click", () => {
  page += 1;
  loadData();
});

let searchTimer = null;
searchInput.addEventListener("input", (e) => {
  search = e.target.value;
  page = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadData, 350);
});

// ================= TABLE RENDER =================

function renderTable(schema, rows) {
  const displayFields = schema.fields.slice(0, 7);

  tableHeadRow.innerHTML =
    displayFields.map((f) => `<th>${f.label}</th>`).join("") + `<th>Aksi</th>`;

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td class="muted center" colspan="${
      displayFields.length + 1
    }">Belum ada data. Klik "Tambah Data" untuk mulai mengisi.</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      displayFields.map((f) => `<td>${escapeHtml(row[f.key] ?? "-")}</td>`).join("") +
      `<td class="actions-cell">
         <button class="link-btn" data-action="edit">Edit</button>
         <button class="link-btn danger" data-action="delete">Hapus</button>
         <button class="link-btn" data-action="pdf">PDF</button>
       </td>`;

    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openFormModal(row));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => openConfirmModal(row));
    tr.querySelector('[data-action="pdf"]').addEventListener("click", () => exportSingleRecordPdf(schema, row));

    tableBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ================= ADD / EDIT MODAL =================

addBtn.addEventListener("click", () => openFormModal(emptyRecord(currentSchema())));
formModalClose.addEventListener("click", closeFormModal);
formCancelBtn.addEventListener("click", closeFormModal);
formModalOverlay.addEventListener("click", (e) => {
  if (e.target === formModalOverlay) closeFormModal();
});

function openFormModal(record) {
  editingRow = { ...record };
  const schema = currentSchema();
  const isEdit = Boolean(record.id);
  formModalTitle.textContent = isEdit ? "Edit Data Aset" : "Tambah Data Aset";

  formGrid.innerHTML = "";
  schema.fields.forEach((f) => {
    const wrap = document.createElement("div");
    wrap.className = "form-field" + (f.type === "textarea" ? " full" : "");

    const label = document.createElement("label");
    label.innerHTML = f.label + (f.required ? '<span class="req">*</span>' : "");
    wrap.appendChild(label);

    let input;
    if (f.type === "textarea") {
      input = document.createElement("textarea");
    } else if (f.type === "select") {
      input = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "— pilih —";
      input.appendChild(blank);
      f.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      });
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
    }
    input.name = f.key;
    input.value = record[f.key] ?? "";
    if (f.required) input.required = true;

    wrap.appendChild(input);
    formGrid.appendChild(wrap);
  });

  formModalOverlay.style.display = "flex";
}

function closeFormModal() {
  formModalOverlay.style.display = "none";
  editingRow = null;
}

assetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const schema = currentSchema();
  const formData = new FormData(assetForm);
  const payload = {};
  schema.fields.forEach((f) => {
    let val = formData.get(f.key);
    if (val === "") val = null;
    if (f.type === "number" && val !== null) val = Number(val);
    payload[f.key] = val;
  });

  formSaveBtn.disabled = true;
  formSaveBtn.textContent = "Menyimpan…";

  let error;
  if (editingRow && editingRow.id) {
    ({ error } = await supabase.from(schema.table).update(payload).eq("id", editingRow.id));
  } else {
    ({ error } = await supabase.from(schema.table).insert(payload));
  }

  formSaveBtn.disabled = false;
  formSaveBtn.textContent = "Simpan";

  if (error) {
    alert("Gagal menyimpan: " + error.message);
    return;
  }
  closeFormModal();
  loadData();
});

// ================= DELETE CONFIRM =================

function openConfirmModal(row) {
  deleteTarget = row;
  confirmMessage.textContent = `Hapus data "${row.nama_barang || row.id}"? Tindakan ini tidak dapat dibatalkan.`;
  confirmModalOverlay.style.display = "flex";
}
confirmCancelBtn.addEventListener("click", () => {
  confirmModalOverlay.style.display = "none";
  deleteTarget = null;
});
confirmModalOverlay.addEventListener("click", (e) => {
  if (e.target === confirmModalOverlay) confirmModalOverlay.style.display = "none";
});
confirmDeleteBtn.addEventListener("click", async () => {
  if (!deleteTarget) return;
  const schema = currentSchema();
  const { error } = await supabase.from(schema.table).delete().eq("id", deleteTarget.id);
  if (error) alert("Gagal menghapus: " + error.message);
  confirmModalOverlay.style.display = "none";
  deleteTarget = null;
  loadData();
});

// ================= EXPORT EXCEL =================

exportExcelBtn.addEventListener("click", async () => {
  const schema = currentSchema();
  const { data, error } = await supabase.from(schema.table).select("*").order("id");
  if (error) return alert("Gagal mengambil data: " + error.message);

  const headers = schema.fields.map((f) => f.label);
  const rows = (data || []).map((row) => {
    const obj = {};
    schema.fields.forEach((f, i) => (obj[headers[i]] = row[f.key] ?? ""));
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, schema.key);
  XLSX.writeFile(wb, `${schema.table}.xlsx`);
});

// ================= EXPORT PDF =================

exportPdfBtn.addEventListener("click", async () => {
  const schema = currentSchema();
  const { data, error } = await supabase.from(schema.table).select("*").order("id");
  if (error) return alert("Gagal mengambil data: " + error.message);
  exportTablePdf(schema, data || []);
});

function exportTablePdf(schema, rows) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(12);
  doc.text(schema.title, 40, 30);
  doc.setFontSize(9);
  doc.text(schema.description, 40, 45);

  const headers = schema.fields.map((f) => f.label);
  const keys = schema.fields.map((f) => f.key);
  const body = rows.map((row) => keys.map((k) => (row[k] ?? "").toString()));

  doc.autoTable({
    startY: 60,
    head: [headers],
    body,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
    theme: "grid",
    margin: { left: 20, right: 20 },
  });

  doc.save(`${schema.table}.pdf`);
}

function exportSingleRecordPdf(schema, row) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(schema.title, 40, 40);
  doc.setFontSize(10);
  doc.text(schema.description, 40, 58);

  const body = schema.fields.map((f) => [f.label, (row[f.key] ?? "").toString()]);

  doc.autoTable({
    startY: 80,
    head: [["Field", "Nilai"]],
    body,
    styles: { fontSize: 10, cellPadding: 5 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 180 } },
    theme: "grid",
  });

  doc.save(`${schema.table}_${row.id || "record"}.pdf`);
}

// ================= IMPORT EXCEL =================

importFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const schema = currentSchema();

  try {
    const allRows = await parseExcelFile(file, schema);
    const requiredKeys = schema.fields.filter((f) => f.required).map((f) => f.key);

    const validRows = [];
    const skipped = [];
    allRows.forEach((row, idx) => {
      const missing = requiredKeys.filter((k) => !row[k] || String(row[k]).trim() === "");
      if (missing.length > 0) {
        skipped.push(`Baris ${idx + 2}: kolom wajib kosong (${missing.join(", ")})`);
      } else {
        validRows.push(row);
      }
    });

    if (validRows.length === 0) {
      alert(
        "Tidak ada baris valid untuk diimpor.\n\n" +
          (skipped.length ? "Masalah:\n" + skipped.slice(0, 15).join("\n") : "")
      );
    } else {
      const { error } = await supabase.from(schema.table).insert(validRows);
      if (error) {
        alert("Gagal mengimpor: " + error.message);
      } else {
        let msg = `${validRows.length} baris berhasil diimpor.`;
        if (skipped.length > 0) {
          msg +=
            `\n\n${skipped.length} baris dilewati karena data wajib kosong:\n` +
            skipped.slice(0, 15).join("\n") +
            (skipped.length > 15 ? `\n… dan ${skipped.length - 15} baris lainnya.` : "");
        }
        alert(msg);
        loadData();
      }
    }
  } catch (err) {
    alert("Gagal membaca file: " + err.message);
  } finally {
    importFileInput.value = "";
  }
});

function normalizeLabel(str) {
  return String(str)
    .toLowerCase()
    .replace(/[\s_\-./]+/g, ""); // buang spasi, garis bawah, strip, titik, garis miring, baris baru
}

function parseExcelFile(file, schema) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const labelToKey = {};
        schema.fields.forEach((f) => (labelToKey[normalizeLabel(f.label)] = f.key));

        const rows = json
          .map((row) => {
            const mapped = {};
            Object.entries(row).forEach(([label, value]) => {
              const key = labelToKey[normalizeLabel(label)];
              if (key) mapped[key] = value;
            });
            return mapped;
          })
          // buang baris yang seluruh isinya kosong (mis. baris kosong di akhir file)
          .filter((mapped) =>
            Object.values(mapped).some((v) => v !== "" && v !== null && v !== undefined)
          );
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}
