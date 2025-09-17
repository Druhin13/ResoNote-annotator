import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const DATA_DIR = path.join(__dirname, "data");
const TAGS_PATH = path.join(DATA_DIR, "all_unique_tags_cleaned_human_reviewed.json");
const TRACKS_PATH = path.join(DATA_DIR, "eval.json");
const ANNOTATIONS_DIR = path.join(DATA_DIR, "annotations");
const INDEX_PATH = path.join(ANNOTATIONS_DIR, "_index.json");

if (!fs.existsSync(ANNOTATIONS_DIR))
  fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
if (!fs.existsSync(INDEX_PATH))
  fs.writeFileSync(
    INDEX_PATH,
    JSON.stringify({ by_track: {}, total: 0 }, null, 2)
  );

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/tags", (req, res) => {
  try {
    const raw = fs.readFileSync(TAGS_PATH, "utf8");
    const tags = JSON.parse(raw);
    res.json(tags);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tags" });
  }
});

app.get("/api/tracks", (req, res) => {
  try {
    const raw = fs.readFileSync(TRACKS_PATH, "utf8");
    const tracks = JSON.parse(raw);
    res.json(tracks);
  } catch (e) {
    res.status(500).json({ error: "Failed to load tracks" });
  }
});

app.post("/api/annotate", (req, res) => {
  try {
    const { track_id, selections } = req.body;
    if (!track_id || !selections)
      return res
        .status(400)
        .json({ error: "track_id and selections required" });
    const record = { track_id, selections, saved_at: new Date().toISOString() };
    const outPath = path.join(ANNOTATIONS_DIR, `${track_id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
    const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
    idx.by_track[track_id] = {
      path: `annotations/${track_id}.json`,
      saved_at: record.saved_at,
    };
    idx.total = Object.keys(idx.by_track).length;
    fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save annotation" });
  }
});

app.get("/api/annotation/:trackId", (req, res) => {
  try {
    const outPath = path.join(ANNOTATIONS_DIR, `${req.params.trackId}.json`);
    if (!fs.existsSync(outPath)) return res.json(null);
    const raw = fs.readFileSync(outPath, "utf8");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: "Failed to read annotation" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {});