const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");
const File = require("./models/File");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// static folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ================= DATABASE =================
mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ DB Error:", err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// ================= HELPER =================
const saveMetadata = async (fileName, filePath) => {
  const stats = fs.statSync(filePath);

  const file = new File({
    fileName,
    filePath,
    fileSize: stats.size,
    fileType: path.extname(fileName),
  });

  return await file.save();
};

// ================= POST /files =================
// base64 OR file URL
app.post("/files", async (req, res) => {
  try {
    const { fileName, base64, fileUrl } = req.body;

    if (!fileName || (!base64 && !fileUrl)) {
      return res.status(400).json({
        message: "fileName and (base64 or fileUrl) required",
      });
    }

    const filePath = path.join(__dirname, "uploads", fileName);

    // BASE64
    if (base64) {
      const base64Data = base64.replace(/^data:.+;base64,/, "");
      fs.writeFileSync(filePath, base64Data, "base64");
    }

    // FILE URL
    if (fileUrl) {
      const response = await axios({
        url: fileUrl,
        method: "GET",
        responseType: "stream",
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }

    const saved = await saveMetadata(fileName, filePath);

    res.json({
      message: "File uploaded successfully",
      file: saved,
    });
  } catch (error) {
    res.status(500).json({ message: "Upload error", error: error.message });
  }
});

// ================= POST /upload =================
// form-data upload
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const saved = await saveMetadata(req.file.filename, req.file.path);

    res.json({
      message: "File uploaded (multer)",
      file: saved,
    });
  } catch (error) {
    res.status(500).json({ message: "Upload error" });
  }
});

// ================= GET /files =================
app.get("/files", async (req, res) => {
  try {
    const files = await File.find().sort({ createdAt: -1 });

    res.json(files);
  } catch (error) {
    res.status(500).json({ message: "Fetch error" });
  }
});

// ================= DELETE /files/:id =================
app.delete("/files/:id", async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // delete from disk
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    // delete from DB
    await File.findByIdAndDelete(req.params.id);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Delete error" });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
