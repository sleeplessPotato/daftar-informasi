const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const dataPath = path.join(__dirname, 'data.json');
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage: storage });

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        return { categories: [], documents: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

// ==========================================
// API CRUD: KATEGORI (NEW FEATURE)
// ==========================================
app.get('/api/categories', (req, res) => {
    res.json(readDB().categories);
});

app.post('/api/categories', (req, res) => {
    const db = readDB();
    const newCat = {
        id: `CAT-${Date.now()}`,
        name: req.body.name,
        desc: req.body.desc,
        date: new Date().toISOString().split('T')[0]
    };
    db.categories.push(newCat);
    writeDB(db);
    res.json({ success: true, message: 'Kategori berhasil ditambahkan.' });
});

app.put('/api/categories/:id', (req, res) => {
    const db = readDB();
    const idx = db.categories.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    
    db.categories[idx].name = req.body.name;
    db.categories[idx].desc = req.body.desc;
    writeDB(db);
    res.json({ success: true, message: 'Kategori berhasil diperbarui.' });
});

app.delete('/api/categories/:id', (req, res) => {
    const db = readDB();
    const idx = db.categories.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });

    // CASCADE DELETE: Hapus semua file fisik & dokumen di dalam kategori ini
    const docsToDelete = db.documents.filter(d => d.categoryId === req.params.id);
    docsToDelete.forEach(doc => {
        if (doc.filePath) {
            const fullPath = path.join(__dirname, doc.filePath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
    });

    db.documents = db.documents.filter(d => d.categoryId !== req.params.id);
    db.categories.splice(idx, 1);
    writeDB(db);
    res.json({ success: true, message: 'Kategori beserta seluruh dokumen di dalamnya berhasil dihapus.' });
});

// ==========================================
// API CRUD: DOKUMEN
// ==========================================
app.get('/api/documents', (req, res) => {
    res.json(readDB().documents);
});

app.post('/api/documents', upload.single('document'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'File wajib dilampirkan.' });
    const db = readDB();
    const newDoc = {
        id: `DOC-${Date.now()}`,
        categoryId: req.body.categoryId,
        name: req.body.docName,
        size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: req.body.docDate || new Date().toISOString().split('T')[0],
        filePath: `uploads/${req.file.filename}`
    };
    db.documents.push(newDoc);
    writeDB(db);
    res.json({ success: true, message: 'Dokumen berhasil ditambahkan.' });
});

app.put('/api/documents/:id', (req, res) => {
    const db = readDB();
    const idx = db.documents.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });

    db.documents[idx].name = req.body.name;
    db.documents[idx].categoryId = req.body.categoryId;
    db.documents[idx].date = req.body.date;
    writeDB(db);
    res.json({ success: true, message: 'Dokumen berhasil diperbarui.' });
});

app.delete('/api/documents/:id', (req, res) => {
    const db = readDB();
    const idx = db.documents.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });

    const doc = db.documents[idx];
    if (doc.filePath) {
        const fullPath = path.join(__dirname, doc.filePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    db.documents.splice(idx, 1);
    writeDB(db);
    res.json({ success: true, message: 'Dokumen berhasil dihapus.' });
});

// ==========================================
// API GIT PUBLISH
// ==========================================
app.post('/api/publish', (req, res) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Gunakan git status terlebih dahulu untuk memeriksa apakah ada perubahan file
    exec('git status --porcelain', { cwd: __dirname }, (statusErr, stdout) => {
        if (statusErr) {
            return res.status(500).json({ success: false, message: `Git Status Error: ${statusErr.message}` });
        }
        
        // Jika stdout kosong, berarti tidak ada perubahan data lokal yang perlu di-push
        if (!stdout.trim()) {
            return res.json({ success: true, message: 'Tidak ada perubahan data baru yang perlu disinkronkan.' });
        }
        
        // Jika ada perubahan, baru jalankan rantai perintah Git GitOps
        const commitMessage = `Publish: Management data komprehensif [${timestamp}]`;
        const gitCommand = `git add . && git commit -m "${commitMessage}" && git push`;
        
        exec(gitCommand, { cwd: __dirname }, (error) => {
            if (error) {
                console.error(`Gagal melakukan push: ${error.message}`);
                return res.status(500).json({ success: false, message: `Gagal Push Jaringan: Pastikan kredensial login Git sudah tersimpan.` });
            }
            res.json({ success: true, message: 'Berhasil didorong ke cloud.' });
        });
    });
});

app.listen(3000, () => console.log('Server CRUD Multi-Model berjalan di port 3000'));