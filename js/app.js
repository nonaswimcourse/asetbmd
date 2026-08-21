import { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } from "./config.js";
import { KIB_SCHEMAS, KIB_LIST, emptyRecord } from "./schemas.js";
import { BREBES_LOGO_DATA_URL } from "./logo.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_SIZE = 15;

// Menyimpan File foto yang baru dipilih tapi belum diunggah, per field key,
// selama modal tambah/edit terbuka. Direset tiap modal dibuka/ditutup.
let pendingPhotoFiles = {};

// ---------- state ----------
let activeKibKey = "A";
let page = 0;
let search = "";
let totalCount = 0;
let editingRow = null; // record currently in the add/edit modal
let editingGroupIds = null; // saat mengedit satu grup sekaligus: daftar id unit yang akan ikut diupdate
let deleteTarget = null;
let groupedView = true; // tampilan tabel dikelompokkan otomatis berdasarkan Nama Barang

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

const formModalOverlay = document.getElementById("formModalOverlay");
const formModalTitle = document.getElementById("formModalTitle");
const formModalClose = document.getElementById("formModalClose");
const assetForm = document.getElementById("assetForm");
const formGrid = document.getElementById("formGrid");
const formCancelBtn = document.getElementById("formCancelBtn");
const formSaveBtn = document.getElementById("formSaveBtn");
const batchSection = document.getElementById("batchSection");
const batchQtyInput = document.getElementById("batchQtyInput");

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

function searchableColumns(schema) {
  if (schema.searchFields) return schema.searchFields;
  return schema.fields
    .filter((f) => f.type === "text")
    .slice(0, 4)
    .map((f) => f.key);
}

// Mengembalikan daftar field yang dipakai sebagai kolom tabel depan.
// Kalau skema mendefinisikan `displayFields` (daftar key), pakai itu;
// kalau tidak, jatuh ke default: 7 field pertama pada skema.
function getDisplayFields(schema) {
  if (schema.displayFields) {
    return schema.displayFields
      .map((key) => schema.fields.find((f) => f.key === key))
      .filter(Boolean);
  }
  return schema.fields.slice(0, 7);
}

async function loadData() {
  const schema = currentSchema();
  pageTitle.textContent = schema.title;
  pageDesc.textContent = schema.description;
  errorBox.style.display = "none";

  if (groupedView) {
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
      displayFields.map((f) => `<td>${renderCell(f, row)}</td>`).join("") +
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

// Merender satu sel tabel sesuai tipe field: thumbnail untuk "image",
// teks biasa (di-escape) untuk tipe lainnya.
function renderCell(f, row) {
  if (f.type === "image") {
    const url = row[f.key];
    return url
      ? `<img src="${escapeHtml(url)}" alt="foto" class="table-thumb" />`
      : `<span class="muted">-</span>`;
  }
  return escapeHtml(row[f.key] ?? "-");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
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
    return {
      name,
      items,
      count: items.length,
      regRange: rangeLabel(sortedRegs),
      regStart: sortedRegs[0] || "",
      idPemdaRange: rangeLabel(sortedIdPemda),
      idPemdaStart: sortedIdPemda[0] || "",
    };
  });
}

function renderGroupedTable(schema, rows) {
  // Kolom grup = displayFields skema, tapi "Nomor Register" diganti kolom
  // "Rentang No. Register" dan ditambah "Jumlah Unit" (karena tiap grup
  // berisi banyak unit dengan No. Register berbeda-beda).
  const baseFields = getDisplayFields(schema).filter((f) => f.key !== "nomor_register");

  tableHeadRow.innerHTML =
    baseFields.map((f) => `<th>${f.label}</th>`).join("") +
    `<th>Jumlah Unit</th><th>Rentang No. Register</th><th>Aksi</th>`;

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td class="muted center" colspan="${
      baseFields.length + 3
    }">Belum ada data. Klik "Tambah Data" untuk mulai mengisi.</td></tr>`;
    return;
  }

  const groups = groupRowsByName(rows);
  tableBody.innerHTML = "";

  groups.forEach((group) => {
    const sample = group.items[0]; // wakili data yang sama di seluruh grup

    const tr = document.createElement("tr");
    tr.className = "group-row";
    tr.innerHTML =
      baseFields.map((f) => `<td>${renderCell(f, sample)}</td>`).join("") +
      `<td><span class="group-count-badge">${group.count} unit</span></td>
       <td>${escapeHtml(group.regRange)}</td>
       <td class="actions-cell">
         <button class="link-btn" data-action="edit-group">Edit</button>
         <button class="link-btn" data-action="pdf-group">⬇ PDF Rangkuman</button>
       </td>`;

    tr.querySelector('[data-action="edit-group"]').addEventListener("click", () => openGroupEditModal(schema, group));
    tr.querySelector('[data-action="pdf-group"]').addEventListener("click", () => exportGroupPdf(schema, group));

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
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
    }
    input.name = f.key;
    input.value = record[f.key] ?? "";
    if (f.required) input.required = true;

    // Saat edit grup: No. Register & ID Pemda berbeda per unit. Field ini TIDAK
    // dikunci — nilai yang diisi di sini dipakai sebagai nilai AWAL, lalu saat
    // disimpan setiap unit dalam grup otomatis mendapat nilai berurutan
    // (unit 1 = nilai awal, unit 2 = nilai berikutnya, dst).
    if (isGroupEdit && (f.key === "nomor_register" || f.key === "id_pemda")) {
      wrap.classList.add("group-sequential");
      const rangeText = f.key === "nomor_register" ? record.regRangeLabel : record.idPemdaRangeLabel;
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

  // Otomatisasi No. Register (batch) hanya berlaku saat menambah data baru
  batchQtyInput.value = "1";
  batchSection.style.display = isEdit || isGroupEdit ? "none" : "block";

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
    regRangeLabel: group.regRange,
    idPemdaRangeLabel: group.idPemdaRange,
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
function generateSequentialRegisters(startReg, qty) {
  const raw = (startReg ?? "").toString().trim();
  const match = raw.match(/^(.*?)(\d+)(\D*)$/);
  let prefix = "";
  let suffix = "";
  let width = 3;
  let start = 1;
  if (match) {
    prefix = match[1];
    suffix = match[3];
    width = Math.max(match[2].length, 3);
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
    payload[f.key] = val;
  });
  Object.assign(payload, uploadedUrls);

  const isGroupEdit = Boolean(editingGroupIds && editingGroupIds.length);
  const isEdit = !isGroupEdit && Boolean(editingRow && editingRow.id);
  const batchQty = isEdit || isGroupEdit ? 1 : Math.max(1, parseInt(batchQtyInput.value, 10) || 1);

  formSaveBtn.textContent = "Menyimpan…";

  let error;
  if (isGroupEdit) {
    // Edit grup: field biasa (termasuk foto) diterapkan sama ke semua unit.
    // No. Register & ID Pemda diperlakukan khusus — nilai yang diisi di form
    // dipakai sebagai nilai AWAL, lalu dibuat berurutan otomatis untuk tiap
    // unit dalam grup (unit ke-1 = nilai awal, unit ke-2 = nilai berikutnya,
    // dst), jadi tiap unit tetap punya No. Register & ID Pemda yang berbeda.
    const qty = editingGroupIds.length;
    const startReg = payload.nomor_register;
    const startIdPemda = payload.id_pemda;
    const newRegs = startReg ? generateSequentialRegisters(startReg, qty) : null;
    const newIdPemda = startIdPemda ? generateSequentialRegisters(startIdPemda, qty) : null;
    delete payload.nomor_register;
    delete payload.id_pemda;

    for (let i = 0; i < editingGroupIds.length; i += 1) {
      const rowPayload = { ...payload };
      if (newRegs) rowPayload.nomor_register = newRegs[i];
      if (newIdPemda) rowPayload.id_pemda = newIdPemda[i];
      const { error: rowError } = await supabase
        .from(schema.table)
        .update(rowPayload)
        .eq("id", editingGroupIds[i]);
      if (rowError) {
        error = rowError;
        break;
      }
    }
  } else if (isEdit) {
    ({ error } = await supabase.from(schema.table).update(payload).eq("id", editingRow.id));
  } else if (batchQty > 1) {
    // Buat beberapa unit sekaligus dengan data sama, No. Register berurutan otomatis,
    // dan otomatis mengelompok (grup ditentukan dari nama_barang yang sama).
    const registers = generateSequentialRegisters(payload.nomor_register, batchQty);
    const rows = registers.map((reg) => ({ ...payload, nomor_register: reg }));
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

  // Export tabel penuh bisa berisi banyak unit kerja/tahun berbeda, jadi kop
  // di sini memakai baris kosong ({}) — baris 2 judul cukup "KIB <huruf>"
  // tanpa nama unit kerja / tahun tertentu.
  const y = drawPdfLetterhead(doc, schema, {});
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(schema.description, doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);

  const headers = schema.fields.map((f) => f.label);
  const keys = schema.fields.map((f) => f.key);
  const body = rows.map((row) => keys.map((k) => (row[k] ?? "").toString()));

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
async function buildRecordPdf(schema, row, { filename } = {}) {
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
    .map((f) => [f.label, (row[f.key] ?? "").toString()]);

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

async function exportSingleRecordPdf(schema, row) {
  await buildRecordPdf(schema, row, { filename: `${schema.table}_${row.id || "record"}.pdf` });
}

// PDF Rangkuman grup: 1 halaman yang mewakili seluruh unit dalam grup (data
// diambil dari unit pertama, karena field-nya sama persis untuk semua unit),
// dengan Nomor Register DAN ID Pemda otomatis ditampilkan sebagai rentang
// (mis. "000013 – 000028"), bukan cuma nilai unit pertama saja.
async function exportGroupPdf(schema, group) {
  const row = { ...group.items[0], nomor_register: group.regRange, id_pemda: group.idPemdaRange };
  const safeName = String(group.name).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  await buildRecordPdf(schema, row, {
    filename: `${schema.table}_rangkuman_${safeName}.pdf`,
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
