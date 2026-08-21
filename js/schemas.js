// Definisi kolom untuk tiap Kartu Inventaris Barang (KIB A - E)

export const KONDISI_OPTIONS = ["Baik", "Rusak Ringan", "Rusak Berat"];
export const ASAL_USUL_OPTIONS = ["Pembelian", "Bantuan", "Hibah", "Rampasan", "Sitaan", "Lain-lain"];
export const INTRA_EKSTRA_OPTIONS = ["Intra", "Ekstra"];
export const JENIS_KOLEKSI_E_OPTIONS = [
  "Buku / Perpustakaan",
  "Barang Bercorak Kesenian/Kebudayaan",
  "Hewan / Ternak",
  "Tumbuhan",
];
export const JENIS_BUKU_OPTIONS = [
  "Buku Pelajaran / Modul",
  "Buku Referensi / Ensiklopedia",
  "Buku Fiksi",
  "Buku Non-Fiksi",
  "Majalah / Jurnal",
  "Peta / Atlas",
  "Lainnya",
];

const baseIdentity = [
  { key: "id_pemda", label: "ID Pemda", type: "text" },
  { key: "kode_upb", label: "Kode UPB", type: "text" },
  { key: "unit_kerja", label: "Unit Kerja", type: "text", required: true },
  { key: "kecamatan", label: "Kecamatan", type: "text" },
  { key: "kode_barang", label: "Kode Barang", type: "text" },
  { key: "nama_barang", label: "Nama Barang", type: "text", required: true },
  { key: "nomor_register", label: "Nomor Register", type: "text" },
];

const baseTail = [
  { key: "asal_usul", label: "Asal Usul", type: "select", options: ASAL_USUL_OPTIONS },
  { key: "harga", label: "Harga (Rp)", type: "number" },
  { key: "keterangan", label: "Keterangan", type: "textarea" },
  { key: "upb", label: "UPB", type: "text" },
  { key: "intra_ekstra", label: "Intra/Ekstra", type: "select", options: INTRA_EKSTRA_OPTIONS },
];

export const KIB_SCHEMAS = {
  A: {
    key: "A",
    table: "aset_kib_a",
    title: "KIB A - Tanah",
    description: "Kartu Inventaris Barang A: Tanah",
    fields: [
      ...baseIdentity,
      { key: "luas_m2", label: "Luas (m²)", type: "number" },
      { key: "tahun_pengadaan", label: "Tahun Pengadaan", type: "number" },
      { key: "alamat", label: "Alamat / Letak Tanah", type: "text" },
      { key: "status_hak", label: "Status Hak", type: "text" },
      { key: "nomor_sertifikat", label: "Nomor Sertifikat", type: "text" },
      { key: "tanggal_sertifikat", label: "Tanggal Sertifikat", type: "date" },
      { key: "penggunaan", label: "Penggunaan", type: "text" },
      ...baseTail,
    ],
  },
  B: {
    key: "B",
    table: "aset_kib_b",
    title: "KIB B - Peralatan dan Mesin",
    description: "Kartu Inventaris Barang B: Peralatan dan Mesin",
    fields: [
      ...baseIdentity,
      { key: "merk_type", label: "Merk / Tipe", type: "text" },
      { key: "ukuran_cc", label: "Ukuran / CC", type: "text" },
      { key: "bahan", label: "Bahan", type: "text" },
      { key: "tahun_pembelian", label: "Tahun Pembelian", type: "number" },
      { key: "nomor_rangka", label: "Nomor Rangka", type: "text" },
      { key: "nomor_mesin", label: "Nomor Mesin", type: "text" },
      { key: "nomor_polisi", label: "Nomor Polisi", type: "text" },
      { key: "nomor_bpkb", label: "Nomor BPKB", type: "text" },
      { key: "kondisi", label: "Kondisi", type: "select", options: KONDISI_OPTIONS },
      ...baseTail,
    ],
  },
  C: {
    key: "C",
    table: "aset_kib_c",
    title: "KIB C - Gedung dan Bangunan",
    description: "Kartu Inventaris Barang C: Gedung dan Bangunan",
    fields: [
      ...baseIdentity,
      { key: "kondisi_bangunan", label: "Kondisi Bangunan", type: "select", options: KONDISI_OPTIONS },
      { key: "konstruksi", label: "Konstruksi Bangunan", type: "text" },
      { key: "luas_lantai_m2", label: "Luas Lantai (m²)", type: "number" },
      { key: "letak_alamat", label: "Letak / Alamat", type: "text" },
      { key: "tanggal_dokumen", label: "Tanggal Dokumen", type: "date" },
      { key: "nomor_dokumen", label: "Nomor Dokumen", type: "text" },
      { key: "luas_tanah_bangunan_m2", label: "Luas Tanah Bangunan (m²)", type: "number" },
      { key: "status_tanah", label: "Status Tanah", type: "text" },
      { key: "nomor_kode_tanah", label: "Nomor Kode Tanah", type: "text" },
      ...baseTail,
    ],
  },
  D: {
    key: "D",
    table: "aset_kib_d",
    title: "KIB D - Jalan, Irigasi, dan Jaringan",
    description: "Kartu Inventaris Barang D: Jalan, Irigasi, dan Jaringan",
    fields: [
      ...baseIdentity,
      { key: "kondisi", label: "Kondisi", type: "select", options: KONDISI_OPTIONS },
      { key: "konstruksi", label: "Konstruksi", type: "text" },
      { key: "panjang_m", label: "Panjang (m)", type: "number" },
      { key: "lebar_m", label: "Lebar (m)", type: "number" },
      { key: "luas_m2", label: "Luas (m²)", type: "number" },
      { key: "letak_lokasi", label: "Letak / Lokasi", type: "text" },
      { key: "tahun_pengadaan", label: "Tahun Pengadaan", type: "number" },
      { key: "tanggal_dokumen", label: "Tanggal Dokumen", type: "date" },
      { key: "nomor_dokumen", label: "Nomor Dokumen", type: "text" },
      ...baseTail,
    ],
  },
  E: {
    key: "E",
    table: "aset_kib_e",
    title: "KIB E - Aset Tetap Lainnya",
    description: "Buku/Perpustakaan, Barang Bercorak Kesenian/Kebudayaan, Hewan/Ternak dan Tumbuhan",
    // Kolom yang ditampilkan di tabel depan (urut sesuai kebutuhan: jenis buku,
    // judul buku, harga, tahun), berbeda dari KIB A-D yang memakai 7 field identitas.
    displayFields: [
      "foto_url",
      "nomor_register",
      "nama_barang",
      "jenis_koleksi",
      "jenis_buku",
      "judul_buku",
      "harga",
      "tahun",
      "kondisi",
    ],
    searchFields: ["nama_barang", "judul_buku", "jenis_buku", "pengarang", "nomor_register"],
    fields: [
      ...baseIdentity,
      { key: "jenis_koleksi", label: "Jenis Koleksi", type: "select", options: JENIS_KOLEKSI_E_OPTIONS, required: true },
      { key: "jenis_buku", label: "Jenis Buku", type: "select", options: JENIS_BUKU_OPTIONS },
      { key: "judul_buku", label: "Judul Buku", type: "text" },
      { key: "foto_url", label: "Foto Buku", type: "image" },
      { key: "pengarang", label: "Pengarang / Penulis", type: "text" },
      { key: "penerbit", label: "Penerbit", type: "text" },
      { key: "isbn", label: "ISBN", type: "text" },
      { key: "spesifikasi", label: "Spesifikasi", type: "text" },
      { key: "asal_daerah", label: "Asal Daerah (Kesenian)", type: "text" },
      { key: "pencipta", label: "Pencipta (Kesenian)", type: "text" },
      { key: "bahan", label: "Bahan (Hewan/Tumbuhan)", type: "text" },
      { key: "jenis_hewan_tumbuhan", label: "Jenis (Hewan/Tumbuhan)", type: "text" },
      { key: "ukuran", label: "Ukuran", type: "text" },
      { key: "jumlah", label: "Jumlah", type: "number" },
      { key: "tahun", label: "Tahun Cetak/Pembelian", type: "number" },
      { key: "kondisi", label: "Kondisi", type: "select", options: KONDISI_OPTIONS },
      ...baseTail,
    ],
  },
};

export const KIB_LIST = Object.values(KIB_SCHEMAS);

export function emptyRecord(schema) {
  const rec = {};
  schema.fields.forEach((f) => (rec[f.key] = ""));
  return rec;
}
