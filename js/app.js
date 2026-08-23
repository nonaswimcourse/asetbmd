import { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } from "./config.js";
import { KIB_SCHEMAS, KIB_LIST, emptyRecord } from "./schemas.js";
import { BREBES_LOGO_DATA_URL, SCHOOL_LOGO_DATA_URL } from "./logo.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 15;

// Menyimpan File foto yang baru dipilih tapi belum diunggah, per field key,
// selama modal tambah/edit terbuka. Direset tiap modal dibuka/ditutup.
let pendingPhotoFiles = {};

// ---------- state ----------
let activeKibKey = "A";
let currentView = "data"; // "data" | "stiker"
let page = 0;
let search = "";
let totalCount = 0;
let editingRow = null; // record currently in the add/edit modal
let editingGroupIds = null; // saat mengedit satu grup sekaligus: daftar id unit yang akan ikut diupdate
let editingOriginalQty = 1; // jumlah unit sebelum diedit (1 untuk edit satuan, jumlah grup untuk edit grup), dipakai untuk mendeteksi penambahan/pengurangan unit saat submit
let deleteTarget = null;
let groupedView = true; // tampilan tabel dikelompokkan otomatis berdasarkan Nama Barang

// ---------- state: cetak stiker ----------
let stikerKibKey = "A";
let stikerRows = []; // seluruh baris KIB terpilih (dimuat sekali per pilihan KIB)
let stikerSelectedIds = new Set(); // id baris yang dicentang untuk dicetak
let stikerSearch = "";
const STIKER_LOKASI_STORAGE_KEY = "stiker_nomor_lokasi";

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
const groupToggleBtn = document.getElementById("groupToggleBtn");
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
const pagination = document.getElementById("pagination");

// Cetak Stiker
const dataView = document.getElementById("dataView");
const stikerView = document.getElementById("stikerView");
const stikerNavBtn = document.getElementById("stikerNavBtn");
const stikerKibSelect = document.getElementById("stikerKibSelect");
const stikerLokasiInput = document.getElementById("stikerLokasiInput");
const stikerSearchInput = document.getElementById("stikerSearchInput");
const stikerSelectAllCheckbox = document.getElementById("stikerSelectAllCheckbox");
const stikerListBody = document.getElementById("stikerListBody");
const stikerLastColHeader = document.getElementById("stikerLastColHeader");
const stikerErrorBox = document.getElementById("stikerErrorBox");
const stikerPreview = document.getElementById("stikerPreview");
const stikerSelectedCount = document.getElementById("stikerSelectedCount");
const stikerGenerateBtn = document.getElementById("stikerGenerateBtn");

const formModalOverlay = document.getElementById("formModalOverlay");
const formModalTitle = document.getElementById("formModalTitle");
const formModalClose = document.getElementById("formModalClose");
const assetForm = document.getElementById("assetForm");
const formGrid = document.getElementById("formGrid");
const formCancelBtn = document.getElementById("formCancelBtn");
const formSaveBtn = document.getElementById("formSaveBtn");
const batchSection = document.getElementById("batchSection");
const batchQtyInput = document.getElementById("batchQtyInput");
const batchSectionLabel = document.getElementById("batchSectionLabel");
const batchSectionHint = document.getElementById("batchSectionHint");

const confirmModalOverlay = document.getElementById("confirmModalOverlay");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Mobile nav (hamburger drawer)
const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebarEl = document.getElementById("sidebar");

// ---------- logo (dipakai di login & sidebar) ----------
["loginLogo", "sidebarLogo", "mobileBrandLogo"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.src = SCHOOL_LOGO_DATA_URL;
});

// ---------- mobile drawer nav ----------
function openMobileSidebar() {
  sidebarEl.classList.add("open");
  sidebarOverlay.classList.add("visible");
  hamburgerBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("no-scroll");
}
function closeMobileSidebar() {
  sidebarEl.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  hamburgerBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");
}
hamburgerBtn?.addEventListener("click", () => {
  if (sidebarEl.classList.contains("open")) closeMobileSidebar();
  else openMobileSidebar();
});
sidebarCloseBtn?.addEventListener("click", closeMobileSidebar);
sidebarOverlay?.addEventListener("click", closeMobileSidebar);

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
  closeMobileSidebar();
}

function showApp(session) {
  loginScreen.style.display = "none";
  appShell.style.display = "flex";
  userEmailLabel.textContent = session.user.email;
  buildSidebar();
  updateGroupToggleVisibility();
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
    btn.className = "sidebar-item" + (currentView === "data" && s.key === activeKibKey ? " active" : "");
    btn.innerHTML = `<span class="sidebar-letter">${s.key}</span><span>${s.title.replace(
      `KIB ${s.key} - `,
      ""
    )}</span>`;
    btn.addEventListener("click", () => {
      activeKibKey = s.key;
      page = 0;
      search = "";
      searchInput.value = "";
      showDataView();
      buildSidebar();
      updateGroupToggleVisibility();
      loadData();
      closeMobileSidebar();
    });
    sidebarNav.appendChild(btn);
  });
  stikerNavBtn.classList.toggle("active", currentView === "stiker");
}

// ================= VIEW SWITCHING (Data <-> Cetak Stiker) =================

function showDataView() {
  currentView = "data";
  dataView.style.display = "";
  stikerView.style.display = "none";
}

function showStikerView() {
  currentView = "stiker";
  dataView.style.display = "none";
  stikerView.style.display = "";
  buildSidebar();
  closeMobileSidebar();
  initStikerView();
}

stikerNavBtn.addEventListener("click", showStikerView);

// KIB C tidak memakai sistem pengelompokan otomatis (data KIB C berbasis
// gedung/bangunan per unit, bukan kumpulan barang sejenis seperti KIB
// lainnya), jadi tombol & mode kelompok disembunyikan/dinonaktifkan saat
// KIB C aktif dan tampilannya selalu datar (flat, dengan pagination).
function updateGroupToggleVisibility() {
  const isKibC = activeKibKey === "C";
  groupToggleBtn.style.display = isKibC ? "none" : "";
}

// ================= DATA LOADING =================

function searchableColumns(schema) {
  if (schema.searchFields) return schema.searchFields;
  return schema.fields
    .filter((f) => f.type === "text" && f.key !== "no_urut")
    .slice(0, 4)
    .map((f) => f.key);
}

// Mengembalikan daftar field yang dipakai sebagai kolom tabel depan.
// Kalau skema mendefinisikan `displayFields` (daftar key), pakai itu;
// kalau tidak, jatuh ke default: 8 field pertama pada skema (termasuk No Urut).
function getDisplayFields(schema) {
  if (schema.displayFields) {
    return schema.displayFields
      .map((key) => schema.fields.find((f) => f.key === key))
      .filter(Boolean);
  }
  return schema.fields.slice(0, 8);
}

async function loadData() {
  const schema = currentSchema();
  pageTitle.textContent = schema.title;
  pageDesc.textContent = schema.description;
  errorBox.style.display = "none";

  if (groupedView && schema.key !== "C") {
    await loadGroupedData(schema);
  } else {
    await loadFlatData(schema);
  }
}

// Mode normal (paginated), tampilan tabel datar seperti sebelumnya
async function loadFlatData(schema) {
  tableBody.innerHTML = `<tr><td class="muted center" colspan="99">Memuat data…</td></tr>`;
  pagination.style.display = "flex";

  let query = supabase
    .from(schema.table)
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (search.trim()) {
    const orFilter = searchableColumns(schema)
      .map((c) => `${c}.ilike.%${search.trim()}%`)
      .join(",");
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

// Mode kelompok: ambil seluruh data yang cocok (tanpa halaman), lalu dikelompokkan
// otomatis berdasarkan "Nama Barang" di sisi klien. Ini tidak menyentuh/menghapus
// fungsi impor Excel — impor tetap memasukkan seluruh baris apa adanya ke tabel.
async function loadGroupedData(schema) {
  tableBody.innerHTML = `<tr><td class="muted center" colspan="99">Memuat & mengelompokkan data…</td></tr>`;
  pagination.style.display = "none";

  let query = supabase.from(schema.table).select("*").order("nama_barang").order("nomor_register");

  if (search.trim()) {
    const orFilter = searchableColumns(schema)
      .map((c) => `${c}.ilike.%${search.trim()}%`)
      .join(",");
    query = query.or(orFilter);
  }

  const { data, error } = await query;

  if (error) {
    errorBox.textContent = error.message;
    errorBox.style.display = "block";
    renderGroupedTable(schema, []);
    return;
  }

  totalCount = (data || []).length;
  renderGroupedTable(schema, data || []);
  pageInfo.textContent = `${totalCount} data (dikelompokkan otomatis)`;
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

groupToggleBtn.addEventListener("click", () => {
  groupedView = !groupedView;
  groupToggleBtn.textContent = `🗂 Tampilan Kelompok: ${groupedView ? "Aktif" : "Nonaktif"}`;
  page = 0;
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
  const displayFields = getDisplayFields(schema);

  tableHeadRow.innerHTML =
    `<th>No</th>` + displayFields.map((f) => `<th>${f.label}</th>`).join("") + `<th>Aksi</th>`;

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td class="muted center" colspan="${
      displayFields.length + 2
    }">Belum ada data. Klik "Tambah Data" untuk mulai mengisi.</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";
  rows.forEach((row, idx) => {
    // No urut otomatis mengikuti nomor baris (menyesuaikan halaman aktif),
    // bukan disimpan ke database — selalu berurutan & konsisten dengan urutan tabel.
    const noUrut = page * PAGE_SIZE + idx + 1;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${noUrut}</td>` +
      displayFields.map((f) => `<td>${renderCell(f, row)}</td>`).join("") +
      `<td class="actions-cell">
         <button class="link-btn" data-action="edit">Edit</button>
         <button class="link-btn danger" data-action="delete">Hapus</button>
         <button class="link-btn" data-action="pdf">PDF</button>
       </td>`;

    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openFormModal(row));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => openConfirmModal(row));
    tr.querySelector('[data-action="pdf"]').addEventListener("click", () => exportSingleRecordPdf(schema, row, noUrut));

    tableBody.appendChild(tr);
  });
}

// Merender satu sel tabel sesuai tipe field: thumbnail untuk "image",
// teks biasa (di-escape) untuk tipe lainnya.
function renderCell(f, row) {
  if (f.type === "image") {
    const url = row[f.key];
    return url
      ? `<img src="${escapeHtml(url)}" alt="foto" class="table-thumb" />`
      : `<span class="muted">-</span>`;
  }
  if (f.type === "currency") {
    const formatted = formatRupiah(row[f.key]);
    return formatted ? `Rp ${escapeHtml(formatted)}` : `<span class="muted">-</span>`;
  }
  return escapeHtml(row[f.key] ?? "-");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ================= FORMAT RUPIAH =================
// Format angka jadi "1.500.000" (pemisah ribuan pakai titik, gaya Indonesia).
// Dipakai untuk tampilan tabel, PDF, dan input "Harga" di form (bukan untuk
// nilai mentah yang dikirim ke database — itu tetap angka biasa).
function formatRupiah(value) {
  if (value === null || value === undefined || value === "") return "";
  const digits = String(value).replace(/[^0-9-]/g, "");
  if (digits === "" || digits === "-") return "";
  const num = Number(digits);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("id-ID");
}

// Mengubah string hasil ketikan user (boleh sudah ada titik/format lain)
// menjadi angka murni, untuk dikirim ke database.
function parseRupiah(value) {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/[^0-9-]/g, "");
  if (digits === "" || digits === "-") return null;
  return Number(digits);
}

// Label kolom "No Urut" bisa berbeda per skema (mis. KIB C memakai "Titik
// Koordinat"), dipakai di header tabel kelompok ("Rentang ...").
function noUrutLabel(schema) {
  const f = schema.fields.find((x) => x.key === "no_urut");
  return f ? f.label : "No Urut";
}

// ================= GROUPED TABLE RENDER =================
// Mengelompokkan otomatis berdasarkan "Nama Barang" yang sama. Setiap grup
// menampilkan ringkasan (jumlah unit + rentang No. Register), dan bisa
// di-expand untuk melihat & mengelola tiap unit satu per satu.

// Mengambil nilai non-kosong dari sebuah field pada seluruh item, diurutkan
// secara numerik-aware (supaya "9" < "10", bukan diurutkan sebagai teks biasa).
function sortedFieldValues(items, key) {
  return items
    .map((r) => r[key])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function rangeLabel(sorted) {
  if (sorted.length === 0) return "-";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
}

function groupRowsByName(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = (row.nama_barang || "(Tanpa Nama Barang)").trim() || "(Tanpa Nama Barang)";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return Array.from(map.entries()).map(([name, items]) => {
    const sortedRegs = sortedFieldValues(items, "nomor_register");
    const sortedIdPemda = sortedFieldValues(items, "id_pemda");
    const sortedNoUrut = sortedFieldValues(items, "no_urut");
    return {
      name,
      items,
      count: items.length,
      regRange: rangeLabel(sortedRegs),
      regStart: sortedRegs[0] || "",
      idPemdaRange: rangeLabel(sortedIdPemda),
      idPemdaStart: sortedIdPemda[0] || "",
      noUrutRange: rangeLabel(sortedNoUrut),
      noUrutStart: sortedNoUrut[0] || "",
    };
  });
}

function renderGroupedTable(schema, rows) {
  // Kolom grup = displayFields skema, tapi "Nomor Register" diganti kolom
  // "Rentang No. Register" dan ditambah "Jumlah Unit" (karena tiap grup
  // berisi banyak unit dengan No. Register berbeda-beda).
  const baseFields = getDisplayFields(schema).filter(
    (f) => f.key !== "nomor_register" && f.key !== "no_urut"
  );

  tableHeadRow.innerHTML =
    `<th>No</th>` +
    baseFields.map((f) => `<th>${f.label}</th>`).join("") +
    `<th>Jumlah Unit</th><th>Rentang ${noUrutLabel(schema)}</th><th>Rentang No. Register</th><th>Aksi</th>`;

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td class="muted center" colspan="${
      baseFields.length + 5
    }">Belum ada data. Klik "Tambah Data" untuk mulai mengisi.</td></tr>`;
    return;
  }

  const groups = groupRowsByName(rows);
  tableBody.innerHTML = "";

  groups.forEach((group, idx) => {
    const sample = group.items[0]; // wakili data yang sama di seluruh grup
    // No urut mengikuti urutan grup di tampilan ini (tidak disimpan ke database).
    const noUrut = idx + 1;

    const tr = document.createElement("tr");
    tr.className = "group-row";
    tr.innerHTML =
      `<td>${noUrut}</td>` +
      baseFields.map((f) => `<td>${renderCell(f, sample)}</td>`).join("") +
      `<td><span class="group-count-badge">${group.count} unit</span></td>
       <td>${escapeHtml(group.noUrutRange)}</td>
       <td>${escapeHtml(group.regRange)}</td>
       <td class="actions-cell">
         <button class="link-btn" data-action="edit-group">Edit</button>
         <button class="link-btn" data-action="pdf-group">⬇ PDF Rangkuman</button>
       </td>`;

    tr.querySelector('[data-action="edit-group"]').addEventListener("click", () => openGroupEditModal(schema, group));
    tr.querySelector('[data-action="pdf-group"]').addEventListener("click", () => exportGroupPdf(schema, group, noUrut));

    tableBody.appendChild(tr);
  });
}

// ================= FOTO (SUPABASE STORAGE) =================

// Membuat blok form untuk field bertipe "image": tombol pilih file, pratinjau
// foto, tombol hapus foto. URL foto tersimpan disimpan pada hidden input
// bernama f.key supaya ikut terbaca lewat FormData seperti field lain; kalau
// user memilih file baru, file mentahnya disimpan di `pendingPhotoFiles` dan
// baru diunggah ke Supabase Storage saat form disubmit.
function buildImageField(f, record) {
  const wrap = document.createElement("div");
  wrap.className = "form-field full image-field";

  const label = document.createElement("label");
  label.innerHTML = f.label + (f.required ? '<span class="req">*</span>' : "");
  wrap.appendChild(label);

  const currentUrl = record[f.key] || "";

  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = f.key;
  hidden.value = currentUrl;
  wrap.appendChild(hidden);

  const row = document.createElement("div");
  row.className = "image-field-row";

  const preview = document.createElement("img");
  preview.className = "image-preview";
  preview.src = currentUrl || "";
  preview.style.display = currentUrl ? "block" : "none";
  preview.alt = f.label;

  const controls = document.createElement("div");
  controls.className = "image-field-controls";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-secondary small";
  removeBtn.textContent = "Hapus Foto";
  removeBtn.style.display = currentUrl ? "inline-block" : "none";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    pendingPhotoFiles[f.key] = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    removeBtn.style.display = "inline-block";
  });

  removeBtn.addEventListener("click", () => {
    delete pendingPhotoFiles[f.key];
    hidden.value = "";
    fileInput.value = "";
    preview.src = "";
    preview.style.display = "none";
    removeBtn.style.display = "none";
  });

  controls.appendChild(fileInput);
  controls.appendChild(removeBtn);
  row.appendChild(preview);
  row.appendChild(controls);
  wrap.appendChild(row);

  return wrap;
}

// Mengunggah semua foto yang baru dipilih (di `pendingPhotoFiles`) ke Supabase
// Storage, lalu mengembalikan object { key: publicUrl } untuk ditimpakan ke payload.
async function uploadPendingPhotos() {
  const result = {};
  const entries = Object.entries(pendingPhotoFiles);
  for (const [key, file] of entries) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      if (/bucket not found/i.test(error.message)) {
        throw new Error(
          `Bucket Storage "${PHOTO_BUCKET}" belum ada di project Supabase Anda. ` +
          `Buka Supabase Dashboard → Storage → New bucket → beri nama persis "${PHOTO_BUCKET}" ` +
          `→ aktifkan "Public bucket" → Save. Lalu coba unggah foto lagi.`
        );
      }
      throw new Error(`Gagal unggah foto: ${error.message}`);
    }
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    result[key] = data.publicUrl;
  }
  return result;
}

// ================= ADD / EDIT MODAL =================

addBtn.addEventListener("click", () => openFormModal(emptyRecord(currentSchema())));
formModalClose.addEventListener("click", closeFormModal);
formCancelBtn.addEventListener("click", closeFormModal);
formModalOverlay.addEventListener("click", (e) => {
  if (e.target === formModalOverlay) closeFormModal();
});

function openFormModal(record, opts = {}) {
  editingRow = { ...record };
  editingGroupIds = opts.groupIds || null;
  const schema = currentSchema();
  const isEdit = Boolean(record.id);
  const isGroupEdit = Boolean(editingGroupIds);
  formModalTitle.textContent = isGroupEdit
    ? `Edit Grup: ${record.nama_barang || ""} (${editingGroupIds.length} unit)`
    : isEdit
    ? "Edit Data Aset"
    : "Tambah Data Aset";
  pendingPhotoFiles = {};

  formGrid.innerHTML = "";
  schema.fields.forEach((f) => {
    if (f.type === "image") {
      formGrid.appendChild(buildImageField(f, record));
      return;
    }

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
    } else if (f.type === "currency") {
      input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.placeholder = "0";
      input.autocomplete = "off";
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
    }
    input.name = f.key;
    input.value = f.type === "currency" ? formatRupiah(record[f.key]) : record[f.key] ?? "";
    if (f.required) input.required = true;

    // Input "Harga": diformat otomatis pakai pemisah ribuan (titik) tiap kali
    // user mengetik, supaya langsung terlihat seperti "1.500.000" (bukan cuma
    // angka polos). Nilai mentahnya tetap dikonversi ke angka saat disimpan.
    if (f.type === "currency") {
      input.addEventListener("input", () => {
        const caretFromEnd = input.value.length - input.selectionStart;
        input.value = formatRupiah(input.value);
        const pos = Math.max(0, input.value.length - caretFromEnd);
        input.setSelectionRange(pos, pos);
      });
    }

    // Tambah Data baru (bukan edit, bukan edit grup): "No Urut" diisi contoh
    // nilai awal berpadding 4 digit ("0001") supaya saat batch >1 langsung
    // menghasilkan rentang rapi seperti 0001-0010. User tetap bebas mengubahnya.
    // Tidak berlaku untuk skema yang memakai kolom ini sebagai isian bebas
    // (mis. "Titik Koordinat" pada KIB C — lihat schema.noUrutFreeform).
    if (!isEdit && !isGroupEdit && f.key === "no_urut" && !record.no_urut && !schema.noUrutFreeform) {
      input.value = "0001";
    }

    // Saat edit grup: No Urut, No. Register & ID Pemda berbeda per unit. Field ini
    // TIDAK dikunci — nilai yang diisi di sini dipakai sebagai nilai AWAL, lalu saat
    // disimpan setiap unit dalam grup otomatis mendapat nilai berurutan
    // (unit 1 = nilai awal, unit 2 = nilai berikutnya, dst).
    if (isGroupEdit && (f.key === "nomor_register" || f.key === "id_pemda" || f.key === "no_urut")) {
      wrap.classList.add("group-sequential");
      const rangeText =
        f.key === "nomor_register"
          ? record.regRangeLabel
          : f.key === "id_pemda"
          ? record.idPemdaRangeLabel
          : record.noUrutRangeLabel;
      input.title =
        `Rentang saat ini: ${rangeText || "-"}. Nilai di sini dipakai sebagai nilai AWAL — ` +
        `akan diisi otomatis berurutan ke seluruh ${editingGroupIds ? editingGroupIds.length : 0} unit dalam grup ini.`;
      wrap.appendChild(input);
      const hint = document.createElement("div");
      hint.className = "field-hint";
      hint.textContent = `Rentang saat ini: ${rangeText || "-"} • nilai awal, diisi berurutan otomatis ke seluruh grup`;
      wrap.appendChild(hint);
      formGrid.appendChild(wrap);
      return;
    }

    wrap.appendChild(input);
    formGrid.appendChild(wrap);
  });

  // Jumlah Unit: dipakai saat Tambah (untuk membuat beberapa unit sekaligus)
  // maupun saat Edit/Edit Grup (untuk menambah atau mengurangi jumlah unit
  // yang salah/terlewat diisi sebelumnya). Nilai awal disesuaikan dengan
  // jumlah unit yang sedang diedit sekarang, supaya user tinggal menaikkan
  // atau menurunkan angkanya.
  editingOriginalQty = isGroupEdit ? editingGroupIds.length : 1;
  batchQtyInput.value = String(editingOriginalQty);
  batchSection.style.display = "block";

  if (isGroupEdit) {
    batchSectionLabel.innerHTML = `Jumlah Unit dalam grup ini (saat ini <b>${editingOriginalQty}</b> unit)`;
    batchSectionHint.innerHTML =
      `Ubah angka ini untuk menambah atau mengurangi jumlah unit dalam grup. ` +
      `<b>Menaikkan</b> angka akan membuat unit baru dengan data yang sama, melanjutkan urutan ` +
      `<b>No Urut</b>/<b>No. Register</b> yang sudah ada. <b>Menurunkan</b> angka akan menghapus ` +
      `unit paling akhir dalam grup ini (urutan terbesar) — pastikan itu memang unit yang ingin dihapus.`;
  } else if (isEdit) {
    batchSectionLabel.textContent = "Jumlah Unit (ubah jika jumlah unit yang diisi sebelumnya salah/terlewat)";
    batchSectionHint.innerHTML =
      `Data ini saat ini tercatat sebagai <b>1 unit</b>. Isi lebih dari 1 untuk membuat unit tambahan ` +
      `dengan data yang sama sebagai satu grup, masing-masing mendapat <b>No Urut</b> dan <b>No. Register</b> ` +
      `berurutan otomatis mulai dari nilai unit ini.`;
  } else {
    batchSectionLabel.innerHTML = "Jumlah Unit (duplikasi otomatis + No Urut &amp; No. Register berurutan)";
    batchSectionHint.innerHTML =
      `Isi lebih dari 1 untuk membuat beberapa unit sekaligus dengan data yang sama,
      masing-masing mendapat <b>No Urut</b> dan <b>No. Register</b> berurutan otomatis
      (mis. isi <b>10</b> dan No Urut <b>0001</b> → dibuat rentang 0001-0010). Data akan
      otomatis mengelompok berdasarkan Nama Barang pada tampilan tabel.`;
  }

  formModalOverlay.style.display = "flex";
}

// Membuka form edit untuk SATU grup sekaligus: prefill dari data unit
// pertama. Nomor Register & ID Pemda diisi dengan nilai AWAL grup (bukan
// dikunci) — kalau diubah/disimpan, keduanya otomatis dibuat berurutan untuk
// SEMUA unit dalam grup itu (unit ke-1 dapat nilai awal, unit ke-2 nilai
// berikutnya, dst — lihat submit handler & generateSequentialRegisters).
function openGroupEditModal(schema, group) {
  const sample = {
    ...group.items[0],
    nomor_register: group.regStart || group.items[0].nomor_register || "",
    id_pemda: group.idPemdaStart || group.items[0].id_pemda || "",
    no_urut: group.noUrutStart || group.items[0].no_urut || "",
    regRangeLabel: group.regRange,
    idPemdaRangeLabel: group.idPemdaRange,
    noUrutRangeLabel: group.noUrutRange,
  };
  const ids = group.items.map((r) => r.id);
  openFormModal(sample, { groupIds: ids });
}

function closeFormModal() {
  formModalOverlay.style.display = "none";
  editingRow = null;
  editingGroupIds = null;
  pendingPhotoFiles = {};
}

// Menghasilkan No. Register berurutan otomatis sebanyak `qty`, dimulai dari
// angka yang terkandung pada `startReg` (mis. "001" -> 001..010). Prefix/teks
// non-angka pada startReg tetap dipertahankan (mis. "REG-001" -> REG-002, ...),
// dan lebar padding angka mengikuti panjang digit pada startReg (minimal 3).
function generateSequentialRegisters(startReg, qty, minWidth = 3) {
  const raw = (startReg ?? "").toString().trim();
  const match = raw.match(/^(.*?)(\d+)(\D*)$/);
  let prefix = "";
  let suffix = "";
  let width = minWidth;
  let start = 1;
  if (match) {
    prefix = match[1];
    suffix = match[3];
    width = Math.max(match[2].length, minWidth);
    start = parseInt(match[2], 10);
  } else if (raw) {
    // tidak ada angka sama sekali, pakai teks apa adanya sebagai prefix
    prefix = raw + "-";
  }
  const results = [];
  for (let i = 0; i < qty; i += 1) {
    const num = String(start + i).padStart(width, "0");
    results.push(`${prefix}${num}${suffix}`);
  }
  return results;
}

assetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const schema = currentSchema();

  formSaveBtn.disabled = true;
  formSaveBtn.textContent = "Mengunggah foto…";

  let uploadedUrls;
  try {
    uploadedUrls = await uploadPendingPhotos();
  } catch (err) {
    formSaveBtn.disabled = false;
    formSaveBtn.textContent = "Simpan";
    alert(err.message);
    return;
  }

  const formData = new FormData(assetForm);
  const payload = {};
  schema.fields.forEach((f) => {
    let val = formData.get(f.key);
    if (val === "") val = null;
    if (f.type === "number" && val !== null) val = Number(val);
    if (f.type === "currency" && val !== null) val = parseRupiah(val);
    payload[f.key] = val;
  });
  Object.assign(payload, uploadedUrls);

  const isGroupEdit = Boolean(editingGroupIds && editingGroupIds.length);
  const isEdit = !isGroupEdit && Boolean(editingRow && editingRow.id);
  // Jumlah Unit yang diisi user di form (dipakai untuk Tambah baru, DAN untuk
  // menambah/mengurangi jumlah unit saat Edit/Edit Grup — lihat cabang di bawah).
  const newQty = Math.max(1, parseInt(batchQtyInput.value, 10) || 1);

  formSaveBtn.textContent = "Menyimpan…";

  let error;
  if (isGroupEdit) {
    // Edit grup: field biasa (termasuk foto) diterapkan sama ke semua unit.
    // No. Register & ID Pemda diperlakukan khusus — nilai yang diisi di form
    // dipakai sebagai nilai AWAL, lalu dibuat berurutan otomatis untuk tiap
    // unit dalam grup (unit ke-1 = nilai awal, unit ke-2 = nilai berikutnya,
    // dst), jadi tiap unit tetap punya No. Register & ID Pemda yang berbeda.
    //
    // "Jumlah Unit" di form ini juga bisa diubah untuk menambah unit baru
    // (jika jumlahnya dinaikkan) atau menghapus unit paling akhir dalam grup
    // (jika jumlahnya diturunkan) — supaya kesalahan/kelalaian jumlah unit
    // saat input pertama kali bisa diperbaiki tanpa hapus-tambah manual.
    const oldQty = editingGroupIds.length;
    const qty = newQty;
    const startReg = payload.nomor_register;
    const startIdPemda = payload.id_pemda;
    const startNoUrut = payload.no_urut;
    const newRegs = startReg ? generateSequentialRegisters(startReg, qty) : null;
    const newIdPemda = startIdPemda ? generateSequentialRegisters(startIdPemda, qty) : null;
    const newNoUrut = startNoUrut ? generateSequentialRegisters(startNoUrut, qty, 4) : null;
    delete payload.nomor_register;
    delete payload.id_pemda;
    delete payload.no_urut;

    const keepCount = Math.min(oldQty, qty);
    for (let i = 0; i < keepCount; i += 1) {
      const rowPayload = { ...payload };
      if (newRegs) rowPayload.nomor_register = newRegs[i];
      if (newIdPemda) rowPayload.id_pemda = newIdPemda[i];
      if (newNoUrut) rowPayload.no_urut = newNoUrut[i];
      const { error: rowError } = await supabase
        .from(schema.table)
        .update(rowPayload)
        .eq("id", editingGroupIds[i]);
      if (rowError) {
        error = rowError;
        break;
      }
    }

    if (!error && qty > oldQty) {
      // Jumlah dinaikkan: tambah unit baru melanjutkan urutan No Urut/No. Register/ID Pemda.
      const extraRows = [];
      for (let i = oldQty; i < qty; i += 1) {
        const rowPayload = { ...payload };
        if (newRegs) rowPayload.nomor_register = newRegs[i];
        if (newIdPemda) rowPayload.id_pemda = newIdPemda[i];
        if (newNoUrut) rowPayload.no_urut = newNoUrut[i];
        extraRows.push(rowPayload);
      }
      ({ error } = await supabase.from(schema.table).insert(extraRows));
    } else if (!error && qty < oldQty) {
      // Jumlah diturunkan: hapus unit paling akhir dalam grup (urutan terbesar).
      const removeIds = editingGroupIds.slice(qty);
      ({ error } = await supabase.from(schema.table).delete().in("id", removeIds));
    }
  } else if (isEdit) {
    if (newQty <= 1) {
      ({ error } = await supabase.from(schema.table).update(payload).eq("id", editingRow.id));
    } else {
      // Jumlah Unit dinaikkan saat edit satu data: data ini jadi unit pertama,
      // lalu ditambahkan (newQty - 1) unit baru dengan data sama, masing-masing
      // melanjutkan urutan No Urut/No. Register — sehingga jadi satu grup.
      const startReg = payload.nomor_register;
      const startNoUrut = payload.no_urut;
      const newRegs = startReg ? generateSequentialRegisters(startReg, newQty) : null;
      const newNoUrut = startNoUrut ? generateSequentialRegisters(startNoUrut, newQty, 4) : null;

      const firstPayload = { ...payload };
      if (newRegs) firstPayload.nomor_register = newRegs[0];
      if (newNoUrut) firstPayload.no_urut = newNoUrut[0];
      ({ error } = await supabase.from(schema.table).update(firstPayload).eq("id", editingRow.id));

      if (!error) {
        const extraRows = [];
        for (let i = 1; i < newQty; i += 1) {
          const rowPayload = { ...payload };
          if (newRegs) rowPayload.nomor_register = newRegs[i];
          if (newNoUrut) rowPayload.no_urut = newNoUrut[i];
          extraRows.push(rowPayload);
        }
        ({ error } = await supabase.from(schema.table).insert(extraRows));
      }
    }
  } else if (newQty > 1) {
    // Buat beberapa unit sekaligus dengan data sama, No. Register berurutan otomatis,
    // dan otomatis mengelompok (grup ditentukan dari nama_barang yang sama).
    const registers = generateSequentialRegisters(payload.nomor_register, newQty);
    const noUruts = payload.no_urut ? generateSequentialRegisters(payload.no_urut, newQty, 4) : null;
    const rows = registers.map((reg, i) => ({
      ...payload,
      nomor_register: reg,
      ...(noUruts ? { no_urut: noUruts[i] } : {}),
    }));
    ({ error } = await supabase.from(schema.table).insert(rows));
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
  const rows = (data || []).map((row, idx) => {
    // Kolom "No" (No urut) otomatis ditambahkan sebagai kolom pertama.
    const obj = { No: idx + 1 };
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

  // Export tabel penuh bisa berisi banyak unit kerja/tahun berbeda, jadi kop
  // di sini memakai baris kosong ({}) — baris 2 judul cukup "KIB <huruf>"
  // tanpa nama unit kerja / tahun tertentu.
  const y = drawPdfLetterhead(doc, schema, {});
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(schema.description, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // Kolom "No" (No urut) otomatis ditambahkan sebagai kolom pertama, sama
  // seperti No urut yang tampil di tabel utama.
  const headers = ["No", ...schema.fields.map((f) => f.label)];
  const body = rows.map((row, idx) => [
    String(idx + 1),
    ...schema.fields.map((f) =>
      f.type === "currency" ? formatRupiah(row[f.key]) : (row[f.key] ?? "").toString()
    ),
  ]);

  doc.autoTable({
    startY: y + 12,
    head: [headers],
    body,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
    theme: "grid",
    margin: { left: 20, right: 20 },
  });

  doc.save(`${schema.table}.pdf`);
}

// Mengambil gambar dari URL publik Supabase Storage dan mengubahnya menjadi
// data URL base64 supaya bisa disisipkan ke PDF via jsPDF.addImage. Kalau
// gagal (mis. offline / CORS), kembalikan null dan PDF tetap dibuat tanpa foto.
async function fetchImageAsDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const format = blob.type.includes("png") ? "PNG" : "JPEG";
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}

// Mengambil "tahun" otomatis dari data satu baris, sesuai `schema.yearField`
// (mis. tahun_pengadaan untuk KIB A/D, tahun_pembelian untuk KIB B, tahun
// untuk KIB E). Untuk KIB C yang cuma punya tanggal dokumen, cukup ambil
// 4 digit tahun dari tanggal itu (mis. "2024-05-01" -> "2024").
function getRecordYear(schema, row) {
  const field = schema.yearField;
  if (!field) return "";
  const raw = row[field];
  if (raw === null || raw === undefined || raw === "") return "";
  const match = String(raw).match(/\d{4}/);
  return match ? match[0] : String(raw);
}

// Menggambar kop PDF (letterhead): logo Kabupaten Brebes di kiri, dan judul
// 2 baris di kanannya — baris 1 "INVENTARIS BMD KAB.BREBES" tetap, baris 2
// "KIB <huruf> <UNIT KERJA> TAHUN <tahun>" dibuat otomatis dari data baris
// (unit kerja & tahun). Sama seperti contoh kop yang diberikan user. `row`
// boleh objek kosong ({}) untuk PDF yang tidak mewakili satu unit tertentu
// (mis. export tabel penuh) — baris 2 lalu cuma jadi "KIB <huruf>".
// Mengembalikan koordinat Y tempat konten berikutnya boleh mulai digambar.
function drawPdfLetterhead(doc, schema, row) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  const logoX = marginX;
  const logoY = 22;
  const logoW = 46;
  const logoH = 44;

  try {
    doc.addImage(BREBES_LOGO_DATA_URL, "PNG", logoX, logoY, logoW, logoH);
  } catch {
    // kalau logo gagal digambar (mis. format tidak didukung), PDF tetap dibuat tanpa logo
  }

  const unit = (row.unit_kerja || "").toString().trim().toUpperCase();
  const year = getRecordYear(schema, row);
  let line2 = `KIB ${schema.key}`;
  if (unit) line2 += ` ${unit}`;
  if (year) line2 += ` TAHUN ${year}`;

  // Judul di-tengahkan ke LEBAR HALAMAN (bukan cuma nempel di sebelah kanan
  // logo) supaya rapi seperti kop surat resmi. Lebar teks dibatasi simetris
  // (jarak dari logo di kiri = jarak dari tepi kanan) supaya tidak menabrak logo.
  const centerX = pageWidth / 2;
  const sideMargin = logoX + logoW + 16;
  const maxTextWidth = pageWidth - sideMargin * 2;

  doc.setFont(undefined, "bold");
  doc.setFontSize(13);
  const line1Wrapped = doc.splitTextToSize("INVENTARIS BMD KAB.BREBES", maxTextWidth);
  const line2Wrapped = doc.splitTextToSize(line2, maxTextWidth);

  let y = logoY + 16;
  doc.text(line1Wrapped, centerX, y, { align: "center" });
  y += line1Wrapped.length * 16 + 6;
  doc.text(line2Wrapped, centerX, y, { align: "center" });
  y += line2Wrapped.length * 16;
  doc.setFont(undefined, "normal");

  const headerBottom = Math.max(y, logoY + logoH) + 8;

  // Garis pemisah di bawah kop, rata kiri-kanan (dari margin kiri sampai
  // margin kanan halaman) — ciri khas kop surat resmi.
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(1);
  doc.line(marginX, headerBottom, pageWidth - marginX, headerBottom);

  return headerBottom + 10;
}

// Membuat PDF 1 halaman bergaya "Kartu Inventaris": tabel Field/Nilai di kiri,
// foto di kanan. Dipakai baik untuk PDF 1 data (per unit) maupun PDF Rangkuman
// grup — untuk grup, `row.nomor_register` & `row.id_pemda` sudah berisi rentang
// (mis. "000013 – 000028"). Kop (logo + judul) dibuat lewat drawPdfLetterhead();
// tidak ada teks lain di bawah kop supaya PDF selalu muat 1 halaman.
async function buildRecordPdf(schema, row, { filename, noUrut } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // Baris deskripsi KIB & subjudul rangkuman grup (jumlah unit / rentang No.
  // Register & ID Pemda) sengaja TIDAK dicetak lagi di sini — supaya tabel
  // Field/Nilai + foto selalu muat dalam 1 halaman dan PDF tidak meluber ke
  // halaman ke-2.
  const startY = drawPdfLetterhead(doc, schema, row) + 4;

  const imageField = schema.fields.find((f) => f.type === "image");
  if (imageField && row[imageField.key]) {
    const img = await fetchImageAsDataUrl(row[imageField.key]);
    if (img) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const imgWidth = 140;
      const imgHeight = 180;
      doc.addImage(img.dataUrl, img.format, pageWidth - 40 - imgWidth, startY - 5, imgWidth, imgHeight);
    }
  }

  const body = schema.fields
    .filter((f) => f.type !== "image")
    .map((f) => [f.label, f.type === "currency" ? formatRupiah(row[f.key]) : (row[f.key] ?? "").toString()]);

  doc.autoTable({
    startY,
    head: [["Field", "Nilai"]],
    body,
    styles: { fontSize: 10, cellPadding: 5 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 150 } },
    tableWidth: 300,
    theme: "grid",
  });

  doc.save(filename);
}

async function exportSingleRecordPdf(schema, row, noUrut) {
  await buildRecordPdf(schema, row, { filename: `${schema.table}_${row.id || "record"}.pdf`, noUrut });
}

// PDF Rangkuman grup: 1 halaman yang mewakili seluruh unit dalam grup (data
// diambil dari unit pertama, karena field-nya sama persis untuk semua unit),
// dengan Nomor Register DAN ID Pemda otomatis ditampilkan sebagai rentang
// (mis. "000013 – 000028"), bukan cuma nilai unit pertama saja.
async function exportGroupPdf(schema, group, noUrut) {
  const row = {
    ...group.items[0],
    nomor_register: group.regRange,
    id_pemda: group.idPemdaRange,
    no_urut: group.noUrutRange,
  };
  const safeName = String(group.name).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  await buildRecordPdf(schema, row, {
    filename: `${schema.table}_rangkuman_${safeName}.pdf`,
    noUrut,
  });
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
        const fieldByKey = {};
        schema.fields.forEach((f) => {
          labelToKey[normalizeLabel(f.label)] = f.key;
          fieldByKey[f.key] = f;
        });

        const rows = json
          .map((row) => {
            const mapped = {};
            Object.entries(row).forEach(([label, value]) => {
              const key = labelToKey[normalizeLabel(label)];
              if (!key) return;
              // Kolom harga: terima baik angka polos maupun teks berformat
              // ("Rp 1.500.000", "1.500.000") dan simpan sebagai angka murni.
              if (fieldByKey[key].type === "currency") {
                mapped[key] = parseRupiah(value);
              } else {
                mapped[key] = value;
              }
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

// ================= CETAK STIKER =================
// Fitur stiker: menu terpisah dari tabel data biasa. User memilih KIB,
// mencentang barang yang mau dicetak stikernya, lalu isi "Nomor Lokasi"
// secara manual (berlaku sama untuk semua stiker yang dicetak sekaligus,
// karena nomor lokasi mewakili lokasi unit kerja, bukan per barang).
// Semua data lain (Kode Barang, Nama Barang/Judul, No. Register, Tahun,
// Harga) diambil otomatis dari data barang yang sudah tersimpan.

function populateStikerKibSelect() {
  if (stikerKibSelect.options.length > 0) return;
  KIB_LIST.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.title;
    stikerKibSelect.appendChild(opt);
  });
}

function initStikerView() {
  populateStikerKibSelect();
  stikerKibSelect.value = stikerKibKey;
  if (!stikerLokasiInput.value) {
    stikerLokasiInput.value = localStorage.getItem(STIKER_LOKASI_STORAGE_KEY) || "";
  }
  if (stikerRows.length === 0) {
    loadStikerData();
  } else {
    renderStikerList();
    updateStikerPreview();
  }
}

stikerKibSelect.addEventListener("change", () => {
  stikerKibKey = stikerKibSelect.value;
  stikerSelectedIds = new Set();
  stikerSearch = "";
  stikerSearchInput.value = "";
  loadStikerData();
});

stikerLokasiInput.addEventListener("input", () => {
  localStorage.setItem(STIKER_LOKASI_STORAGE_KEY, stikerLokasiInput.value);
  updateStikerPreview();
});

let stikerSearchTimer = null;
stikerSearchInput.addEventListener("input", (e) => {
  stikerSearch = e.target.value;
  clearTimeout(stikerSearchTimer);
  stikerSearchTimer = setTimeout(renderStikerList, 250);
});

stikerSelectAllCheckbox.addEventListener("change", () => {
  const filtered = getStikerFilteredRows();
  if (stikerSelectAllCheckbox.checked) {
    filtered.forEach((r) => stikerSelectedIds.add(r.id));
  } else {
    filtered.forEach((r) => stikerSelectedIds.delete(r.id));
  }
  renderStikerList();
  updateStikerPreview();
});

stikerGenerateBtn.addEventListener("click", generateStikerPdf);

async function loadStikerData() {
  const schema = KIB_SCHEMAS[stikerKibKey];
  stikerListBody.innerHTML = `<tr><td class="muted center" colspan="7">Memuat data…</td></tr>`;
  stikerErrorBox.style.display = "none";
  stikerLastColHeader.textContent = stikerHasRuang(schema) ? "Ruang" : "Harga";

  const { data, error } = await supabase.from(schema.table).select("*").order("id");
  if (error) {
    stikerErrorBox.textContent = error.message;
    stikerErrorBox.style.display = "block";
    stikerRows = [];
  } else {
    stikerRows = data || [];
  }
  renderStikerList();
  updateStikerPreview();
}

// KIB E punya "Judul Buku" — kalau terisi, itu yang dipakai sebagai nama
// barang di stiker (lebih spesifik). KIB lain / kalau kosong, pakai Nama Barang.
function getStikerDisplayName(row) {
  if (row.judul_buku && String(row.judul_buku).trim()) return String(row.judul_buku).trim();
  return row.nama_barang || "-";
}

// Beberapa skema (mis. KIB E - Buku/Perpustakaan) punya field "Ruang" (ruang
// kelas/lokasi simpan buku), yang lebih berguna dicetak di stiker daripada
// Harga. Kalau skema punya field ini, stiker & daftar pilihan barang memakai
// Ruang di kolom terakhir; kalau tidak ada, tetap pakai Harga seperti biasa.
function stikerHasRuang(schema) {
  return schema.fields.some((f) => f.key === "ruang");
}

function stikerLastColValue(schema, row) {
  return stikerHasRuang(schema) ? row.ruang || "-" : formatRupiah(row.harga) || "-";
}

function getStikerFilteredRows() {
  const q = stikerSearch.trim().toLowerCase();
  if (!q) return stikerRows;
  return stikerRows.filter((r) =>
    [r.kode_barang, r.nama_barang, r.judul_buku, r.nomor_register]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

function renderStikerList() {
  const filtered = getStikerFilteredRows();

  if (filtered.length === 0) {
    stikerListBody.innerHTML = `<tr><td class="muted center" colspan="7">Tidak ada data.</td></tr>`;
  } else {
    stikerListBody.innerHTML = "";
    filtered.forEach((row, idx) => {
      const schema = KIB_SCHEMAS[stikerKibKey];
      const tr = document.createElement("tr");
      const checked = stikerSelectedIds.has(row.id);
      const lastColVal = stikerLastColValue(schema, row);
      tr.innerHTML = `
        <td><input type="checkbox" class="stiker-row-check" ${checked ? "checked" : ""} /></td>
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.kode_barang || "-")}</td>
        <td>${escapeHtml(getStikerDisplayName(row))}</td>
        <td>${escapeHtml(row.nomor_register || "-")}</td>
        <td>${escapeHtml(getRecordYear(schema, row) || "-")}</td>
        <td>${escapeHtml(String(lastColVal))}</td>
      `;
      tr.querySelector(".stiker-row-check").addEventListener("change", (e) => {
        if (e.target.checked) stikerSelectedIds.add(row.id);
        else stikerSelectedIds.delete(row.id);
        updateStikerSelectAllState(filtered);
        updateStikerCount();
        updateStikerPreview();
      });
      stikerListBody.appendChild(tr);
    });
  }

  updateStikerSelectAllState(filtered);
  updateStikerCount();
}

function updateStikerSelectAllState(filtered) {
  stikerSelectAllCheckbox.checked = filtered.length > 0 && filtered.every((r) => stikerSelectedIds.has(r.id));
}

function updateStikerCount() {
  stikerSelectedCount.textContent = `${stikerSelectedIds.size} barang dipilih`;
}

// Pratinjau memakai barang pertama yang sudah dicentang; kalau belum ada
// yang dicentang, pakai barang pertama yang tampil di daftar (biar user
// langsung lihat contoh tata letak stiker sebelum memilih).
function updateStikerPreview() {
  const schema = KIB_SCHEMAS[stikerKibKey];
  const filtered = getStikerFilteredRows();
  const previewRow = filtered.find((r) => stikerSelectedIds.has(r.id)) || filtered[0];

  if (!previewRow) {
    stikerPreview.innerHTML = `<div class="stiker-empty-hint">Belum ada data untuk dijadikan pratinjau.</div>`;
    return;
  }
  stikerPreview.innerHTML = renderStikerPreviewHtml(schema, previewRow, stikerLokasiInput.value.trim());
}

function renderStikerPreviewHtml(schema, row, nomorLokasi) {
  const unit = (row.unit_kerja || "").toString().trim().toUpperCase() || "-";
  const kodeBarang = row.kode_barang || "-";
  const namaBarang = getStikerDisplayName(row);
  const noReg = row.nomor_register || "-";
  const tahun = getRecordYear(schema, row) || "-";
  const lastColVal = stikerLastColValue(schema, row);

  return `
    <div class="stiker-row stiker-head">
      <div class="stiker-logo-cell"><img src="${BREBES_LOGO_DATA_URL}" alt="Logo Kabupaten Brebes" /></div>
      <div class="stiker-title-cell">
        <div>Barang Milik Daerah</div>
        <div>Pemerintah Kabupaten Brebes</div>
        <div>${escapeHtml(unit)}</div>
      </div>
    </div>
    <div class="stiker-row"><div class="stiker-line" style="flex:1">${escapeHtml(String(nomorLokasi || "-"))}</div></div>
    <div class="stiker-row"><div class="stiker-line" style="flex:1">${escapeHtml(String(kodeBarang))}</div></div>
    <div class="stiker-row"><div class="stiker-line stiker-line-small" style="flex:1">${escapeHtml(namaBarang)}</div></div>
    <div class="stiker-row stiker-bottom-row">
      <div class="stiker-bottom-cell">${escapeHtml(String(noReg))}</div>
      <div class="stiker-bottom-cell">${escapeHtml(String(tahun))}</div>
      <div class="stiker-bottom-cell">${escapeHtml(String(lastColVal))}</div>
    </div>
  `;
}

// Membuat PDF berisi grid stiker (2 kolom x 6 baris = 12 stiker/halaman A4)
// untuk seluruh barang yang dicentang. Tata letak tiap stiker meniru persis
// contoh fisik: logo kiri, judul 3 baris kanan, lalu baris Nomor Lokasi,
// Kode Barang, Nama Barang, dan baris bawah No.Register / Tahun / Harga.
async function generateStikerPdf() {
  const schema = KIB_SCHEMAS[stikerKibKey];
  const selectedRows = stikerRows.filter((r) => stikerSelectedIds.has(r.id));
  if (selectedRows.length === 0) {
    alert("Pilih minimal satu barang untuk dicetak stikernya.");
    return;
  }
  const nomorLokasi = stikerLokasiInput.value.trim();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const marginY = 10;
  const cols = 2;
  const rows = 6;
  const gapX = 4;
  const gapY = 4;
  const cardW = (pageWidth - marginX * 2 - gapX * (cols - 1)) / cols;
  const cardH = (pageHeight - marginY * 2 - gapY * (rows - 1)) / rows;
  const perPage = cols * rows;

  selectedRows.forEach((row, i) => {
    const posInPage = i % perPage;
    if (i > 0 && posInPage === 0) doc.addPage();
    const col = posInPage % cols;
    const r = Math.floor(posInPage / cols);
    const x = marginX + col * (cardW + gapX);
    const y = marginY + r * (cardH + gapY);
    drawStickerOnPdf(doc, schema, row, nomorLokasi, x, y, cardW, cardH);
  });

  doc.save(`stiker_kib_${schema.key.toLowerCase()}.pdf`);
}

// Palet warna stiker (modern, senada dengan warna brand di style.css:
// navy/biru tua untuk kop & footer, biru muda untuk baris info, abu-abu
// lembut untuk baris nama barang) supaya stiker tidak polos hitam-putih.
const STIKER_COLORS = {
  navy: [15, 47, 122], // kop (header)
  blue: [29, 78, 216], // baris bawah (No.Reg/Tahun/Harga)
  lokasiTint: [224, 231, 250], // baris Nomor Lokasi
  kodeTint: [255, 255, 255], // baris Kode Barang
  namaTint: [241, 245, 249], // baris Nama Barang
  border: [15, 47, 122],
  white: [255, 255, 255],
};

function drawStickerOnPdf(doc, schema, row, nomorLokasi, x, y, w, h) {
  const headerH = h * 0.26;
  const lokasiH = h * 0.15;
  const kodeH = h * 0.15;
  const namaH = h * 0.2;
  const bottomH = h - headerH - lokasiH - kodeH - namaH;
  const c = STIKER_COLORS;

  // --- latar belakang tiap baris (diisi dulu sebelum garis & teks) ---
  doc.setFillColor(...c.navy);
  doc.rect(x, y, w, headerH, "F");
  doc.setFillColor(...c.lokasiTint);
  doc.rect(x, y + headerH, w, lokasiH, "F");
  doc.setFillColor(...c.kodeTint);
  doc.rect(x, y + headerH + lokasiH, w, kodeH, "F");
  doc.setFillColor(...c.namaTint);
  doc.rect(x, y + headerH + lokasiH + kodeH, w, namaH, "F");
  doc.setFillColor(...c.blue);
  doc.rect(x, y + headerH + lokasiH + kodeH + namaH, w, bottomH, "F");

  // --- bingkai & garis pembatas (navy, lebih halus dari hitam pekat) ---
  doc.setDrawColor(...c.border);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  // --- baris header: logo kiri (di atas bidang putih bulat) + judul 3 baris kanan ---
  const logoW = w * 0.22;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(x + logoW, y, x + logoW, y + headerH);
  doc.setDrawColor(...c.border);
  doc.setLineWidth(0.3);
  doc.line(x, y + headerH, x + w, y + headerH);
  try {
    // Logo harus muat persis di dalam sel logo (lebar logoW x tinggi headerH),
    // jadi ukurannya dibatasi oleh sisi TERKECIL dari sel itu (bukan cuma
    // lebar) supaya tidak meluber ke luar garis kop / baris di bawahnya.
    // Ditambah lingkaran putih di belakang logo supaya logo tetap kontras
    // di atas latar navy (bukan cuma nempel polos).
    const logoPad = 1.2;
    const logoSize = Math.min(logoW, headerH) - logoPad * 2;
    const logoX = x + (logoW - logoSize) / 2;
    const logoY = y + (headerH - logoSize) / 2;
    doc.setFillColor(...c.white);
    doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 0.6, "F");
    doc.addImage(BREBES_LOGO_DATA_URL, "PNG", logoX, logoY, logoSize, logoSize);
  } catch {
    // kalau logo gagal digambar, stiker tetap dibuat tanpa logo
  }

  const titleCenterX = x + w / 2;
  const unit = (row.unit_kerja || "").toString().trim().toUpperCase() || "-";
  const titleLines = ["BARANG MILIK DAERAH", "PEMERINTAH KABUPATEN BREBES", unit];
  doc.setFont(undefined, "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(...c.white);
  const lineGap = headerH / (titleLines.length + 0.5);
  // Lebar teks dibatasi simetris (margin kiri = margin kanan = lebar logo)
  // supaya judul benar-benar center di TENGAH KARTU — sejajar dengan baris
  // Nomor Lokasi & Nama Barang/Judul Buku di bawahnya yang juga full-width
  // center — bukan cuma center di ruang kosong sebelah kanan logo.
  const titleMaxWidth = w - logoW * 2 - 2;
  titleLines.forEach((t, idx) => {
    const wrapped = doc.splitTextToSize(t, titleMaxWidth);
    doc.text(wrapped[0], titleCenterX, y + lineGap * (idx + 0.9), { align: "center" });
  });

  // --- baris Nomor Lokasi ---
  let curY = y + headerH;
  doc.setDrawColor(...c.border);
  doc.line(x, curY + lokasiH, x + w, curY + lokasiH);
  doc.setFontSize(7);
  doc.setTextColor(...c.navy);
  doc.text(nomorLokasi || "-", x + w / 2, curY + lokasiH / 2 + 1.2, { align: "center" });

  // --- baris Kode Barang ---
  curY += lokasiH;
  doc.line(x, curY + kodeH, x + w, curY + kodeH);
  doc.text((row.kode_barang || "-").toString(), x + w / 2, curY + kodeH / 2 + 1.2, { align: "center" });

  // --- baris Nama Barang / Judul (bisa 2 baris) ---
  curY += kodeH;
  doc.line(x, curY + namaH, x + w, curY + namaH);
  doc.setFont(undefined, "normal");
  doc.setFontSize(6.3);
  doc.setTextColor(51, 65, 85);
  const namaBarang = getStikerDisplayName(row);
  const namaWrapped = doc.splitTextToSize(namaBarang, w - 4).slice(0, 2);
  const namaLineH = namaH / (namaWrapped.length + 0.6);
  namaWrapped.forEach((t, idx) => {
    doc.text(t, x + w / 2, curY + namaLineH * (idx + 0.9), { align: "center" });
  });

  // --- baris bawah: No. Register | Tahun | Harga ---
  curY += namaH;
  const colW = w / 3;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  doc.line(x + colW, curY, x + colW, curY + bottomH);
  doc.line(x + colW * 2, curY, x + colW * 2, curY + bottomH);
  doc.setFont(undefined, "bold");
  doc.setFontSize(7.3);
  doc.setTextColor(...c.white);
  const noReg = (row.nomor_register || "-").toString();
  const tahun = getRecordYear(schema, row) || "-";
  const lastColVal = String(stikerLastColValue(schema, row));
  const bottomTextY = curY + bottomH / 2 + 1.4;
  doc.text(noReg, x + colW / 2, bottomTextY, { align: "center" });
  doc.text(tahun, x + colW * 1.5, bottomTextY, { align: "center" });
  doc.text(lastColVal, x + colW * 2.5, bottomTextY, { align: "center" });

  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
}
