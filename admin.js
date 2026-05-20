const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // Modul eksekusi terminal bawaan Node.js

const app = express();
app.use(express.static(__dirname));

// Memastikan folder 'uploads' tersedia
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("Direktori 'uploads' dibuat secara otomatis.");
}

// Konfigurasi Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage: storage });

// Endpoint utama
app.post('/api/upload', upload.single('document'), (req, res) => {
    const dataPath = path.join(__dirname, 'data.json');
    
    // 1. Pemrosesan JSON
    let db;
    try {
        db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        return res.status(500).send("Error membaca database lokal.");
    }
    
    const newDoc = {
        id: `DOC-${Date.now()}`,
        categoryId: req.body.categoryId,
        name: req.body.docName,
        size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: new Date().toISOString().split('T')[0],
        filePath: `uploads/${req.file.filename}`
    };
    
    db.documents.push(newDoc);
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
    
    // 2. Eksekusi GitOps (Sinkronisasi Otomatis)
    const commitMessage = `Auto-upload: Menambahkan ${req.body.docName}`;
    const gitCommand = `git add . && git commit -m "${commitMessage}" && git push`;

    console.log("Memulai sinkronisasi ke repositori jarak jauh...");
    
    exec(gitCommand, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Kegagalan Git: ${error.message}`);
            return res.status(500).send(`
                <div style="font-family: sans-serif; padding: 20px;">
                    <h3 style="color: #ef4444;">❌ File tersimpan lokal, namun sinkronisasi Git gagal.</h3>
                    <pre style="background: #f3f4f6; padding: 10px; border-radius: 5px;">${error.message}</pre>
                    <a href="/admin.html" style="color: #2563eb;">Kembali</a>
                </div>
            `);
        }

        console.log(`Sinkronisasi berhasil: ${stdout}`);
        
        // 3. Respons akhir ke pengguna jika semua berhasil
        res.send(`
            <div style="font-family: sans-serif; padding: 20px; text-align: center; max-width: 500px; margin: 0 auto;">
                <h3 style="color: #10b981;">✅ Tersinkronisasi!</h3>
                <p>File <strong>${req.body.docName}</strong> telah diunggah dan pembaruan sedang dikirim ke hosting (Vercel/GitHub Pages).</p>
                <p style="font-size: 0.9em; color: #6b7280; margin-bottom: 20px;">Perubahan akan tayang di situs publik dalam 1-3 menit.</p>
                <a href="/admin.html" style="padding: 10px 15px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px;">Unggah File Lain</a>
                <a href="/index.html" style="padding: 10px 15px; background: #374151; color: white; text-decoration: none; border-radius: 5px;">Lihat Katalog Lokal</a>
            </div>
        `);
    });
});

app.listen(3000, () => {
    console.log('Server Admin berjalan di http://localhost:3000');
    console.log('Menunggu instruksi unggah...');
});